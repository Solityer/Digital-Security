"""
api/authz.py
RBAC + ABAC authorization evaluation endpoints for 数智安行 platform.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, AuthorizationPolicy, Contract
from app.schemas import AuthzEvaluateRequest, AuthzEvaluateResponse, AuthzPolicyCreate, AuthzPolicyResponse
from app.services.audit_service import create_audit_log

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _check_rbac(user_id: int, required_roles: list[str], context_attrs: dict) -> bool:
    """
    Simple RBAC check: pass if user_id matches policy.user_id and
    the user's role (from context_attrs) is in policy's rbac_roles.
    If no role constraint, any authenticated user passes.
    """
    user_role = context_attrs.get("role", "analyst")
    if not required_roles:
        return True
    return user_role in required_roles


def _check_abac(user_attrs: dict[str, Any], policy_attrs: dict[str, Any]) -> bool:
    """
    ABAC check: every (key, value) in policy_attrs must match user_attrs.
    Empty policy_attrs → passes.
    """
    if not policy_attrs:
        return True
    for key, required_val in policy_attrs.items():
        user_val = user_attrs.get(key)
        if user_val != required_val:
            return False
    return True


def _contract_valid(contract: Contract) -> tuple[bool, str]:
    """Check whether a contract is active and within its validity period."""
    status_val = contract.status if isinstance(contract.status, str) else contract.status.value
    if status_val != "active":
        return False, f"Contract status is '{status_val}' (not active)"

    now = datetime.utcnow()
    if contract.valid_from and now < contract.valid_from:
        return False, f"Contract not yet valid (valid_from={contract.valid_from})"
    if contract.valid_until and now > contract.valid_until:
        return False, "Contract has expired"

    return True, "active"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/evaluate", response_model=AuthzEvaluateResponse)
async def evaluate_authorization(
    body: AuthzEvaluateRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthzEvaluateResponse:
    """
    Evaluate RBAC + ABAC policy for a user/asset/operation combination.

    Returns allowed, reason, matched_policy_id.
    """
    # 1. Check asset exists
    asset_row = await db.execute(select(Asset).where(Asset.id == body.asset_id))
    asset: Asset | None = asset_row.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {body.asset_id} not found.")

    # 2. Gather applicable policies for this asset + user
    policy_stmt = select(AuthorizationPolicy).where(
        AuthorizationPolicy.asset_id == body.asset_id
    )
    if body.user_id:
        policy_stmt = policy_stmt.where(
            (AuthorizationPolicy.user_id == body.user_id)
            | (AuthorizationPolicy.user_id.is_(None))
        )
    policy_rows = await db.execute(policy_stmt)
    policies: list[AuthorizationPolicy] = list(policy_rows.scalars().all())

    # Also gather policies tied to any active contract for this user+asset
    contract_policies: list[AuthorizationPolicy] = []
    if body.user_id:
        contract_stmt = (
            select(AuthorizationPolicy)
            .join(Contract, AuthorizationPolicy.contract_id == Contract.id)
            .where(
                (AuthorizationPolicy.user_id == body.user_id)
                | (AuthorizationPolicy.user_id.is_(None))
            )
            .where(Contract.status == "active")
        )
        cp_rows = await db.execute(contract_stmt)
        contract_policies = list(cp_rows.scalars().all())

    all_policies = policies + contract_policies

    # 3. Evaluate
    matched_policy_id = None
    rbac_ok = False
    abac_ok = False
    allowed = False
    reason = "No matching authorization policy found."

    for policy in all_policies:
        op_list: list[str] = policy.allowed_operations or []
        if body.operation not in op_list and op_list:
            continue  # operation not in policy

        rbac_result = _check_rbac(body.user_id or 0, policy.rbac_roles, body.context_attrs)
        abac_result = _check_abac(body.context_attrs, policy.abac_attrs)

        if rbac_result and abac_result:
            allowed = True
            matched_policy_id = policy.id
            rbac_ok = True
            abac_ok = True
            reason = (
                f"Access granted by policy #{policy.id}: "
                f"operation '{body.operation}' allowed."
            )
            break
        else:
            if not rbac_result:
                reason = f"RBAC check failed for policy #{policy.id}: role not permitted."
            elif not abac_result:
                reason = f"ABAC check failed for policy #{policy.id}: attribute mismatch."

    audit_result = "success" if allowed else "failure"
    await create_audit_log(
        db,
        username=body.context_attrs.get("username", f"user:{body.user_id}"),
        role=body.context_attrs.get("role", "unknown"),
        action="authz_evaluate",
        target_type="asset",
        target_id=str(body.asset_id),
        result=audit_result,
        detail={
            "user_id": body.user_id,
            "operation": body.operation,
            "allowed": allowed,
            "reason": reason,
            "matched_policy_id": matched_policy_id,
        },
        user_id=body.user_id,
    )

    return AuthzEvaluateResponse(
        allowed=allowed,
        matched_policy_id=matched_policy_id,
        reason=reason,
    )


@router.post("/policies", status_code=status.HTTP_201_CREATED, response_model=AuthzPolicyResponse)
async def create_policy(
    body: AuthzPolicyCreate,
    db: AsyncSession = Depends(get_db),
) -> AuthorizationPolicy:
    """Create a standalone AuthorizationPolicy."""
    policy = AuthorizationPolicy(
        contract_id=body.contract_id,
        user_id=body.user_id,
        asset_id=body.asset_id,
        rbac_roles=body.rbac_roles,
        abac_attrs=body.abac_attrs,
        allowed_operations=body.allowed_operations,
    )
    db.add(policy)
    await db.flush()
    await db.refresh(policy)
    return policy


@router.get("/policies")
async def list_policies(
    asset_id: int | None = None,
    user_id: int | None = None,
    contract_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List authorization policies with optional filters."""
    stmt = select(AuthorizationPolicy)
    if asset_id is not None:
        stmt = stmt.where(AuthorizationPolicy.asset_id == asset_id)
    if user_id is not None:
        stmt = stmt.where(AuthorizationPolicy.user_id == user_id)
    if contract_id is not None:
        stmt = stmt.where(AuthorizationPolicy.contract_id == contract_id)

    rows = await db.execute(stmt)
    policies = rows.scalars().all()
    return {
        "total": len(policies),
        "items": [
            {
                "id": p.id,
                "contract_id": p.contract_id,
                "user_id": p.user_id,
                "asset_id": p.asset_id,
                "rbac_roles": p.rbac_roles,
                "abac_attrs": p.abac_attrs,
                "allowed_operations": p.allowed_operations,
                "created_at": p.created_at,
            }
            for p in policies
        ],
    }

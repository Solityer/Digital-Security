"""
api/contracts.py
Data-sharing contract lifecycle endpoints for 数智安行 platform.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Contract, AuthorizationPolicy, User
from app.schemas import ContractCreate, ContractUpdate
from app.services.audit_service import create_audit_log

router = APIRouter()


async def _get_default_user_ids(db: AsyncSession) -> tuple[int | None, int | None]:
    provider_row = await db.execute(select(User).where(User.username == "admin").limit(1))
    consumer_row = await db.execute(select(User).where(User.username == "demo").limit(1))
    provider = provider_row.scalar_one_or_none()
    consumer = consumer_row.scalar_one_or_none()
    return provider.id if provider else None, consumer.id if consumer else None


async def _get_usernames(db: AsyncSession, ids: list[int | None]) -> dict[int, str]:
    wanted_ids = [user_id for user_id in ids if user_id is not None]
    if not wanted_ids:
        return {}
    rows = await db.execute(select(User).where(User.id.in_(wanted_ids)))
    return {user.id: user.username for user in rows.scalars().all()}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_contract_hash(title: str, provider_id, consumer_id, ts: str) -> str:
    payload = f"{title}|{provider_id}|{consumer_id}|{ts}"
    return hashlib.sha256(payload.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new data-sharing contract (starts as draft) and its AuthorizationPolicy."""
    ts = datetime.utcnow().isoformat()
    default_provider_id, default_consumer_id = await _get_default_user_ids(db)
    provider_id = body.provider_id if body.provider_id is not None else default_provider_id
    consumer_id = body.consumer_id if body.consumer_id is not None else default_consumer_id
    contract_hash = body.contract_hash or _make_contract_hash(
        body.title, provider_id, consumer_id, ts
    )

    contract = Contract(
        title=body.title,
        provider_id=provider_id,
        consumer_id=consumer_id,
        purpose=body.purpose,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        accessible_fields=body.accessible_fields,
        allowed_algorithms=body.allowed_algorithms,
        privacy_budget_limit=body.privacy_budget_limit,
        status=body.status,
        contract_hash=contract_hash,
    )
    db.add(contract)
    await db.flush()
    await db.refresh(contract)

    # Create default AuthorizationPolicy
    policy = AuthorizationPolicy(
        contract_id=contract.id,
        user_id=consumer_id,
        asset_id=None,
        rbac_roles=["analyst"],
        abac_attrs={},
        allowed_operations=body.allowed_algorithms or ["read"],
    )
    db.add(policy)
    await db.flush()

    await create_audit_log(
        db,
        username="system",
        role="admin",
        action="create_contract",
        target_type="contract",
        target_id=str(contract.id),
        result="success",
        detail={
            "title": contract.title,
            "status": contract.status,
            "contract_hash": contract_hash,
            "provider_id": provider_id,
            "consumer_id": consumer_id,
        },
    )

    user_names = await _get_usernames(db, [provider_id, consumer_id])

    return {
        "id": contract.id,
        "contract_id": contract.id,
        "title": contract.title,
        "provider_id": contract.provider_id,
        "consumer_id": contract.consumer_id,
        "provider": user_names.get(contract.provider_id or -1, f"机构#{contract.provider_id}" if contract.provider_id else "未指定"),
        "consumer": user_names.get(contract.consumer_id or -1, f"机构#{contract.consumer_id}" if contract.consumer_id else "未指定"),
        "purpose": contract.purpose,
        "valid_from": contract.valid_from,
        "valid_until": contract.valid_until,
        "accessible_fields": contract.accessible_fields,
        "allowed_algorithms": contract.allowed_algorithms,
        "privacy_budget_limit": contract.privacy_budget_limit,
        "status": contract.status,
        "contract_hash": contract.contract_hash,
        "created_at": contract.created_at,
        "updated_at": contract.updated_at,
    }


@router.get("")
async def list_contracts(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    status: str | None = Query(None),
    provider_id: int | None = Query(None),
    consumer_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List contracts with optional filters."""
    stmt = select(Contract)
    count_stmt = select(func.count()).select_from(Contract)

    if status:
        stmt = stmt.where(Contract.status == status)
        count_stmt = count_stmt.where(Contract.status == status)
    if provider_id is not None:
        stmt = stmt.where(Contract.provider_id == provider_id)
        count_stmt = count_stmt.where(Contract.provider_id == provider_id)
    if consumer_id is not None:
        stmt = stmt.where(Contract.consumer_id == consumer_id)
        count_stmt = count_stmt.where(Contract.consumer_id == consumer_id)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Contract.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    contracts = rows.scalars().all()

    user_names = await _get_usernames(
        db,
        [value for contract in contracts for value in (contract.provider_id, contract.consumer_id)],
    )

    items = [
        {
            "id": c.id,
            "contract_id": c.id,
            "title": c.title,
            "provider_id": c.provider_id,
            "consumer_id": c.consumer_id,
            "provider": user_names.get(c.provider_id or -1, f"机构#{c.provider_id}" if c.provider_id else "未指定"),
            "consumer": user_names.get(c.consumer_id or -1, f"机构#{c.consumer_id}" if c.consumer_id else "未指定"),
            "purpose": c.purpose,
            "valid_from": c.valid_from,
            "valid_until": c.valid_until,
            "accessible_fields": c.accessible_fields,
            "allowed_algorithms": c.allowed_algorithms,
            "privacy_budget_limit": c.privacy_budget_limit,
            "status": c.status,
            "contract_hash": c.contract_hash,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        }
        for c in contracts
    ]
    return {"total": total, "items": items}


@router.get("/{contract_id}")
async def get_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single contract with its authorization policies."""
    row = await db.execute(select(Contract).where(Contract.id == contract_id))
    contract: Contract | None = row.scalar_one_or_none()
    if contract is None:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")

    policy_rows = await db.execute(
        select(AuthorizationPolicy).where(AuthorizationPolicy.contract_id == contract_id)
    )
    policies = [
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
        for p in policy_rows.scalars().all()
    ]

    user_names = await _get_usernames(db, [contract.provider_id, contract.consumer_id])

    return {
        "id": contract.id,
        "contract_id": contract.id,
        "title": contract.title,
        "provider_id": contract.provider_id,
        "consumer_id": contract.consumer_id,
        "provider": user_names.get(contract.provider_id or -1, f"机构#{contract.provider_id}" if contract.provider_id else "未指定"),
        "consumer": user_names.get(contract.consumer_id or -1, f"机构#{contract.consumer_id}" if contract.consumer_id else "未指定"),
        "purpose": contract.purpose,
        "valid_from": contract.valid_from,
        "valid_until": contract.valid_until,
        "accessible_fields": contract.accessible_fields,
        "allowed_algorithms": contract.allowed_algorithms,
        "privacy_budget_limit": contract.privacy_budget_limit,
        "status": contract.status,
        "contract_hash": contract.contract_hash,
        "created_at": contract.created_at,
        "updated_at": contract.updated_at,
        "authorization_policies": policies,
    }


async def _transition_contract(
    db: AsyncSession,
    contract_id: int,
    expected_status: str,
    new_status: str,
    action: str,
) -> dict:
    row = await db.execute(select(Contract).where(Contract.id == contract_id))
    contract: Contract | None = row.scalar_one_or_none()
    if contract is None:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")

    current = contract.status if isinstance(contract.status, str) else contract.status.value
    if expected_status and current != expected_status:
        raise HTTPException(
            status_code=409,
            detail=f"Contract must be in '{expected_status}' state to {action}. Current: {current}",
        )

    contract.status = new_status
    await db.flush()

    await create_audit_log(
        db,
        username="system",
        role="admin",
        action=action,
        target_type="contract",
        target_id=str(contract_id),
        result="success",
        detail={"old_status": current, "new_status": new_status},
    )

    return {"id": contract.id, "contract_id": contract.id, "title": contract.title, "status": contract.status,
            "updated_at": contract.updated_at}


@router.post("/{contract_id}/activate")
async def activate_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Transition contract from pending → active."""
    return await _transition_contract(db, contract_id, "pending", "active", "activate_contract")


@router.post("/{contract_id}/to-pending")
async def set_contract_pending(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Transition contract from draft → pending (ready for activation)."""
    return await _transition_contract(db, contract_id, "draft", "pending", "submit_contract")


@router.post("/{contract_id}/suspend")
async def suspend_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Suspend an active contract."""
    return await _transition_contract(db, contract_id, "active", "suspended", "suspend_contract")


@router.post("/{contract_id}/terminate")
async def terminate_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Terminate a contract (any non-terminated status)."""
    row = await db.execute(select(Contract).where(Contract.id == contract_id))
    contract: Contract | None = row.scalar_one_or_none()
    if contract is None:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")

    old_status = contract.status if isinstance(contract.status, str) else contract.status.value
    if old_status == "terminated":
        raise HTTPException(status_code=409, detail="Contract is already terminated.")

    contract.status = "terminated"
    await db.flush()

    await create_audit_log(
        db,
        username="system",
        role="admin",
        action="terminate_contract",
        target_type="contract",
        target_id=str(contract_id),
        result="success",
        detail={"old_status": old_status},
    )

    return {"id": contract.id, "contract_id": contract.id, "title": contract.title, "status": "terminated",
            "updated_at": contract.updated_at}


@router.patch("/{contract_id}")
async def update_contract(
    contract_id: int,
    body: ContractUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Partially update a contract."""
    row = await db.execute(select(Contract).where(Contract.id == contract_id))
    contract: Contract | None = row.scalar_one_or_none()
    if contract is None:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contract, field, value)
    await db.flush()

    return {"id": contract.id, "status": contract.status, "updated_at": contract.updated_at}

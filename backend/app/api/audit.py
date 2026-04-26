"""
api/audit.py
Audit log inspection and hash-chain verification endpoints
for 数智安行 platform.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.audit_service import (
    create_audit_log,
    get_audit_logs,
    verify_audit_chain,
    tamper_audit_log,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas (inline – not worth polluting schemas.py)
# ---------------------------------------------------------------------------


class TamperRequest(BaseModel):
    log_id: int | None = None  # None → tamper most recent


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/logs")
async def list_audit_logs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    username: str | None = Query(None, description="Filter by username (partial match)"),
    action: str | None = Query(None, description="Filter by action (partial match)"),
    result: str | None = Query(None, description="Filter by result: success|failure|warning"),
    date_from: datetime | None = Query(None, description="ISO datetime lower bound"),
    date_to: datetime | None = Query(None, description="ISO datetime upper bound"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return paginated audit logs with optional filters.
    Ordered by created_at descending (most recent first).
    """
    logs, total = await get_audit_logs(
        db,
        limit=limit,
        offset=offset,
        username=username,
        action=action,
        result=result,
        date_from=date_from,
        date_to=date_to,
    )

    items = [
        {
            "id": log.id,
            "timestamp": log.timestamp,
            "user_id": log.user_id,
            "username": log.username,
            "role": log.role,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "result": log.result if isinstance(log.result, str) else log.result.value,
            "detail": log.detail,
            "log_hash": log.log_hash,
            "prev_hash": log.prev_hash,
            "created_at": log.created_at,
        }
        for log in logs
    ]
    return {"total": total, "items": items}


@router.post("/verify-chain")
async def verify_chain(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Walk the entire audit-log chain and verify each entry's hash.
    Returns a detailed integrity report.
    """
    result = await verify_audit_chain(db)

    # Write a meta-audit log about the verification itself
    await create_audit_log(
        db,
        username="system",
        role="auditor",
        action="verify_audit_chain",
        target_type="audit_log",
        target_id="all",
        result="success" if result["chain_intact"] else "warning",
        detail=result,
    )

    return result


@router.post("/tamper-demo")
async def tamper_demo(
    body: TamperRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Demo endpoint: tamper with a specific audit log entry by modifying its
    *detail* field without updating *log_hash*.  This breaks the chain at
    that entry, demonstrating the tamper-detection capability.
    """
    try:
        result = await tamper_audit_log(db, log_id=body.log_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Log the tampering action itself
    await create_audit_log(
        db,
        username="demo",
        role="demo",
        action="tamper_demo",
        target_type="audit_log",
        target_id=str(result["tampered_log_id"]),
        result="warning",
        detail=result,
    )

    return result


@router.get("/stats")
async def audit_stats(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return high-level audit log statistics."""
    from sqlalchemy import select, func
    from app.models import AuditLog

    total = (await db.execute(select(func.count()).select_from(AuditLog))).scalar_one()

    by_result = await db.execute(
        select(AuditLog.result, func.count().label("cnt")).group_by(AuditLog.result)
    )
    count_by_result = {
        (row.result if isinstance(row.result, str) else row.result.value): row.cnt
        for row in by_result
    }

    by_action = await db.execute(
        select(AuditLog.action, func.count().label("cnt"))
        .group_by(AuditLog.action)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_actions = [
        {"action": row.action, "count": row.cnt} for row in by_action
    ]

    return {
        "total_logs": total,
        "count_by_result": count_by_result,
        "top_actions": top_actions,
    }

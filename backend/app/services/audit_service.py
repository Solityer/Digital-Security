"""
audit_service.py
Hash-chained audit log service for 数智安行 platform.

Each log entry is linked to the previous one via SHA-256 hash,
forming a tamper-evident chain.  Breaking the chain can be detected
by verify_audit_chain().
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _compute_log_hash(
    timestamp: str,
    username: str,
    action: str,
    target_type: str,
    target_id: str,
    result: str,
    prev_hash: str,
) -> str:
    """SHA-256 over the key audit fields and the previous hash."""
    payload = (
        f"{timestamp}|{username}|{action}|"
        f"{target_type}|{target_id}|{result}|{prev_hash}"
    )
    return hashlib.sha256(payload.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_audit_log(
    db: AsyncSession,
    username: str,
    role: str,
    action: str,
    target_type: str,
    target_id: str,
    result: str,
    detail: dict[str, Any],
    user_id: int | None = None,
) -> AuditLog:
    """
    Create an audit log entry and append it to the hash chain.

    The hash of the new entry depends on the hash of the most recent
    existing entry (or '0' * 64 if the chain is empty).
    """
    # 1. Retrieve the most recent log's hash
    stmt = (
        select(AuditLog.log_hash)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(1)
    )
    row = await db.execute(stmt)
    prev_hash_row = row.scalar_one_or_none()
    prev_hash: str = prev_hash_row if prev_hash_row else "0" * 64

    # 2. Compute new log hash
    now = datetime.utcnow()
    now_str = now.isoformat()
    log_hash = _compute_log_hash(
        now_str, username, action, target_type, target_id, result, prev_hash
    )

    # 3. Persist
    entry = AuditLog(
        user_id=user_id,
        username=username,
        role=role,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        result=result,
        detail=detail,
        log_hash=log_hash,
        prev_hash=prev_hash,
        timestamp=now,
        created_at=now,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


async def get_audit_logs(
    db: AsyncSession,
    limit: int = 100,
    offset: int = 0,
    username: str | None = None,
    action: str | None = None,
    result: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[AuditLog], int]:
    """
    Return (logs, total_count) with optional filters.
    Logs are ordered by created_at descending.
    """
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)

    if username:
        stmt = stmt.where(AuditLog.username.ilike(f"%{username}%"))
        count_stmt = count_stmt.where(AuditLog.username.ilike(f"%{username}%"))
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
        count_stmt = count_stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if result:
        stmt = stmt.where(AuditLog.result == result)
        count_stmt = count_stmt.where(AuditLog.result == result)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
        count_stmt = count_stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)
        count_stmt = count_stmt.where(AuditLog.created_at <= date_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    stmt = stmt.offset(offset).limit(limit)
    rows = await db.execute(stmt)
    logs = list(rows.scalars().all())
    return logs, total


async def verify_audit_chain(db: AsyncSession) -> dict[str, Any]:
    """
    Walk the audit log chain in chronological order and verify every
    entry's log_hash matches the expected hash given its content and
    predecessor.

    Returns
    -------
    {
      "is_valid": bool,
      "total_logs": int,
      "valid_count": int,
      "invalid_count": int,
      "tampered_ids": list[int],
      "chain_intact": bool,
      "verified_at": str,
    }
    """
    stmt = select(AuditLog).order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
    rows = await db.execute(stmt)
    logs: list[AuditLog] = list(rows.scalars().all())

    tampered_ids: list[int] = []
    running_prev_hash = "0" * 64

    for log in logs:
        expected_hash = _compute_log_hash(
            log.timestamp.isoformat() if log.timestamp else log.created_at.isoformat(),
            log.username,
            log.action,
            log.target_type,
            log.target_id,
            log.result if isinstance(log.result, str) else log.result.value,
            running_prev_hash,
        )
        if log.log_hash != expected_hash:
            tampered_ids.append(log.id)
        # Chain continues with this log's stored hash (even if tampered,
        # to detect all subsequent broken links)
        running_prev_hash = log.log_hash or ""

    total = len(logs)
    invalid = len(tampered_ids)
    return {
        "is_valid": invalid == 0,
        "total_records": total,
        "valid_count": total - invalid,
        "invalid_count": invalid,
        "tampered_ids": tampered_ids,
        "chain_intact": invalid == 0,
        "verified_at": datetime.utcnow().isoformat(),
    }


async def tamper_audit_log(
    db: AsyncSession,
    log_id: int | None = None,
) -> dict[str, Any]:
    """
    Demo function: modify a log's *detail* field without updating log_hash,
    so the chain breaks at that entry.

    If *log_id* is None, the most recent log is tampered.

    Returns
    -------
    {"tampered_log_id": int, "message": str}
    """
    if log_id is not None:
        stmt = select(AuditLog).where(AuditLog.id == log_id)
    else:
        stmt = select(AuditLog).order_by(
            AuditLog.created_at.desc(), AuditLog.id.desc()
        ).limit(1)

    row = await db.execute(stmt)
    log: AuditLog | None = row.scalar_one_or_none()
    if log is None:
        raise ValueError(f"Audit log {log_id!r} not found.")

    # Mutate detail without touching log_hash → breaks chain
    detail = dict(log.detail) if log.detail else {}
    detail["TAMPERED"] = "This record was manually altered for demo purposes."
    detail["tampered_at"] = datetime.utcnow().isoformat()
    log.detail = detail
    await db.flush()

    return {
        "tampered_log_id": log.id,
        "message": (
            f"Log #{log.id} detail field modified.  "
            "log_hash NOT updated – chain is now broken at this entry."
        ),
    }

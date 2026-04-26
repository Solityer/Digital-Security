"""
api/risks.py
Risk event management and evaluation endpoints for 数智安行 platform.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, RiskEvent, User
from app.schemas import RiskEvaluateRequest, RiskEventCreate, RiskEventResponse
from app.services.risk_service import (
    evaluate_risk,
    get_risk_events,
    generate_risk_report,
)

router = APIRouter()


async def _resolve_names(db: AsyncSession, asset_ids: list[int | None], user_ids: list[int | None]) -> tuple[dict[int, str], dict[int, str]]:
    asset_map: dict[int, str] = {}
    user_map: dict[int, str] = {}

    wanted_assets = [asset_id for asset_id in asset_ids if asset_id is not None]
    if wanted_assets:
        asset_rows = await db.execute(select(Asset).where(Asset.id.in_(wanted_assets)))
        asset_map = {asset.id: asset.name for asset in asset_rows.scalars().all()}

    wanted_users = [user_id for user_id in user_ids if user_id is not None]
    if wanted_users:
        user_rows = await db.execute(select(User).where(User.id.in_(wanted_users)))
        user_map = {user.id: user.username for user in user_rows.scalars().all()}

    return asset_map, user_map


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
async def list_risk_events(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None, description="low|medium|high|critical"),
    event_type: str | None = Query(None),
    asset_id: int | None = Query(None),
    status: str | None = Query(None, description="open|investigating|resolved"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List risk events with optional filters."""
    stmt = select(RiskEvent)
    count_stmt = select(func.count()).select_from(RiskEvent)

    if severity:
        stmt = stmt.where(RiskEvent.severity == severity)
        count_stmt = count_stmt.where(RiskEvent.severity == severity)
    if event_type:
        stmt = stmt.where(RiskEvent.event_type == event_type)
        count_stmt = count_stmt.where(RiskEvent.event_type == event_type)
    if asset_id is not None:
        stmt = stmt.where(RiskEvent.asset_id == asset_id)
        count_stmt = count_stmt.where(RiskEvent.asset_id == asset_id)
    if status:
        stmt = stmt.where(RiskEvent.status == status)
        count_stmt = count_stmt.where(RiskEvent.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(RiskEvent.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    events = rows.scalars().all()
    asset_names, user_names = await _resolve_names(
        db,
        [event.asset_id for event in events],
        [event.user_id for event in events],
    )

    return {
        "total": total,
        "items": [
            {
                "id": e.id,
                "risk_id": e.id,
                "event_type": e.event_type if isinstance(e.event_type, str) else e.event_type.value,
                "severity": e.severity if isinstance(e.severity, str) else e.severity.value,
                "asset_id": e.asset_id,
                "user_id": e.user_id,
                "asset_name": asset_names.get(e.asset_id or -1, "未关联资产") if e.asset_id is not None else "未关联资产",
                "username": user_names.get(e.user_id or -1, "系统任务") if e.user_id is not None else "系统任务",
                "description": e.description,
                "detail": e.detail,
                "risk_score": e.risk_score,
                "score": e.risk_score,
                "status": e.status if isinstance(e.status, str) else e.status.value,
                "created_at": e.created_at,
                "detected_at": e.created_at,
            }
            for e in events
        ],
    }


@router.post("/evaluate", status_code=status.HTTP_201_CREATED)
async def evaluate_risk_endpoint(
    body: RiskEvaluateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Evaluate risk for a given context.

    Context keys:
      access_frequency, authorization, privacy_budget_used,
      privacy_budget_limit, verify_result, quality_score,
      quality_threshold, contract_status, frequency_threshold.
    """
    result = await evaluate_risk(
        db,
        context=body.context,
        asset_id=body.asset_id,
        user_id=body.user_id,
    )
    return result


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_risk_event(
    body: RiskEventCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Manually create a risk event."""
    event = RiskEvent(
        event_type=body.event_type,
        severity=body.severity,
        asset_id=body.asset_id,
        user_id=body.user_id,
        description=body.description,
        detail=body.detail,
        risk_score=body.risk_score,
        status=body.status,
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)

    return {
        "id": event.id,
        "event_type": event.event_type if isinstance(event.event_type, str) else event.event_type.value,
        "severity": event.severity if isinstance(event.severity, str) else event.severity.value,
        "asset_id": event.asset_id,
        "description": event.description,
        "risk_score": event.risk_score,
        "status": event.status if isinstance(event.status, str) else event.status.value,
        "created_at": event.created_at,
    }


@router.post("/report")
async def risk_report(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Generate a risk summary report.

    Returns counts by severity and type, top assets with risks,
    7-day trend data, and open event counts.
    """
    raw = await generate_risk_report(db)
    severity = raw.get("count_by_severity", {})
    risk_score = min(
        100,
        severity.get("critical", 0) * 30
        + severity.get("high", 0) * 18
        + severity.get("medium", 0) * 10
        + severity.get("low", 0) * 4,
    )
    recommendations: list[str] = []
    if severity.get("critical", 0):
        recommendations.append("优先处理严重与高危事件，重新验证相关证明与授权链路。")
    if raw.get("open_events", 0):
        recommendations.append("存在未关闭风险事件，建议在比赛演示前完成人工复核。")
    if not recommendations:
        recommendations.append("当前风险总体可控，建议继续保持周期性巡检。")
    return {
        **raw,
        "critical_count": severity.get("critical", 0),
        "high_count": severity.get("high", 0),
        "medium_count": severity.get("medium", 0),
        "low_count": severity.get("low", 0),
        "risk_score": risk_score,
        "summary": "系统风险报告已生成，可结合事件列表进行复核。",
        "recommendations": recommendations,
        "trend": [
            {"date": item.get("date"), "score": min(100, item.get("count", 0) * 20)}
            for item in raw.get("trend_data", [])
        ],
    }


@router.get("/report")
async def risk_report_get(
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await risk_report(db)


@router.get("/{event_id}")
async def get_risk_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single risk event."""
    row = await db.execute(select(RiskEvent).where(RiskEvent.id == event_id))
    event: RiskEvent | None = row.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail=f"RiskEvent {event_id} not found.")

    asset_names, user_names = await _resolve_names(db, [event.asset_id], [event.user_id])

    return {
        "id": event.id,
        "risk_id": event.id,
        "event_type": event.event_type if isinstance(event.event_type, str) else event.event_type.value,
        "severity": event.severity if isinstance(event.severity, str) else event.severity.value,
        "asset_id": event.asset_id,
        "user_id": event.user_id,
        "asset_name": asset_names.get(event.asset_id or -1, "未关联资产") if event.asset_id is not None else "未关联资产",
        "username": user_names.get(event.user_id or -1, "系统任务") if event.user_id is not None else "系统任务",
        "description": event.description,
        "detail": event.detail,
        "risk_score": event.risk_score,
        "score": event.risk_score,
        "status": event.status if isinstance(event.status, str) else event.status.value,
        "created_at": event.created_at,
        "detected_at": event.created_at,
    }


@router.patch("/{event_id}/resolve")
async def resolve_risk_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark a risk event as resolved."""
    row = await db.execute(select(RiskEvent).where(RiskEvent.id == event_id))
    event: RiskEvent | None = row.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail=f"RiskEvent {event_id} not found.")

    event.status = "resolved"
    await db.flush()

    return {"id": event.id, "status": "resolved"}

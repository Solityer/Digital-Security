"""
risk_service.py
Risk evaluation and event management service for 数智安行 platform.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RiskEvent


# ---------------------------------------------------------------------------
# Risk scoring rules
# ---------------------------------------------------------------------------


_RULES: list[dict[str, Any]] = [
    {
        "key": "access_frequency",
        "event_type": "anomaly_access",
        "check": lambda ctx: float(ctx.get("access_frequency", 0)) > float(ctx.get("frequency_threshold", 100)),
        "score": 35.0,
        "severity": "high",
        "description": "访问频率异常：在短时间内访问次数超过阈值，疑似自动化扫描或爬取行为。",
    },
    {
        "key": "authorization",
        "event_type": "unauthorized_access",
        "check": lambda ctx: (
            not ctx.get("authorization") or ctx.get("authorization") == "expired"
        ),
        "score": 70.0,
        "severity": "critical",
        "description": "未授权访问：授权凭证缺失或已过期，访问请求被拒绝。",
    },
    {
        "key": "privacy_budget",
        "event_type": "budget_exceeded",
        "check": lambda ctx: (
            float(ctx.get("privacy_budget_used", 0))
            > float(ctx.get("privacy_budget_limit", 1.0))
        ),
        "score": 55.0,
        "severity": "high",
        "description": "隐私预算超限：差分隐私预算已耗尽，继续访问将超出合规限制。",
    },
    {
        "key": "verify_result",
        "event_type": "verify_failure",
        "check": lambda ctx: ctx.get("verify_result") is False,
        "score": 80.0,
        "severity": "critical",
        "description": "证明验证失败：零知识证明或路径验证哈希不匹配，数据可能已被篡改。",
    },
    {
        "key": "data_quality",
        "event_type": "data_quality",
        "check": lambda ctx: float(ctx.get("quality_score", 1.0)) < float(ctx.get("quality_threshold", 0.7)),
        "score": 30.0,
        "severity": "medium",
        "description": "数据质量不足：图数据质量评分低于阈值，建议检查数据完整性。",
    },
    {
        "key": "contract_expired",
        "event_type": "expired_access",
        "check": lambda ctx: ctx.get("contract_status") in ("suspended", "terminated", "expired"),
        "score": 60.0,
        "severity": "high",
        "description": "合约无效：数据共享合约已暂停、终止或过期，访问操作违反授权协议。",
    },
]


_RECOMMENDATIONS: dict[str, list[str]] = {
    "anomaly_access": [
        "启用 IP 速率限制与访问频率监控",
        "对异常访问账户触发二次身份验证",
        "检查是否存在未授权的批量数据抓取行为",
    ],
    "unauthorized_access": [
        "立即撤销相关访问令牌",
        "重新审核授权策略，确保合约有效期内才可访问",
        "开启实时告警通知数据拥有方",
    ],
    "budget_exceeded": [
        "暂停当前会话，等待隐私预算重置周期",
        "审查差分隐私参数设置，考虑降低单次查询 ε 值",
        "与数据方协商扩大合约中的隐私预算配额",
    ],
    "verify_failure": [
        "立即终止相关数据传输",
        "对全链路数据完整性进行重新验证",
        "排查是否存在中间人攻击或数据库篡改",
    ],
    "data_quality": [
        "重新采集或修复低质量数据源",
        "运行数据清洗和缺失值填充流程",
        "在数据合约中增加质量保证条款",
    ],
    "expired_access": [
        "联系数据提供方续签合约",
        "停止使用当前授权凭证",
        "启动合规审查流程",
    ],
}


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def evaluate_risk(
    db: AsyncSession,
    context: dict[str, Any],
    asset_id: int | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    """
    Evaluate risk based on *context* dict and persist triggered events.

    Context keys (all optional):
      access_frequency      int    – requests in the last window
      frequency_threshold   int    – threshold for anomaly_access (default 100)
      authorization         str    – 'valid' | 'expired' | None
      privacy_budget_used   float  – ε consumed so far
      privacy_budget_limit  float  – contract ε limit (default 1.0)
      verify_result         bool   – False triggers verify_failure
      quality_score         float  – data quality score 0–1
      quality_threshold     float  – min acceptable quality (default 0.7)
      contract_status       str    – 'active' | 'suspended' | ...

    Returns
    -------
    {
      "risk_score": float (0–100),
      "risk_events": list[dict],
      "recommendations": list[str],
    }
    """
    triggered: list[dict[str, Any]] = []
    all_recs: list[str] = []
    composite_score = 0.0

    for rule in _RULES:
        try:
            fired = rule["check"](context)
        except Exception:
            fired = False

        if fired:
            composite_score += rule["score"]
            triggered.append({
                "event_type": rule["event_type"],
                "severity": rule["severity"],
                "score": rule["score"],
                "description": rule["description"],
            })
            all_recs.extend(_RECOMMENDATIONS.get(rule["event_type"], []))

    # Cap at 100
    risk_score = min(100.0, composite_score)

    # Persist events if score is significant
    if risk_score > 30:
        for evt in triggered:
            db_event = RiskEvent(
                event_type=evt["event_type"],
                severity=evt["severity"],
                asset_id=asset_id,
                user_id=user_id,
                description=evt["description"],
                detail={"context": context, "score": evt["score"]},
                risk_score=evt["score"],
                status="open",
            )
            db.add(db_event)
        await db.flush()

    # Deduplicate recommendations
    seen: set[str] = set()
    unique_recs = []
    for r in all_recs:
        if r not in seen:
            seen.add(r)
            unique_recs.append(r)

    return {
        "risk_score": round(risk_score, 2),
        "risk_events": triggered,
        "recommendations": unique_recs,
    }


async def get_risk_events(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    severity: str | None = None,
    event_type: str | None = None,
    asset_id: int | None = None,
) -> tuple[list[RiskEvent], int]:
    """
    Return (events, total_count) ordered by created_at descending.
    """
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

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(RiskEvent.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    return list(rows.scalars().all()), total


async def generate_risk_report(db: AsyncSession) -> dict[str, Any]:
    """
    Aggregate risk event statistics for the report endpoint.
    """
    # Count by severity
    for_severity = await db.execute(
        select(RiskEvent.severity, func.count().label("cnt"))
        .group_by(RiskEvent.severity)
    )
    count_by_severity = {row.severity: row.cnt for row in for_severity}

    # Count by event type
    for_type = await db.execute(
        select(RiskEvent.event_type, func.count().label("cnt"))
        .group_by(RiskEvent.event_type)
    )
    count_by_type = {row.event_type: row.cnt for row in for_type}

    # Top assets by risk count
    for_assets = await db.execute(
        select(RiskEvent.asset_id, func.count().label("cnt"))
        .where(RiskEvent.asset_id.isnot(None))
        .group_by(RiskEvent.asset_id)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_assets = [
        {"asset_id": row.asset_id, "event_count": row.cnt}
        for row in for_assets
    ]

    # Total and open counts
    total_events = sum(count_by_severity.values())
    open_stmt = await db.execute(
        select(func.count()).select_from(RiskEvent).where(RiskEvent.status == "open")
    )
    open_events = open_stmt.scalar_one()

    # Simple daily trend (last 7 days)
    from datetime import timedelta
    trend_data: list[dict[str, Any]] = []
    today = datetime.utcnow().date()
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day)
        day_end = datetime(day.year, day.month, day.day, 23, 59, 59)
        day_count = (await db.execute(
            select(func.count()).select_from(RiskEvent)
            .where(RiskEvent.created_at >= day_start)
            .where(RiskEvent.created_at <= day_end)
        )).scalar_one()
        trend_data.append({"date": str(day), "count": day_count})

    return {
        "count_by_severity": count_by_severity,
        "count_by_type": count_by_type,
        "top_assets": top_assets,
        "trend_data": trend_data,
        "total_events": total_events,
        "open_events": open_events,
    }

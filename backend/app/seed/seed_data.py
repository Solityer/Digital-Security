"""
seed_data.py
Populates the 数智安行 database with sample data for development / demo use.

Run directly:
    cd /home/match/Digital-Security/backend
    python app/seed/seed_data.py
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import sys
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# Path bootstrap – allows running as a plain script from any CWD
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from app.database import init_db, async_session_maker  # noqa: E402
from app.models import (  # noqa: E402
    User,
    Asset,
    GraphSnapshot,
    Contract,
    AuditLog,
    RiskEvent,
    DemoScenario,
    UserRole,
    IndustryType,
    ContractStatus,
    AuditResult,
    RiskEventType,
    RiskSeverity,
    RiskStatus,
    AssetStatus,
    ScenarioKey,
)
from app.algorithms.graph_utils import (  # noqa: E402
    generate_financial_graph,
    generate_medical_graph,
    generate_government_graph,
    generate_social_graph,
    graph_to_dict,
    get_graph_stats,
)
from app.services.audit_service import create_audit_log  # noqa: E402
from sqlalchemy import select  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_password(plain: str) -> str:
    """Deterministic SHA-256 password hash (demo only – not production-safe)."""
    return hashlib.sha256(plain.encode()).hexdigest()


def _asset_hash(name: str, industry: str) -> str:
    ts = "2026-01-01T00:00:00"
    return hashlib.sha256(f"{name}|{industry}|{ts}".encode()).hexdigest()


def _contract_hash(title: str, provider_id: int, consumer_id: int) -> str:
    ts = "2026-01-01T00:00:00"
    return hashlib.sha256(f"{title}|{provider_id}|{consumer_id}|{ts}".encode()).hexdigest()


# ---------------------------------------------------------------------------
# Seed steps
# ---------------------------------------------------------------------------

async def _seed_users(session) -> dict[str, User]:
    """Create 4 default users; skip any that already exist."""
    user_defs = [
        ("admin",   "admin@demo.com",   UserRole.admin,    "admin123"),
        ("analyst", "analyst@demo.com", UserRole.analyst,  "analyst123"),
        ("auditor", "auditor@demo.com", UserRole.auditor,  "auditor123"),
        ("demo",    "demo@demo.com",    UserRole.demo,     "demo123"),
    ]

    users: dict[str, User] = {}
    for username, email, role, password in user_defs:
        row = await session.execute(
            select(User).where(User.username == username)
        )
        existing = row.scalar_one_or_none()
        if existing:
            print(f"  [skip] user '{username}' already exists")
            users[username] = existing
            continue

        user = User(
            username=username,
            email=email,
            role=role,
            hashed_password=_hash_password(password),
            is_active=True,
        )
        session.add(user)
        await session.flush()
        await session.refresh(user)
        users[username] = user
        print(f"  [ok]   created user '{username}' (id={user.id}, role={role.value})")

    return users


async def _seed_assets(session, users: dict[str, User]) -> dict[str, Asset]:
    """Create 4 sample data assets with graph snapshots."""
    admin = users["admin"]
    analyst = users["analyst"]

    asset_defs = [
        {
            "name": "金融交易图谱",
            "industry": IndustryType.finance,
            "description": (
                "模拟金融机构间资金流转网络，包含用户、账户、商户三类节点，"
                "共50个节点，覆盖转账、持有、交易等边关系。"
                "用于金融风控与反洗钱场景的隐私保护分析。"
            ),
            "node_meaning": "用户 / 账户 / 商户",
            "edge_meaning": "资金转账 / 账户持有 / 交易关系",
            "subject_type": "金融实体",
            "data_source": "模拟金融交易系统",
            "sensitivity_level": 4,
            "compliance_tags": ["GDPR", "金融数据安全", "反洗钱"],
            "authorization_scope": "仅限金融监管机构和授权分析师",
            "owner_id": admin.id,
            "graph_gen": generate_financial_graph,
        },
        {
            "name": "医疗协作网络",
            "industry": IndustryType.medical,
            "description": (
                "模拟医院、患者、疾病、检查项目之间的关联网络，"
                "共40个节点，用于医疗数据隐私发布与患者隐私保护研究。"
                "支持 k-度匿名化和差分隐私聚类系数发布。"
            ),
            "node_meaning": "医院 / 患者 / 疾病 / 检查",
            "edge_meaning": "就诊关系 / 确诊疾病 / 接受检查",
            "subject_type": "医疗实体",
            "data_source": "模拟医院信息系统",
            "sensitivity_level": 5,
            "compliance_tags": ["HIPAA", "医疗数据保护", "患者隐私"],
            "authorization_scope": "仅限医疗机构和卫生管理部门",
            "owner_id": analyst.id,
            "graph_gen": generate_medical_graph,
        },
        {
            "name": "政务开放数据图",
            "industry": IndustryType.government,
            "description": (
                "模拟企业、许可证、行政区域、交通方式之间的关联图谱，"
                "共45个节点，用于政务数据确权流通与 ZK-GCN 推理验证场景。"
                "支持区块链存证与合约管理。"
            ),
            "node_meaning": "企业 / 许可证 / 区域 / 交通",
            "edge_meaning": "持有许可证 / 所在区域 / 使用交通方式",
            "subject_type": "政务实体",
            "data_source": "模拟政府开放数据平台",
            "sensitivity_level": 3,
            "compliance_tags": ["数据安全法", "政务数据开放", "区块链存证"],
            "authorization_scope": "政府机构及授权企业",
            "owner_id": admin.id,
            "graph_gen": generate_government_graph,
        },
        {
            "name": "通用社交网络",
            "industry": IndustryType.social,
            "description": (
                "基于 Barabasi-Albert 模型生成的无标度社交网络，"
                "共60个节点，节点代表用户，边代表社交关系。"
                "用于社交网络隐私保护算法基准测试。"
            ),
            "node_meaning": "社交用户",
            "edge_meaning": "好友 / 关注 / 同事 / 家庭关系",
            "subject_type": "社交用户",
            "data_source": "模拟社交平台数据",
            "sensitivity_level": 2,
            "compliance_tags": ["个人信息保护法", "社交隐私"],
            "authorization_scope": "平台内部研究团队",
            "owner_id": analyst.id,
            "graph_gen": generate_social_graph,
        },
    ]

    assets: dict[str, Asset] = {}
    for adef in asset_defs:
        name = adef["name"]
        industry = adef["industry"]
        ahash = _asset_hash(name, industry.value)

        # Check if asset already exists
        row = await session.execute(
            select(Asset).where(Asset.name == name)
        )
        existing = row.scalar_one_or_none()
        if existing:
            print(f"  [skip] asset '{name}' already exists")
            assets[name] = existing
            continue

        # Generate graph
        G = adef["graph_gen"](seed=42)
        graph_dict = graph_to_dict(G)
        stats = get_graph_stats(G)

        # Create GraphSnapshot first (without asset_id)
        snapshot = GraphSnapshot(
            asset_id=None,
            nodes=graph_dict["nodes"],
            edges=graph_dict["edges"],
            node_count=stats["node_count"],
            edge_count=stats["edge_count"],
        )
        session.add(snapshot)
        await session.flush()
        await session.refresh(snapshot)

        # Create Asset with snapshot FK
        asset = Asset(
            name=name,
            industry=industry,
            description=adef["description"],
            node_meaning=adef["node_meaning"],
            edge_meaning=adef["edge_meaning"],
            subject_type=adef["subject_type"],
            data_source=adef["data_source"],
            sensitivity_level=adef["sensitivity_level"],
            compliance_tags=adef["compliance_tags"],
            authorization_scope=adef["authorization_scope"],
            owner_id=adef["owner_id"],
            graph_snapshot_id=snapshot.id,
            asset_hash=ahash,
            ownership_credential=hashlib.sha256(f"cred:{ahash}".encode()).hexdigest(),
            chain_record=f"block:{ahash[:16]}",
            status=AssetStatus.active,
        )
        session.add(asset)
        await session.flush()
        await session.refresh(asset)

        # Back-link snapshot to asset
        snapshot.asset_id = asset.id
        session.add(snapshot)
        await session.flush()

        assets[name] = asset
        print(
            f"  [ok]   created asset '{name}' "
            f"(id={asset.id}, nodes={stats['node_count']}, edges={stats['edge_count']})"
        )

    return assets


async def _seed_contracts(
    session, users: dict[str, User], assets: dict[str, Asset]
) -> list[Contract]:
    """Create 3 sample data-sharing contracts."""
    admin   = users["admin"]
    analyst = users["analyst"]
    auditor = users["auditor"]
    demo    = users["demo"]

    now = datetime.utcnow()
    contract_defs = [
        {
            "title": "金融数据共享协议 – 风控分析",
            "provider_id": admin.id,
            "consumer_id": analyst.id,
            "purpose": (
                "授权分析师在差分隐私框架下对金融交易图谱执行图统计分析，"
                "用于反洗钱模型训练与风险评估，数据不得用于其他商业目的。"
            ),
            "valid_from": now - timedelta(days=30),
            "valid_until": now + timedelta(days=335),
            "accessible_fields": ["node_id", "edge_weight", "transaction_amount"],
            "allowed_algorithms": ["graph_sdp", "gs_ldp", "vpcs"],
            "privacy_budget_limit": 2.0,
            "status": ContractStatus.active,
        },
        {
            "title": "医疗数据发布授权协议",
            "provider_id": analyst.id,
            "consumer_id": auditor.id,
            "purpose": (
                "授权审计员对医疗协作网络执行 k-度匿名化处理后的统计查询，"
                "用于医疗质量评估报告，须遵守 HIPAA 相关要求。"
            ),
            "valid_from": now - timedelta(days=15),
            "valid_until": now + timedelta(days=180),
            "accessible_fields": ["node_type", "edge_label", "degree"],
            "allowed_algorithms": ["ndkd", "gcc_sdp"],
            "privacy_budget_limit": 1.5,
            "status": ContractStatus.active,
        },
        {
            "title": "政务数据开放共享协议（演示）",
            "provider_id": admin.id,
            "consumer_id": demo.id,
            "purpose": (
                "演示账号在沙箱环境中访问政务开放数据图，"
                "体验 ZK-GCN 推理证明与审计链验证功能，仅用于平台演示。"
            ),
            "valid_from": now,
            "valid_until": now + timedelta(days=90),
            "accessible_fields": ["node_label", "edge_type"],
            "allowed_algorithms": ["zkgcn", "vpcs"],
            "privacy_budget_limit": 1.0,
            "status": ContractStatus.draft,
        },
    ]

    contracts: list[Contract] = []
    for cdef in contract_defs:
        title = cdef["title"]
        chash = _contract_hash(title, cdef["provider_id"], cdef["consumer_id"])

        row = await session.execute(
            select(Contract).where(Contract.title == title)
        )
        existing = row.scalar_one_or_none()
        if existing:
            print(f"  [skip] contract '{title[:40]}...' already exists")
            contracts.append(existing)
            continue

        contract = Contract(
            title=title,
            provider_id=cdef["provider_id"],
            consumer_id=cdef["consumer_id"],
            purpose=cdef["purpose"],
            valid_from=cdef["valid_from"],
            valid_until=cdef["valid_until"],
            accessible_fields=cdef["accessible_fields"],
            allowed_algorithms=cdef["allowed_algorithms"],
            privacy_budget_limit=cdef["privacy_budget_limit"],
            status=cdef["status"],
            contract_hash=chash,
        )
        session.add(contract)
        await session.flush()
        await session.refresh(contract)
        contracts.append(contract)
        print(f"  [ok]   created contract '{title[:50]}' (id={contract.id})")

    return contracts


async def _seed_audit_logs(
    session, users: dict[str, User], assets: dict[str, Asset]
) -> None:
    """Create 10 sample audit log entries covering a variety of operations."""
    admin   = users["admin"]
    analyst = users["analyst"]
    auditor = users["auditor"]
    demo    = users["demo"]

    finance_asset  = assets.get("金融交易图谱")
    medical_asset  = assets.get("医疗协作网络")
    gov_asset      = assets.get("政务开放数据图")
    social_asset   = assets.get("通用社交网络")

    # Check if audit logs already seeded (look for a known action)
    row = await session.execute(
        select(AuditLog).where(AuditLog.action == "系统初始化").limit(1)
    )
    if row.scalar_one_or_none():
        print("  [skip] audit logs already seeded")
        return

    log_defs = [
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="系统初始化",
            target_type="system", target_id="0",
            result=AuditResult.success,
            detail={"message": "平台数据库初始化完成，种子数据加载成功。"},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="创建资产",
            target_type="asset", target_id=str(finance_asset.id) if finance_asset else "1",
            result=AuditResult.success,
            detail={"asset_name": "金融交易图谱", "industry": "finance", "node_count": 50},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="运行隐私算法",
            target_type="privacy_task", target_id="1",
            result=AuditResult.success,
            detail={"algorithm": "graph_sdp", "epsilon": 1.0, "elapsed_ms": 23.5},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="执行VPCS查询",
            target_type="vpcs_query", target_id="1",
            result=AuditResult.success,
            detail={"source": "0", "target": "10", "verify_result": True, "elapsed_ms": 12.1},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="创建资产",
            target_type="asset", target_id=str(medical_asset.id) if medical_asset else "2",
            result=AuditResult.success,
            detail={"asset_name": "医疗协作网络", "industry": "medical", "node_count": 40},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="运行隐私算法",
            target_type="privacy_task", target_id="2",
            result=AuditResult.success,
            detail={"algorithm": "ndkd", "k": 3, "epsilon": 1.0, "elapsed_ms": 45.2},
        ),
        dict(
            username=demo.username, role="demo", user_id=demo.id,
            action="访问资产",
            target_type="asset", target_id=str(gov_asset.id) if gov_asset else "3",
            result=AuditResult.warning,
            detail={"reason": "演示账号访问受限资产", "asset_name": "政务开放数据图"},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="创建合约",
            target_type="contract", target_id="1",
            result=AuditResult.success,
            detail={"title": "金融数据共享协议 – 风控分析", "status": "active"},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="ZK-GCN推理",
            target_type="zkgcn_proof", target_id="1",
            result=AuditResult.success,
            detail={"model_type": "gcn", "verify_result": True, "elapsed_ms": 88.3},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="验证审计链",
            target_type="audit_log", target_id="all",
            result=AuditResult.success,
            detail={"chain_intact": True, "total_records": 9},
        ),
    ]

    for ldef in log_defs:
        await create_audit_log(
            db=session,
            username=ldef["username"],
            role=ldef["role"],
            action=ldef["action"],
            target_type=ldef["target_type"],
            target_id=ldef["target_id"],
            result=ldef["result"].value,
            detail=ldef["detail"],
            user_id=ldef.get("user_id"),
        )

    print(f"  [ok]   created {len(log_defs)} audit log entries")


async def _seed_demo_scenarios(
    session, assets: dict[str, Asset]
) -> None:
    """Create 3 pre-configured demo scenarios."""
    scenario_defs = [
        {
            "scenario_key": ScenarioKey.finance,
            "title": "金融数据安全共享",
            "description": (
                "模拟金融机构间的数据共享场景：在保护用户隐私前提下，"
                "通过 VPCS 安全查询资金流转路径，并使用 GS-LDP 对交易网络"
                "度分布进行本地差分隐私保护，最后进行风险评估。"
            ),
            "asset_name": "金融交易图谱",
            "steps": [
                {"step": 1, "title": "注册金融图数据资产", "description": "50节点：用户/账户/商户"},
                {"step": 2, "title": "执行VPCS约束最短路径查询", "description": "资金流转路径验证"},
                {"step": 3, "title": "运行GS-LDP本地差分隐私", "description": "交易度分布脱敏"},
                {"step": 4, "title": "风险评估", "description": "检测异常访问频率与预算超支"},
            ],
        },
        {
            "scenario_key": ScenarioKey.medical,
            "title": "医疗数据隐私发布",
            "description": (
                "模拟医疗机构的患者数据发布场景：使用 NDKD k-度匿名化保护"
                "患者节点的度数信息，通过 GCC-SDP 差分隐私发布聚类系数统计，"
                "并生成隐私保护分析报告。"
            ),
            "asset_name": "医疗协作网络",
            "steps": [
                {"step": 1, "title": "注册医疗图数据资产", "description": "40节点：医院/患者/疾病/检测"},
                {"step": 2, "title": "运行NDKD k-度匿名化", "description": "保护患者就诊连接模式"},
                {"step": 3, "title": "运行GCC-SDP差分隐私发布", "description": "聚类系数脱敏"},
                {"step": 4, "title": "生成隐私保护报告", "description": "综合评估隐私保护效果"},
            ],
        },
        {
            "scenario_key": ScenarioKey.government,
            "title": "政务数据确权流通",
            "description": (
                "模拟政府数据开放场景：注册政务图资产并生成确权凭证，"
                "创建数据共享合约并进行授权管理，运行 ZK-GCN 推理验证，"
                "最后验证全链路审计日志的完整性。"
            ),
            "asset_name": "政务开放数据图",
            "steps": [
                {"step": 1, "title": "注册政务图数据资产", "description": "45节点：企业/许可证/区域/交通"},
                {"step": 2, "title": "创建数据共享合约", "description": "合约激活与授权管理"},
                {"step": 3, "title": "运行ZK-GCN零知识推理", "description": "证明模型正确执行"},
                {"step": 4, "title": "验证审计链完整性", "description": "哈希链篡改检测演示"},
            ],
        },
    ]

    for sdef in scenario_defs:
        row = await session.execute(
            select(DemoScenario).where(DemoScenario.scenario_key == sdef["scenario_key"])
        )
        existing = row.scalar_one_or_none()
        if existing:
            print(f"  [skip] demo scenario '{sdef['title']}' already exists")
            continue

        asset = assets.get(sdef["asset_name"])
        scenario = DemoScenario(
            scenario_key=sdef["scenario_key"],
            title=sdef["title"],
            description=sdef["description"],
            steps=sdef["steps"],
            asset_id=asset.id if asset else None,
            last_result={},
        )
        session.add(scenario)
        await session.flush()
        print(f"  [ok]   created demo scenario '{sdef['title']}'")


async def _seed_risk_events(
    session, users: dict[str, User], assets: dict[str, Asset]
) -> None:
    """Create 5 sample risk events."""
    admin   = users["admin"]
    analyst = users["analyst"]
    demo    = users["demo"]

    finance_asset = assets.get("金融交易图谱")
    medical_asset = assets.get("医疗协作网络")
    gov_asset     = assets.get("政务开放数据图")

    # Check idempotency
    row = await session.execute(
        select(RiskEvent).limit(1)
    )
    if row.scalar_one_or_none():
        print("  [skip] risk events already seeded")
        return

    risk_defs = [
        {
            "event_type": RiskEventType.anomaly_access,
            "severity": RiskSeverity.high,
            "asset_id": finance_asset.id if finance_asset else None,
            "user_id": demo.id,
            "description": (
                "演示账号在非工作时间连续访问金融交易图谱超过 20 次，"
                "触发异常访问检测规则。"
            ),
            "detail": {
                "access_count": 23,
                "time_window": "2026-04-25 22:00~23:59",
                "threshold": 10,
                "ip_address": "192.168.1.105",
            },
            "risk_score": 78.5,
            "status": RiskStatus.investigating,
        },
        {
            "event_type": RiskEventType.budget_exceeded,
            "severity": RiskSeverity.medium,
            "asset_id": medical_asset.id if medical_asset else None,
            "user_id": analyst.id,
            "description": (
                "分析师在医疗协作网络上累计消耗隐私预算 1.8，"
                "超过合约规定上限 1.5，系统自动终止后续查询。"
            ),
            "detail": {
                "budget_used": 1.8,
                "budget_limit": 1.5,
                "algorithm": "ndkd",
                "last_epsilon": 0.5,
            },
            "risk_score": 55.0,
            "status": RiskStatus.resolved,
        },
        {
            "event_type": RiskEventType.unauthorized_access,
            "severity": RiskSeverity.critical,
            "asset_id": gov_asset.id if gov_asset else None,
            "user_id": demo.id,
            "description": (
                "演示账号尝试访问未授权的政务开放数据图原始节点属性，"
                "授权策略拦截请求并记录安全事件。"
            ),
            "detail": {
                "attempted_field": "company_license_number",
                "policy_id": 3,
                "blocked": True,
            },
            "risk_score": 92.0,
            "status": RiskStatus.open,
        },
        {
            "event_type": RiskEventType.verify_failure,
            "severity": RiskSeverity.high,
            "asset_id": finance_asset.id if finance_asset else None,
            "user_id": analyst.id,
            "description": (
                "VPCS 查询结果证明验证失败，路径哈希与图加密摘要不一致，"
                "疑似查询结果被篡改，触发完整性告警。"
            ),
            "detail": {
                "query_id": 5,
                "proof_hash": "abcdef1234",
                "expected_hash": "1234abcdef",
                "tampered": True,
            },
            "risk_score": 85.0,
            "status": RiskStatus.investigating,
        },
        {
            "event_type": RiskEventType.data_quality,
            "severity": RiskSeverity.low,
            "asset_id": None,
            "user_id": admin.id,
            "description": (
                "社交网络图谱快照检测到 3 个孤立节点（度数为0），"
                "可能影响隐私算法效果，建议数据清洗。"
            ),
            "detail": {
                "isolated_nodes": 3,
                "asset_name": "通用社交网络",
                "recommendation": "执行图修复或排除孤立节点后重新运行算法",
            },
            "risk_score": 20.0,
            "status": RiskStatus.resolved,
        },
    ]

    for rdef in risk_defs:
        event = RiskEvent(
            event_type=rdef["event_type"],
            severity=rdef["severity"],
            asset_id=rdef["asset_id"],
            user_id=rdef["user_id"],
            description=rdef["description"],
            detail=rdef["detail"],
            risk_score=rdef["risk_score"],
            status=rdef["status"],
        )
        session.add(event)

    await session.flush()
    print(f"  [ok]   created {len(risk_defs)} risk events")


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def main() -> None:
    print("========================================")
    print("  数智安行 | 数据可信治理平台")
    print("  初始化种子数据...")
    print("========================================")

    # 1. Create tables
    print("\n[1/6] 初始化数据库表...")
    await init_db()
    print("  [ok] 数据库表就绪")

    async with async_session_maker() as session:
        try:
            # 2. Users
            print("\n[2/6] 创建默认用户...")
            users = await _seed_users(session)

            # 3. Assets + GraphSnapshots
            print("\n[3/6] 创建样本资产与图谱快照...")
            assets = await _seed_assets(session, users)

            # 4. Contracts
            print("\n[4/6] 创建样本合约...")
            await _seed_contracts(session, users, assets)

            # 5. Audit logs
            print("\n[5/6] 创建审计日志...")
            await _seed_audit_logs(session, users, assets)

            # 6. Demo scenarios
            print("\n[5b/6] 创建演示场景...")
            await _seed_demo_scenarios(session, assets)

            # 7. Risk events
            print("\n[6/6] 创建风险事件...")
            await _seed_risk_events(session, users, assets)

            await session.commit()
            print("\n========================================")
            print("  种子数据加载完成！")
            print("========================================")
            print("  默认账号：")
            print("    admin   / admin123   (管理员)")
            print("    analyst / analyst123 (分析师)")
            print("    auditor / auditor123 (审计员)")
            print("    demo    / demo123    (演示账号)")
            print("========================================")

        except Exception as exc:
            await session.rollback()
            print(f"\n[ERROR] 种子数据加载失败: {exc}")
            raise


if __name__ == "__main__":
    asyncio.run(main())

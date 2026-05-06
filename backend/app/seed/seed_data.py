"""
seed_data.py
Populates the 数智安行 database with baseline operational datasets for local development and verification.

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
    """Deterministic SHA-256 password hash for local bootstrap only."""
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
        ("admin",   "admin@trust-hub.local",   UserRole.admin,    "admin123"),
        ("analyst", "analyst@trust-hub.local", UserRole.analyst,  "analyst123"),
        ("auditor", "auditor@trust-hub.local", UserRole.auditor,  "auditor123"),
        ("observer", "observer@trust-hub.local", UserRole.demo,   "observer123"),
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
    """Create curated enterprise assets with graph snapshots."""
    admin = users["admin"]
    analyst = users["analyst"]

    asset_defs = [
        {
            "name": "金融交易关系图谱",
            "industry": IndustryType.finance,
            "description": (
                "汇集商业银行、支付机构、商户与终端设备的脱敏关系数据，"
                "支撑联合风控、异常资金链排查与反洗钱路径核验。"
            ),
            "node_meaning": "客户 / 账户 / 商户 / 设备",
            "edge_meaning": "交易往来 / 持有关系 / 终端关联 / 担保关系",
            "subject_type": "金融主体",
            "data_source": "金融交易监测专线脱敏库",
            "sensitivity_level": 5,
            "compliance_tags": ["金融数据安全", "反洗钱", "个人信息保护法"],
            "authorization_scope": "经合约审批后可用于读取、分析与隐私计算",
            "owner_id": admin.id,
            "graph_gen": generate_financial_graph,
            "seed": 42,
        },
        {
            "name": "企业风控关联图谱",
            "industry": IndustryType.finance,
            "description": (
                "覆盖企业、股东、供应商、案件与担保关系的关联网络，"
                "用于企业画像、授信尽调和联合建模前的数据治理。"
            ),
            "node_meaning": "企业 / 股东 / 供应商 / 案件",
            "edge_meaning": "控股关系 / 供应链关联 / 担保关系 / 司法关联",
            "subject_type": "企业主体",
            "data_source": "企业合规与供应链风控中心",
            "sensitivity_level": 4,
            "compliance_tags": ["企业合规", "数据安全法", "联合建模"],
            "authorization_scope": "仅限风控团队与审计专员使用",
            "owner_id": analyst.id,
            "graph_gen": generate_financial_graph,
            "seed": 84,
        },
        {
            "name": "医疗协同诊疗网络",
            "industry": IndustryType.medical,
            "description": (
                "围绕跨院区协同诊疗构建的脱敏诊疗关联网络，"
                "支撑病例科研、隐私发布与合规统计分析。"
            ),
            "node_meaning": "医院 / 科室 / 患者 / 检查项目",
            "edge_meaning": "就诊关系 / 转诊关系 / 检查关联 / 诊断关联",
            "subject_type": "医疗实体",
            "data_source": "区域协同诊疗平台脱敏数据仓",
            "sensitivity_level": 5,
            "compliance_tags": ["HIPAA", "医疗数据保护", "科研脱敏"],
            "authorization_scope": "仅限科研项目与卫生监管场景调用",
            "owner_id": analyst.id,
            "graph_gen": generate_medical_graph,
            "seed": 42,
        },
        {
            "name": "政务开放数据关联图",
            "industry": IndustryType.government,
            "description": (
                "整合企业登记、许可审批、区域治理与公共服务目录信息，"
                "用于政务数据确权流通与可验证推理展示。"
            ),
            "node_meaning": "企业 / 许可证 / 区域 / 公共服务事项",
            "edge_meaning": "审批关系 / 归属关系 / 服务调用 / 区域关联",
            "subject_type": "政务实体",
            "data_source": "政务开放数据目录平台",
            "sensitivity_level": 3,
            "compliance_tags": ["数据安全法", "政务数据开放", "确权存证"],
            "authorization_scope": "政府部门及授权服务机构可调用",
            "owner_id": admin.id,
            "graph_gen": generate_government_graph,
            "seed": 42,
        },
        {
            "name": "城市交通出行网络",
            "industry": IndustryType.government,
            "description": (
                "围绕公交站点、道路节点、换乘枢纽与重点区域形成的出行网络，"
                "用于城市治理协同、路径验证与公共服务分析。"
            ),
            "node_meaning": "站点 / 路口 / 区域 / 线路",
            "edge_meaning": "连通关系 / 换乘关系 / 区域到达关系",
            "subject_type": "交通实体",
            "data_source": "城市综合交通治理平台",
            "sensitivity_level": 3,
            "compliance_tags": ["城市治理", "公共数据开放", "交通协同"],
            "authorization_scope": "限公共服务分析、仿真评估与可验证查询",
            "owner_id": admin.id,
            "graph_gen": generate_government_graph,
            "seed": 17,
        },
        {
            "name": "供应链协同关系网络",
            "industry": IndustryType.finance,
            "description": (
                "围绕核心企业、供应商、物流节点与履约环节构建的协同关系网络，"
                "用于结构稳定性分析、风险联查与策略回溯。"
            ),
            "node_meaning": "核心企业 / 供应商 / 园区 / 物流节点",
            "edge_meaning": "供货关系 / 履约关系 / 仓配协同 / 风险传导关系",
            "subject_type": "供应链主体",
            "data_source": "供应链协同治理样本库",
            "sensitivity_level": 3,
            "compliance_tags": ["供应链协同", "数据安全法", "业务审阅"],
            "authorization_scope": "限业务观察、结构评估与审计复核使用",
            "owner_id": analyst.id,
            "graph_gen": generate_social_graph,
            "seed": 42,
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
        G = adef["graph_gen"](seed=adef.get("seed", 42))
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
    """Create curated data-sharing contracts."""
    admin   = users["admin"]
    analyst = users["analyst"]
    auditor = users["auditor"]
    observer = users["observer"]

    now = datetime.utcnow()
    contract_defs = [
        {
            "title": "金融数据共享授权协议（风控分析）",
            "provider_id": admin.id,
            "consumer_id": analyst.id,
            "purpose": (
                "授权数据分析师在受控环境中对金融交易关系图谱执行联合风控分析，"
                "仅可输出统计结果与证明材料，不得导出原始敏感字段。"
            ),
            "valid_from": now - timedelta(days=30),
            "valid_until": now + timedelta(days=335),
            "accessible_fields": ["node_id", "edge_weight", "risk_tag", "transaction_amount"],
            "allowed_algorithms": ["graph_sdp", "gs_ldp", "vpcs"],
            "privacy_budget_limit": 2.0,
            "status": ContractStatus.active,
        },
        {
            "title": "医疗科研脱敏数据使用协议",
            "provider_id": analyst.id,
            "consumer_id": auditor.id,
            "purpose": (
                "授权科研审查方对医疗协同诊疗网络执行匿名化统计分析，"
                "全过程需满足科研合规审批与患者隐私保护要求。"
            ),
            "valid_from": now - timedelta(days=15),
            "valid_until": now + timedelta(days=180),
            "accessible_fields": ["node_type", "edge_label", "degree", "cluster_score"],
            "allowed_algorithms": ["ndkd", "gcc_sdp"],
            "privacy_budget_limit": 1.5,
            "status": ContractStatus.active,
        },
        {
            "title": "政务开放数据共享授权协议",
            "provider_id": admin.id,
            "consumer_id": observer.id,
            "purpose": (
                "授权业务观察员在政务沙箱中访问目录化政务关系数据，"
                "用于公共服务分析、可验证推理与审计核验。"
            ),
            "valid_from": now - timedelta(days=3),
            "valid_until": now + timedelta(days=120),
            "accessible_fields": ["node_label", "edge_type", "service_code"],
            "allowed_algorithms": ["zkgcn", "vpcs"],
            "privacy_budget_limit": 1.0,
            "status": ContractStatus.pending,
        },
        {
            "title": "企业画像联合分析授权协议",
            "provider_id": admin.id,
            "consumer_id": auditor.id,
            "purpose": (
                "支持企业风控关联图谱的画像构建与审计复核，"
                "允许输出风险等级、关系摘要与模型解释，不得导出明细原始记录。"
            ),
            "valid_from": now - timedelta(days=20),
            "valid_until": now + timedelta(days=240),
            "accessible_fields": ["entity_id", "shareholder_path", "risk_level", "case_count"],
            "allowed_algorithms": ["graph_sdp", "zkgcn"],
            "privacy_budget_limit": 1.8,
            "status": ContractStatus.active,
        },
        {
            "title": "城市交通出行网络共享协议",
            "provider_id": admin.id,
            "consumer_id": analyst.id,
            "purpose": (
                "支持城市交通出行网络的路径约束查询、拥堵传播分析和治理评估，"
                "仅用于公共服务优化，不得识别个体出行轨迹。"
            ),
            "valid_from": now - timedelta(days=10),
            "valid_until": now + timedelta(days=150),
            "accessible_fields": ["station_id", "route_segment", "travel_time", "region_code"],
            "allowed_algorithms": ["vpcs", "graph_sdp"],
            "privacy_budget_limit": 1.2,
            "status": ContractStatus.suspended,
        },
        {
            "title": "供应链协同网络审阅协议",
            "provider_id": analyst.id,
            "consumer_id": observer.id,
            "purpose": (
                "支持供应链协同关系网络的只读审阅、结构评估与异常复核，"
                "禁止导出可逆识别信息或外发明细数据。"
            ),
            "valid_from": now - timedelta(days=120),
            "valid_until": now - timedelta(days=2),
            "accessible_fields": ["node_degree", "supplier_group", "relation_type"],
            "allowed_algorithms": ["gs_ldp", "ndkd"],
            "privacy_budget_limit": 0.8,
            "status": ContractStatus.terminated,
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
    """Create curated audit log entries covering the major platform workflows."""
    admin   = users["admin"]
    analyst = users["analyst"]
    auditor = users["auditor"]
    observer = users["observer"]

    finance_asset  = assets.get("金融交易关系图谱")
    medical_asset  = assets.get("医疗协同诊疗网络")
    gov_asset      = assets.get("政务开放数据关联图")
    traffic_asset  = assets.get("城市交通出行网络")
    social_asset   = assets.get("供应链协同关系网络")

    # Check if audit logs already seeded (look for a known action)
    row = await session.execute(
        select(AuditLog).where(AuditLog.action == "平台就绪检查").limit(1)
    )
    if row.scalar_one_or_none():
        print("  [skip] audit logs already seeded")
        return

    log_defs = [
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="平台就绪检查",
            target_type="system", target_id="0",
            result=AuditResult.success,
            detail={"message": "平台核心模块初始化完成，基线数据包加载成功。"},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="登记资产",
            target_type="asset", target_id=str(finance_asset.id) if finance_asset else "1",
            result=AuditResult.success,
            detail={"asset_name": "金融交易关系图谱", "industry": "finance", "node_count": 50, "edge_count": 154},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="生成图快照",
            target_type="asset", target_id=str(medical_asset.id) if medical_asset else "2",
            result=AuditResult.success,
            detail={"asset_name": "医疗协同诊疗网络", "snapshot_version": "v2026.04", "node_count": 40, "edge_count": 96},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="提交合约审批",
            target_type="contract", target_id="3",
            result=AuditResult.success,
            detail={"title": "政务开放数据共享授权协议", "status": "pending", "consumer": observer.username},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="激活合约",
            target_type="contract", target_id="1",
            result=AuditResult.success,
            detail={"title": "金融数据共享授权协议（风控分析）", "status": "active"},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="授权评估",
            target_type="asset", target_id=str(finance_asset.id) if finance_asset else "1",
            result=AuditResult.success,
            detail={"operation": "analyze", "matched_contract": "金融数据共享授权协议（风控分析）", "decision": "allow"},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="运行Graph-SDP",
            target_type="privacy_task", target_id="1",
            result=AuditResult.success,
            detail={"asset_name": "金融交易关系图谱", "epsilon": 1.0, "elapsed_ms": 23.5},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="运行GCC-SDP",
            target_type="privacy_task", target_id="2",
            result=AuditResult.success,
            detail={"asset_name": "医疗协同诊疗网络", "epsilon": 0.8, "elapsed_ms": 18.4},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="运行GS-LDP",
            target_type="privacy_task", target_id="3",
            result=AuditResult.success,
            detail={"asset_name": "企业风控关联图谱", "epsilon": 1.5, "elapsed_ms": 29.8},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="运行NDKD",
            target_type="privacy_task", target_id="4",
            result=AuditResult.success,
            detail={"asset_name": "医疗协同诊疗网络", "k": 3, "elapsed_ms": 45.2},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="执行VPCS查询",
            target_type="vpcs_query", target_id="1",
            result=AuditResult.success,
            detail={"asset_name": "城市交通出行网络", "source": "0", "target": "10", "verify_result": True, "elapsed_ms": 12.1},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="校验VPCS证明",
            target_type="vpcs_query", target_id="1",
            result=AuditResult.success,
            detail={"proof_hash": "vpcs-proof-20260426", "verify_result": True},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="执行zkGCN推理",
            target_type="zkgcn_proof", target_id="1",
            result=AuditResult.success,
            detail={"asset_name": "政务开放数据关联图", "model_type": "gcn", "verify_result": True, "elapsed_ms": 88.3},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="生成风险报告",
            target_type="risk_report", target_id="20260426",
            result=AuditResult.success,
            detail={"summary": "风险总体可控，高危事件已进入复核流程。"},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="验证审计链",
            target_type="audit_log", target_id="all",
            result=AuditResult.success,
            detail={"chain_intact": True, "total_records": 15},
        ),
        dict(
            username=observer.username, role="demo", user_id=observer.id,
            action="访问资产",
            target_type="asset", target_id=str(social_asset.id) if social_asset else "6",
            result=AuditResult.success,
            detail={"asset_name": "供应链协同关系网络", "operation": "read", "channel": "sandbox"},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="运行行业场景",
            target_type="scenario", target_id="finance",
            result=AuditResult.success,
            detail={"title": "金融联合风控", "modules": ["vpcs", "gs_ldp", "risk"]},
        ),
        dict(
            username=analyst.username, role="analyst", user_id=analyst.id,
            action="读取资产详情",
            target_type="asset", target_id=str(traffic_asset.id) if traffic_asset else "5",
            result=AuditResult.success,
            detail={"asset_name": "城市交通出行网络", "view": "detail_panel"},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="复核风险事件",
            target_type="risk_event", target_id="4",
            result=AuditResult.warning,
            detail={"event_type": "verify_failure", "status": "investigating"},
        ),
        dict(
            username=admin.username, role="admin", user_id=admin.id,
            action="巡检系统接口",
            target_type="system", target_id="diagnostics",
            result=AuditResult.success,
            detail={"checked": ["/health", "/api/assets", "/api/contracts", "/api/risks", "/api/audit/logs"]},
        ),
        dict(
            username=auditor.username, role="auditor", user_id=auditor.id,
            action="创建资产",
            target_type="asset", target_id=str(medical_asset.id) if medical_asset else "2",
            result=AuditResult.success,
            detail={"asset_name": "医疗协同诊疗网络", "industry": "medical", "node_count": 40},
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
    """Create 3 pre-configured business scenarios."""
    scenario_defs = [
        {
            "scenario_key": ScenarioKey.finance,
            "title": "金融联合风控",
            "description": (
                "围绕联合风控、资金链核验与风险共治，打通资产治理、授权、可验证查询与风险处置流程。"
            ),
            "asset_name": "金融交易关系图谱",
            "steps": [
                {"step": 1, "title": "确认资产与授权边界", "description": "核验金融交易关系图谱及共享协议"},
                {"step": 2, "title": "执行 VPCS 路径查询", "description": "输出受约束最优路径与 proof hash"},
                {"step": 3, "title": "运行 GS-LDP", "description": "形成脱敏统计结果与指标对比"},
                {"step": 4, "title": "生成联合风控结论", "description": "同步风险评分与治理建议"},
            ],
        },
        {
            "scenario_key": ScenarioKey.medical,
            "title": "医疗科研共享",
            "description": (
                "围绕科研共享与隐私保护评估，展示医疗协同诊疗网络的匿名化、统计发布与审计闭环。"
            ),
            "asset_name": "医疗协同诊疗网络",
            "steps": [
                {"step": 1, "title": "加载科研共享资产", "description": "确认场景、范围与合规标签"},
                {"step": 2, "title": "运行 NDKD 匿名化", "description": "保护患者连接模式与结构特征"},
                {"step": 3, "title": "发布 GCC-SDP 统计结果", "description": "输出聚类系数脱敏指标"},
                {"step": 4, "title": "生成科研共享报告", "description": "沉淀审计与使用说明"},
            ],
        },
        {
            "scenario_key": ScenarioKey.government,
            "title": "政务数据开放",
            "description": (
                "围绕政务数据开放流通，展示资产确权、共享授权、可验证推理与审计链校验的完整流程。"
            ),
            "asset_name": "政务开放数据关联图",
            "steps": [
                {"step": 1, "title": "登记政务开放资产", "description": "生成确权凭证与图快照摘要"},
                {"step": 2, "title": "创建共享授权协议", "description": "完成审批与可调用范围约束"},
                {"step": 3, "title": "运行 zkGCN 推理", "description": "输出推理结果与零知识证明"},
                {"step": 4, "title": "校验审计链完整性", "description": "展示篡改可检测能力"},
            ],
        },
    ]

    for sdef in scenario_defs:
        row = await session.execute(
            select(DemoScenario).where(DemoScenario.scenario_key == sdef["scenario_key"])
        )
        existing = row.scalar_one_or_none()
        if existing:
            print(f"  [skip] scenario '{sdef['title']}' already exists")
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
        print(f"  [ok]   created scenario '{sdef['title']}'")


async def _seed_risk_events(
    session, users: dict[str, User], assets: dict[str, Asset]
) -> None:
    """Create curated risk events for the monitoring dashboard."""
    admin   = users["admin"]
    analyst = users["analyst"]
    observer = users["observer"]

    finance_asset = assets.get("金融交易关系图谱")
    medical_asset = assets.get("医疗协同诊疗网络")
    gov_asset     = assets.get("政务开放数据关联图")
    traffic_asset = assets.get("城市交通出行网络")
    enterprise_asset = assets.get("企业风控关联图谱")

    # Check idempotency
    row = await session.execute(
        select(RiskEvent).limit(1)
    )
    if row.scalar_one_or_none():
        print("  [skip] risk events already seeded")
        return

    risk_defs = [
        {
            "event_type": RiskEventType.unauthorized_access,
            "severity": RiskSeverity.critical,
            "asset_id": enterprise_asset.id if enterprise_asset else None,
            "user_id": observer.id,
            "description": (
                "跨机构联合建模任务尝试读取未授权的企业诉讼明细字段，"
                "RBAC/ABAC 策略已阻断本次访问。"
            ),
            "detail": {
                "attempted_field": "litigation_detail",
                "policy_id": 4,
                "blocked": True,
            },
            "risk_score": 92.0,
            "status": RiskStatus.open,
        },
        {
            "event_type": RiskEventType.budget_exceeded,
            "severity": RiskSeverity.high,
            "asset_id": medical_asset.id if medical_asset else None,
            "user_id": analyst.id,
            "description": (
                "医疗科研任务累计消耗隐私预算 1.9，超过协议约定上限 1.5，"
                "系统已暂停后续查询并要求复核。"
            ),
            "detail": {
                "budget_used": 1.9,
                "budget_limit": 1.5,
                "algorithm": "gcc_sdp",
                "last_epsilon": 0.6,
            },
            "risk_score": 76.0,
            "status": RiskStatus.investigating,
        },
        {
            "event_type": RiskEventType.expired_access,
            "severity": RiskSeverity.medium,
            "asset_id": traffic_asset.id if traffic_asset else None,
            "user_id": analyst.id,
            "description": (
                "城市交通出行网络的共享协议已暂停，但仍有路径查询任务尝试继续执行，"
                "系统已自动拦截。"
            ),
            "detail": {
                "contract_title": "城市交通出行网络共享协议",
                "contract_status": "suspended",
                "blocked": True,
            },
            "risk_score": 58.0,
            "status": RiskStatus.resolved,
        },
        {
            "event_type": RiskEventType.verify_failure,
            "severity": RiskSeverity.high,
            "asset_id": gov_asset.id if gov_asset else None,
            "user_id": analyst.id,
            "description": (
                "zkGCN 推理结果校验时出现 proof hash 不一致，"
                "系统判定模型参数或输出结果存在篡改风险。"
            ),
            "detail": {
                "proof_hash": "zk-proof-20260426",
                "verify_result": False,
                "tampered": True,
            },
            "risk_score": 84.0,
            "status": RiskStatus.investigating,
        },
        {
            "event_type": RiskEventType.anomaly_access,
            "severity": RiskSeverity.medium,
            "asset_id": finance_asset.id if finance_asset else None,
            "user_id": observer.id,
            "description": (
                "短时间内针对金融交易关系图谱发起高频路径查询，"
                "访问频率超过安全基线，已触发行为预警。"
            ),
            "detail": {
                "access_count": 27,
                "time_window": "2026-04-26 09:00~09:20",
                "threshold": 12,
            },
            "risk_score": 61.0,
            "status": RiskStatus.open,
        },
        {
            "event_type": RiskEventType.data_quality,
            "severity": RiskSeverity.low,
            "asset_id": traffic_asset.id if traffic_asset else None,
            "user_id": admin.id,
            "description": (
                "城市交通出行网络检测到部分站点边属性缺失，"
                "建议补齐通行时长与拥堵等级后再执行评估任务。"
            ),
            "detail": {
                "missing_edge_attributes": 7,
                "asset_name": "城市交通出行网络",
                "recommendation": "补齐 travel_time 与 congestion_level 字段",
            },
            "risk_score": 24.0,
            "status": RiskStatus.resolved,
        },
        {
            "event_type": RiskEventType.anomaly_access,
            "severity": RiskSeverity.low,
            "asset_id": gov_asset.id if gov_asset else None,
            "user_id": admin.id,
            "description": (
                "政务开放数据关联图在晚间窗口出现批量元数据刷新，"
                "虽属授权运维任务，但已记录为提示级巡检事件。"
            ),
            "detail": {
                "job_type": "metadata_refresh",
                "window": "2026-04-26 22:00",
                "operator": "system-maintenance",
            },
            "risk_score": 12.0,
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
    print("  数智安行｜图数据可信治理与智能流通平台")
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

            # 6. Business scenarios
            print("\n[5b/6] 创建行业方案场景...")
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
            print("    observer / observer123 (业务观察员)")
            print("========================================")

        except Exception as exc:
            await session.rollback()
            print(f"\n[ERROR] 种子数据加载失败: {exc}")
            raise


if __name__ == "__main__":
    asyncio.run(main())

"""
api/demo.py
Demo scenario orchestration endpoints for 数智安行 platform.

Three industry scenarios:
  • finance    – VPCS + GS-LDP + risk evaluation on a financial graph
  • medical    – NDKD + GCC-SDP + privacy report on a medical graph
  • government – Asset registration + contract creation + audit chain verification
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, GraphSnapshot, DemoScenario
from app.services.audit_service import create_audit_log, verify_audit_chain
from app.services.risk_service import evaluate_risk
from app.algorithms.graph_utils import (
    generate_financial_graph,
    generate_medical_graph,
    generate_government_graph,
    graph_to_dict,
    get_graph_stats,
)
from app.algorithms.vpcs import run_vpcs_query
from app.algorithms.gs_ldp import run_gs_ldp
from app.algorithms.ndkd import run_ndkd
from app.algorithms.gcc_sdp import run_gcc_sdp
from app.algorithms.zkgcn import run_zkgcn_infer

router = APIRouter()


# ---------------------------------------------------------------------------
# Static scenario metadata
# ---------------------------------------------------------------------------

_SCENARIOS: dict[str, dict] = {
    "finance": {
        "key": "finance",
        "title": "金融联合风控",
        "description": (
            "围绕跨机构风控联防需求，平台在不暴露原始交易明细的前提下，"
            "完成关系图谱登记、授权校验、隐私查询验证与风险评估闭环。"
        ),
        "participants": ["商业银行", "消费金融机构", "监管专班", "平台运营方"],
        "assets": ["金融交易关系图谱", "企业风控关联图谱"],
        "capabilities": ["数据资产治理", "VPCS 可验证查询", "GS-LDP 隐私保护", "风险联动预警"],
        "steps": [
            "核验金融关系图谱资产与授权边界",
            "执行 VPCS 约束路径查询并校验证明",
            "运行 GS-LDP 输出脱敏统计结果",
            "联动风险引擎生成联合风控结论",
        ],
        "key_features": [
            "多机构联合分析不出域",
            "路径查询 proof hash 可验证",
            "隐私预算可控且全程可审计",
            "风险告警与治理建议同步输出",
        ],
        "value": "适用于贷前反欺诈、关联交易识别与异常资金链排查。",
    },
    "medical": {
        "key": "medical",
        "title": "医疗科研共享",
        "description": (
            "面向多中心科研协同，平台对诊疗关联网络进行匿名化与差分隐私处理，"
            "在确保合规前提下输出科研可用的统计与验证结果。"
        ),
        "participants": ["三甲医院", "医学院研究中心", "卫健监管部门", "平台运营方"],
        "assets": ["医疗协同诊疗网络"],
        "capabilities": ["资产登记", "NDKD 匿名化", "GCC-SDP 统计发布", "审计追踪"],
        "steps": [
            "装载医疗协同诊疗网络与使用协议",
            "运行 NDKD 匿名化保护患者连接模式",
            "发布 GCC-SDP 聚类系数脱敏统计",
            "形成科研共享报告并沉淀审计记录",
        ],
        "key_features": [
            "患者身份与诊疗关系双重保护",
            "科研统计结果可复核可追溯",
            "授权、算法与审计形成闭环",
            "兼顾数据可用性与合规性",
        ],
        "value": "适用于多中心科研、病例联邦分析与医疗数据开放审查。",
    },
    "government": {
        "key": "government",
        "title": "政务数据开放",
        "description": (
            "围绕政务数据开放流通，平台完成确权登记、共享授权、"
            "可验证推理与审计链校验，形成可答辩展示的完整流程。"
        ),
        "participants": ["政务数据管理局", "公共服务企业", "审计专员", "平台运营方"],
        "assets": ["政务开放数据关联图", "城市交通出行网络"],
        "capabilities": ["确权存证", "共享授权", "zkGCN 可验证推理", "审计链校验"],
        "steps": [
            "登记政务开放数据资产并生成凭证",
            "创建共享授权协议并完成生效",
            "运行 zkGCN 推理并输出 proof hash",
            "校验审计链完整性与篡改检测能力",
        ],
        "key_features": [
            "确权、授权、推理、审计全链条贯通",
            "推理结论与证明结果可同步展示",
            "政务开放数据使用边界清晰",
            "异常篡改可被即时识别",
        ],
        "value": "适用于政务目录开放、城市治理协同与公共服务智能分析。",
    },
}


# ---------------------------------------------------------------------------
# Helper: ensure demo asset + snapshot exist
# ---------------------------------------------------------------------------


async def _ensure_demo_asset(
    db: AsyncSession,
    industry: str,
    name: str,
) -> tuple[Asset, dict]:
    """
    Return (asset, graph_dict) for the demo industry.
    Creates the asset + snapshot if it doesn't exist.
    """
    import hashlib
    import json

    # Check if a demo asset for this industry already exists
    row = await db.execute(
        select(Asset)
        .where(Asset.industry == industry)
        .where(Asset.name == name)
        .limit(1)
    )
    asset: Asset | None = row.scalar_one_or_none()

    if industry == "finance":
        G = generate_financial_graph(seed=42)
    elif industry == "medical":
        G = generate_medical_graph(seed=42)
    else:
        G = generate_government_graph(seed=42)

    graph_dict = graph_to_dict(G)
    stats = get_graph_stats(G)

    if asset is None:
        ts = datetime.utcnow().isoformat()
        asset_hash = hashlib.sha256(f"{name}|{industry}|{ts}".encode()).hexdigest()
        credential = hashlib.sha256(f"cred:{asset_hash}".encode()).hexdigest()
        chain_record = json.dumps({
            "timestamp": ts,
            "hash": asset_hash,
            "block_sim": asset_hash[:16],
            "chain": "数智安行-chain-v1",
        })

        snap = GraphSnapshot(
            asset_id=None,
            nodes=graph_dict["nodes"],
            edges=graph_dict["edges"],
            node_count=stats["node_count"],
            edge_count=stats["edge_count"],
        )
        db.add(snap)
        await db.flush()
        await db.refresh(snap)

        asset = Asset(
            name=name,
            industry=industry,
            description=_SCENARIOS[industry]["description"][:200],
            data_source={
                "finance": "金融交易监测专线脱敏库",
                "medical": "区域协同诊疗平台脱敏数据仓",
                "government": "政务开放数据目录平台",
            }[industry],
            subject_type={
                "finance": "机构与账户主体",
                "medical": "医疗机构与患者主体",
                "government": "政务实体与公共服务对象",
            }[industry],
            node_meaning={
                "finance": "客户、账户、商户、设备",
                "medical": "医院、科室、病例、检查项目",
                "government": "企业、许可证、区域、交通设施",
            }[industry],
            edge_meaning={
                "finance": "交易、持有、关联、担保",
                "medical": "就诊、转诊、检查、诊断关联",
                "government": "审批、归属、服务、治理关联",
            }[industry],
            authorization_scope="经合约审批后可用于统计分析与可验证计算",
            asset_hash=asset_hash,
            ownership_credential=credential,
            chain_record=chain_record,
            graph_snapshot_id=snap.id,
            status="active",
            sensitivity_level=4 if industry in {"finance", "medical"} else 3,
            compliance_tags={
                "finance": ["金融数据安全", "反洗钱", "个人信息保护法"],
                "medical": ["HIPAA", "医疗数据保护", "科研脱敏"],
                "government": ["数据安全法", "政务数据开放", "确权存证"],
            }[industry],
        )
        db.add(asset)
        await db.flush()
        await db.refresh(asset)
        snap.asset_id = asset.id
        await db.flush()

    return asset, graph_dict


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/scenarios")
async def list_scenarios() -> dict:
    """List all available demo scenarios with their descriptions and steps."""
    items = [
        {
            "id": key,
            "key": key,
            "scenario_key": key,
            "scenario_id": key,
            "name": value["title"],
            "title": value["title"],
            "description": value["description"],
            "industry": "金融" if key == "finance" else "医疗" if key == "medical" else "政务",
            "actors": value["participants"],
            "assets": value["assets"],
            "capabilities": value["capabilities"],
            "technologies": value["key_features"],
            "steps": value["steps"],
            "value": value["value"],
        }
        for key, value in _SCENARIOS.items()
    ]
    return {
        "total": len(_SCENARIOS),
        "items": items,
        "scenarios": items,
    }


@router.get("/scenarios/{scenario}")
async def get_scenario(scenario: str) -> dict:
    """Get details for a specific demo scenario."""
    info = _SCENARIOS.get(scenario)
    if info is None:
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{scenario}' not found. Choose: finance, medical, government.",
        )
    return info


@router.post("/run/{scenario}", status_code=status.HTTP_201_CREATED)
async def run_scenario(
    scenario: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Run a complete demo scenario end-to-end.

    Returns combined results from all steps plus summary metrics.
    """
    if scenario not in _SCENARIOS:
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{scenario}' not found. Choose: finance, medical, government.",
        )

    t_start = time.time()
    results: dict[str, Any] = {}
    steps_completed = 0

    # ----------------------------------------------------------------
    # FINANCE scenario
    # ----------------------------------------------------------------
    if scenario == "finance":
        asset, graph_dict = await _ensure_demo_asset(db, "finance", "金融交易关系图谱")

        # Step 1 – VPCS query
        nodes = graph_dict["nodes"]
        src = str(nodes[0]["id"]) if nodes else "0"
        tgt = str(nodes[min(10, len(nodes) - 1)]["id"]) if nodes else "10"

        vpcs_result = run_vpcs_query(
            graph_dict,
            source_node=src,
            target_node=tgt,
            cost_threshold=5000.0,
            time_threshold=72.0,
            distance_constraint=6.0,
            budget=2000.0,
            tampered=False,
        )
        results["vpcs"] = {
            "source": vpcs_result["source_node"],
            "target": vpcs_result["target_node"],
            "path": vpcs_result["result_path"],
            "distance": vpcs_result["result_distance"],
            "cost": vpcs_result["result_cost"],
            "verify_result": vpcs_result["verify_result"],
            "dummy_edges": vpcs_result["dummy_edge_count"],
        }
        steps_completed += 1

        # Step 2 – GS-LDP
        gs_result = run_gs_ldp(
            graph_dict,
            epsilon=1.5,
            randomize_edges=True,
            randomize_attributes=True,
            edge_flip_prob=0.05,
            attr_noise_scale=0.3,
            seed=42,
        )
        results["gs_ldp"] = {
            "epsilon": 1.5,
            "original_edges": gs_result["result"]["true_edge_count"],
            "noisy_edges": gs_result["result"]["noisy_edge_count"],
            "l1_degree_distribution": gs_result["metrics"]["l1_degree_distribution"],
            "elapsed_ms": gs_result["elapsed_ms"],
        }
        steps_completed += 1

        # Step 3 – Risk evaluation
        risk_result = await evaluate_risk(
            db,
            context={
                "access_frequency": 120,
                "frequency_threshold": 100,
                "authorization": "valid",
                "privacy_budget_used": 1.5,
                "privacy_budget_limit": 2.0,
                "verify_result": True,
                "quality_score": 0.85,
                "contract_status": "active",
            },
            asset_id=asset.id,
        )
        results["risk"] = risk_result
        steps_completed += 1

        await create_audit_log(
            db,
            username="system",
            role="analyst",
            action="run_demo_scenario_finance",
            target_type="scenario",
            target_id=str(asset.id),
            result="success",
            detail={"steps_completed": steps_completed},
        )

        metrics = {
            "asset_id": asset.id,
            "graph_nodes": len(graph_dict["nodes"]),
            "graph_edges": len(graph_dict["edges"]),
            "vpcs_verify": vpcs_result["verify_result"],
            "privacy_epsilon": 1.5,
            "risk_score": risk_result["risk_score"],
        }

    # ----------------------------------------------------------------
    # MEDICAL scenario
    # ----------------------------------------------------------------
    elif scenario == "medical":
        asset, graph_dict = await _ensure_demo_asset(db, "medical", "医疗协同诊疗网络")

        # Step 1 – NDKD
        ndkd_result = run_ndkd(
            graph_dict,
            k=3,
            epsilon=1.0,
            degree_threshold=2,
            suppress_outliers=True,
            seed=42,
        )
        results["ndkd"] = {
            "k": 3,
            "k_anonymity_satisfied": ndkd_result["result"]["k_anonymity_satisfied"],
            "min_group_size": ndkd_result["result"]["min_group_size"],
            "original_edges": ndkd_result["result"]["original_stats"]["edge_count"],
            "anonymised_edges": ndkd_result["result"]["anonymised_stats"]["edge_count"],
            "utility_score": ndkd_result["metrics"].get("utility_score"),
            "elapsed_ms": ndkd_result["elapsed_ms"],
        }
        steps_completed += 1

        # Step 2 – GCC-SDP
        gcc_result = run_gcc_sdp(
            graph_dict,
            epsilon=0.8,
            seed=42,
        )
        results["gcc_sdp"] = {
            "epsilon": 0.8,
            "true_global_cc": gcc_result["result"]["true_global_cc"],
            "noisy_global_cc": gcc_result["result"]["noisy_global_cc_laplace"],
            "absolute_delta": gcc_result["metrics"]["laplace_noise_absolute_delta"],
            "elapsed_ms": gcc_result["elapsed_ms"],
        }
        steps_completed += 1

        # Step 3 – ZK-GCN for medical graph
        zkgcn_result = run_zkgcn_infer(
            graph_dict,
            model_type="gcn",
            layers=2,
            hidden_dim=32,
            num_classes=4,  # hospital/patient/disease/test
            tampered=False,
            seed=42,
        )
        results["zkgcn"] = {
            "verify_result": zkgcn_result["verify_result"],
            "num_classes": 4,
            "mean_confidence": zkgcn_result["inference_result"]["mean_confidence"],
            "class_distribution": zkgcn_result["inference_result"]["class_distribution"],
            "proof_size_kb": zkgcn_result["proof_size_kb"],
            "elapsed_ms": zkgcn_result["elapsed_ms"],
        }
        steps_completed += 1

        await create_audit_log(
            db,
            username="system",
            role="analyst",
            action="run_demo_scenario_medical",
            target_type="scenario",
            target_id=str(asset.id),
            result="success",
            detail={"steps_completed": steps_completed},
        )

        metrics = {
            "asset_id": asset.id,
            "graph_nodes": len(graph_dict["nodes"]),
            "graph_edges": len(graph_dict["edges"]),
            "k_anonymity": 3,
            "k_satisfied": ndkd_result["result"]["k_anonymity_satisfied"],
            "privacy_epsilon_ndkd": 1.0,
            "privacy_epsilon_gcc": 0.8,
            "zkgcn_verified": zkgcn_result["verify_result"],
        }

    # ----------------------------------------------------------------
    # GOVERNMENT scenario
    # ----------------------------------------------------------------
    else:  # government
        asset, graph_dict = await _ensure_demo_asset(db, "government", "政务开放数据关联图")

        # Step 1 – Asset registration result (already done in _ensure_demo_asset)
        results["asset_registration"] = {
            "asset_id": asset.id,
            "name": asset.name,
            "asset_hash": asset.asset_hash,
            "ownership_credential": asset.ownership_credential,
            "status": asset.status if isinstance(asset.status, str) else asset.status.value,
        }
        steps_completed += 1

        # Step 2 – Contract creation (inline, no DB flush needed for demo)
        import hashlib, json as _json
        from app.models import Contract, AuthorizationPolicy
        ts = datetime.utcnow().isoformat()
        chash = hashlib.sha256(f"gov-open-contract|{ts}".encode()).hexdigest()

        contract = Contract(
            title="政务开放数据共享授权协议",
            provider_id=None,
            consumer_id=None,
            purpose="支持公共服务分析与目录开放核验，不得用于识别单一主体。",
            valid_from=datetime.utcnow(),
            accessible_fields=["company_name", "license_type", "region"],
            allowed_algorithms=["graph_sdp", "ndkd", "zkgcn"],
            privacy_budget_limit=2.0,
            status="active",
            contract_hash=chash,
        )
        db.add(contract)
        await db.flush()
        await db.refresh(contract)

        policy = AuthorizationPolicy(
            contract_id=contract.id,
            asset_id=asset.id,
            rbac_roles=["analyst", "auditor"],
            abac_attrs={"clearance": "level-2"},
            allowed_operations=["read", "query", "run_algorithm"],
        )
        db.add(policy)
        await db.flush()

        results["contract"] = {
            "contract_id": contract.id,
            "title": contract.title,
            "status": contract.status,
            "contract_hash": contract.contract_hash,
            "allowed_algorithms": contract.allowed_algorithms,
        }
        steps_completed += 1

        # Step 3 – ZK-GCN inference
        zkgcn_result = run_zkgcn_infer(
            graph_dict,
            model_type="gcn",
            layers=2,
            hidden_dim=64,
            num_classes=4,  # company/license/region/transport
            tampered=False,
            seed=42,
        )
        results["zkgcn"] = {
            "verify_result": zkgcn_result["verify_result"],
            "num_classes": 4,
            "mean_confidence": zkgcn_result["inference_result"]["mean_confidence"],
            "proof_size_kb": zkgcn_result["proof_size_kb"],
            "elapsed_ms": zkgcn_result["elapsed_ms"],
        }
        steps_completed += 1

        # Step 4 – Audit chain verification
        chain_result = await verify_audit_chain(db)
        results["audit_chain"] = {
            "total_records": chain_result["total_records"],
            "chain_intact": chain_result["chain_intact"],
            "valid_count": chain_result["valid_count"],
            "tampered_count": chain_result["invalid_count"],
        }
        steps_completed += 1

        await create_audit_log(
            db,
            username="system",
            role="auditor",
            action="run_demo_scenario_government",
            target_type="scenario",
            target_id=str(asset.id),
            result="success",
            detail={"steps_completed": steps_completed},
        )

        metrics = {
            "asset_id": asset.id,
            "contract_id": contract.id,
            "graph_nodes": len(graph_dict["nodes"]),
            "graph_edges": len(graph_dict["edges"]),
            "zkgcn_verified": zkgcn_result["verify_result"],
            "audit_chain_intact": chain_result["chain_intact"],
            "audit_total_records": chain_result["total_records"],
        }

    elapsed_ms = round((time.time() - t_start) * 1000.0, 2)

    return {
        "scenario": scenario,
        "status": "success",
        "title": _SCENARIOS[scenario]["title"],
        "steps_completed": steps_completed,
        "results": results,
        "metrics": metrics,
        "modules_used": _SCENARIOS[scenario]["capabilities"],
        "assets": _SCENARIOS[scenario]["assets"],
        "value_summary": _SCENARIOS[scenario]["value"],
        "elapsed_ms": elapsed_ms,
        "duration_ms": elapsed_ms,
        "message": f"{_SCENARIOS[scenario]['title']} 流程已执行完成，可用于现场讲解。",
        "steps": [
            {
                "id": f"{scenario}-{index + 1}",
                "name": step,
                "description": step,
                "status": "completed" if index < steps_completed else "pending",
            }
            for index, step in enumerate(_SCENARIOS[scenario]["steps"])
        ],
    }

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
        "title": "金融数据安全共享",
        "description": (
            "模拟金融机构之间的数据共享场景：在保护用户隐私的前提下，"
            "通过 VPCS 安全查询资金流转路径，并使用 GS-LDP "
            "对交易网络度分布进行本地差分隐私保护，最后进行风险评估。"
        ),
        "steps": [
            "注册金融图数据资产（50节点：用户/账户/商户）",
            "执行 VPCS 约束最短路径查询（资金流转路径验证）",
            "运行 GS-LDP 本地差分隐私保护（交易度分布脱敏）",
            "风险评估（检测异常访问频率与预算超支）",
        ],
        "key_features": [
            "零知识路径证明防止路由信息泄露",
            "本地差分隐私保护单个用户的交易行为",
            "全链路审计日志（哈希链式不可篡改）",
            "实时风险感知与访问频率监控",
        ],
    },
    "medical": {
        "key": "medical",
        "title": "医疗数据隐私发布",
        "description": (
            "模拟医疗机构的患者数据发布场景：使用 NDKD k-度匿名化保护"
            "患者节点的度数信息，通过 GCC-SDP 差分隐私发布聚类系数统计，"
            "并生成隐私保护分析报告。"
        ),
        "steps": [
            "注册医疗图数据资产（40节点：医院/患者/疾病/检测）",
            "运行 NDKD k-度匿名化（保护患者就诊连接模式）",
            "运行 GCC-SDP 聚类系数差分隐私发布",
            "生成医疗数据隐私保护分析报告",
        ],
        "key_features": [
            "k-度匿名防止患者病情通过图结构推断",
            "差分隐私聚类系数保护诊断关联关系",
            "邻居子图扰动进一步混淆患者关系网络",
            "合规性标签与授权范围管理",
        ],
    },
    "government": {
        "key": "government",
        "title": "政务数据确权流通",
        "description": (
            "模拟政府数据开放场景：注册政务图资产并生成确权凭证，"
            "创建数据共享合约并进行授权管理，运行 ZK-GCN 推理验证，"
            "最后验证全链路审计日志的完整性。"
        ),
        "steps": [
            "注册政务图数据资产（45节点：企业/许可证/区域/交通）",
            "创建数据共享合约并激活",
            "运行 ZK-GCN 零知识推理证明",
            "验证全链路审计哈希链完整性",
        ],
        "key_features": [
            "区块链式确权存证（asset_hash + ownership_credential）",
            "合约全生命周期管理（草稿→待激活→激活→终止）",
            "零知识 GCN 推理：证明模型正确执行而不泄露模型权重",
            "哈希链式审计日志篡改检测演示",
        ],
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
            asset_hash=asset_hash,
            ownership_credential=credential,
            chain_record=chain_record,
            graph_snapshot_id=snap.id,
            status="active",
            sensitivity_level=2,
            compliance_tags=["demo", industry],
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
    return {
        "total": len(_SCENARIOS),
        "scenarios": list(_SCENARIOS.values()),
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
        asset, graph_dict = await _ensure_demo_asset(db, "finance", "金融交易网络-演示")

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
            username="demo",
            role="demo",
            action="run_demo_scenario_finance",
            target_type="demo",
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
        asset, graph_dict = await _ensure_demo_asset(db, "medical", "医疗患者网络-演示")

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
            username="demo",
            role="demo",
            action="run_demo_scenario_medical",
            target_type="demo",
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
        asset, graph_dict = await _ensure_demo_asset(db, "government", "政务数据网络-演示")

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
        chash = hashlib.sha256(f"demo-gov-contract|{ts}".encode()).hexdigest()

        contract = Contract(
            title="政务数据开放合约-演示",
            provider_id=None,
            consumer_id=None,
            purpose="演示政务数据安全流通能力",
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
            username="demo",
            role="demo",
            action="run_demo_scenario_government",
            target_type="demo",
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
        "title": _SCENARIOS[scenario]["title"],
        "steps_completed": steps_completed,
        "results": results,
        "metrics": metrics,
        "elapsed_ms": elapsed_ms,
    }

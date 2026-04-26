"""
api/privacy.py
Graph differential-privacy algorithm endpoints for 数智安行 platform.

Four algorithms:
  • Graph-SDP  – Shuffled Differential Privacy on degree distribution
  • GCC-SDP    – Clustering Coefficient differential privacy
  • GS-LDP     – Graph Statistics Local Differential Privacy
  • NDKD       – Neighbour-Subgraph Disturbance k-Degree Anonymity
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, GraphSnapshot, PrivacyTask
from app.schemas import (
    GraphSDPRequest,
    GCCSDPRequest,
    GSLDPRequest,
    NDKDRequest,
    PrivacyTaskResponse,
)
from app.services.audit_service import create_audit_log
from app.algorithms.graph_sdp import run_graph_sdp
from app.algorithms.gcc_sdp import run_gcc_sdp
from app.algorithms.gs_ldp import run_gs_ldp
from app.algorithms.ndkd import run_ndkd

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_graph_dict(db: AsyncSession, asset_id: int | None) -> dict:
    """Load graph snapshot dict for the given asset_id."""
    if asset_id is None:
        raise HTTPException(status_code=400, detail="asset_id is required.")

    asset_row = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset: Asset | None = asset_row.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found.")

    snap_id = asset.graph_snapshot_id
    if snap_id is None:
        raise HTTPException(
            status_code=404,
            detail=f"Asset {asset_id} has no graph snapshot. "
                   "Call POST /api/assets/{id}/graph/generate first.",
        )

    snap_row = await db.execute(select(GraphSnapshot).where(GraphSnapshot.id == snap_id))
    snap: GraphSnapshot | None = snap_row.scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail=f"Graph snapshot {snap_id} not found.")

    return {"nodes": snap.nodes, "edges": snap.edges}


async def _save_privacy_task(
    db: AsyncSession,
    asset_id: int | None,
    algorithm: str,
    params: dict,
    algo_result: dict,
    created_by: int | None = None,
) -> PrivacyTask:
    task = PrivacyTask(
        asset_id=asset_id,
        algorithm=algorithm,
        params=params,
        input_summary=algo_result.get("input_summary", {}),
        result=algo_result.get("result", {}),
        metrics=algo_result.get("metrics", {}),
        elapsed_ms=algo_result.get("elapsed_ms", 0.0),
        explanation_steps=algo_result.get("explanation_steps", []),
        created_by=created_by,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/graph-sdp", response_model=PrivacyTaskResponse, status_code=status.HTTP_201_CREATED)
async def run_graph_sdp_endpoint(
    body: GraphSDPRequest,
    db: AsyncSession = Depends(get_db),
) -> PrivacyTask:
    """
    Run Graph Shuffle Differential Privacy on a data asset's graph.

    Publishes a noisy degree distribution using the k-RR + Shuffle mechanism.
    """
    graph_dict = await _load_graph_dict(db, body.asset_id)

    algo_result = run_graph_sdp(
        graph_dict,
        epsilon=body.epsilon,
        L=getattr(body, "L", 10),
        seed=getattr(body, "seed", 42),
    )

    params = {
        "epsilon": body.epsilon,
        "delta": getattr(body, "delta", 1e-5),
        "noise_mechanism": getattr(body, "noise_mechanism", "laplace"),
        "L": getattr(body, "L", 10),
    }

    task = await _save_privacy_task(db, body.asset_id, "graph_sdp", params, algo_result,
                                    created_by=body.created_by)

    await create_audit_log(
        db,
        username="system",
        role="analyst",
        action="run_graph_sdp",
        target_type="privacy_task",
        target_id=str(task.id),
        result="success",
        detail={"asset_id": body.asset_id, "epsilon": body.epsilon,
                "elapsed_ms": algo_result.get("elapsed_ms")},
        user_id=body.created_by,
    )

    return task


@router.post("/gcc-sdp", response_model=PrivacyTaskResponse, status_code=status.HTTP_201_CREATED)
async def run_gcc_sdp_endpoint(
    body: GCCSDPRequest,
    db: AsyncSession = Depends(get_db),
) -> PrivacyTask:
    """
    Run Graph Clustering Coefficient Shuffle DP.

    Publishes noisy clustering coefficient statistics.
    """
    graph_dict = await _load_graph_dict(db, body.asset_id)

    algo_result = run_gcc_sdp(
        graph_dict,
        epsilon=body.epsilon,
        seed=getattr(body, "seed", 42),
    )

    params = {
        "epsilon": body.epsilon,
        "delta": getattr(body, "delta", 1e-5),
        "cluster_size": getattr(body, "cluster_size", 5),
    }

    task = await _save_privacy_task(db, body.asset_id, "gcc_sdp", params, algo_result,
                                    created_by=body.created_by)

    await create_audit_log(
        db,
        username="system",
        role="analyst",
        action="run_gcc_sdp",
        target_type="privacy_task",
        target_id=str(task.id),
        result="success",
        detail={"asset_id": body.asset_id, "epsilon": body.epsilon,
                "elapsed_ms": algo_result.get("elapsed_ms")},
        user_id=body.created_by,
    )

    return task


@router.post("/gs-ldp", response_model=PrivacyTaskResponse, status_code=status.HTTP_201_CREATED)
async def run_gs_ldp_endpoint(
    body: GSLDPRequest,
    db: AsyncSession = Depends(get_db),
) -> PrivacyTask:
    """
    Run Graph Statistics Local Differential Privacy.

    Each node perturbs its edges via Randomized Response before reporting.
    """
    graph_dict = await _load_graph_dict(db, body.asset_id)

    algo_result = run_gs_ldp(
        graph_dict,
        epsilon=body.epsilon,
        randomize_edges=body.randomize_edges,
        randomize_attributes=body.randomize_attributes,
        edge_flip_prob=body.edge_flip_prob,
        attr_noise_scale=body.attr_noise_scale,
        seed=getattr(body, "seed", 42),
    )

    params = {
        "epsilon": body.epsilon,
        "randomize_edges": body.randomize_edges,
        "randomize_attributes": body.randomize_attributes,
        "edge_flip_prob": body.edge_flip_prob,
        "attr_noise_scale": body.attr_noise_scale,
    }

    task = await _save_privacy_task(db, body.asset_id, "gs_ldp", params, algo_result,
                                    created_by=body.created_by)

    await create_audit_log(
        db,
        username="system",
        role="analyst",
        action="run_gs_ldp",
        target_type="privacy_task",
        target_id=str(task.id),
        result="success",
        detail={"asset_id": body.asset_id, "epsilon": body.epsilon,
                "elapsed_ms": algo_result.get("elapsed_ms")},
        user_id=body.created_by,
    )

    return task


@router.post("/ndkd", response_model=PrivacyTaskResponse, status_code=status.HTTP_201_CREATED)
async def run_ndkd_endpoint(
    body: NDKDRequest,
    db: AsyncSession = Depends(get_db),
) -> PrivacyTask:
    """
    Run NDKD: Neighbour-Subgraph Disturbance k-Degree Anonymity.

    Anonymizes the graph so each degree value appears at least k times.
    """
    graph_dict = await _load_graph_dict(db, body.asset_id)

    algo_result = run_ndkd(
        graph_dict,
        k=body.k,
        epsilon=body.epsilon,
        degree_threshold=body.degree_threshold,
        suppress_outliers=body.suppress_outliers,
        seed=getattr(body, "seed", 42),
    )

    params = {
        "k": body.k,
        "epsilon": body.epsilon,
        "degree_threshold": body.degree_threshold,
        "suppress_outliers": body.suppress_outliers,
    }

    task = await _save_privacy_task(db, body.asset_id, "ndkd", params, algo_result,
                                    created_by=body.created_by)

    await create_audit_log(
        db,
        username="system",
        role="analyst",
        action="run_ndkd",
        target_type="privacy_task",
        target_id=str(task.id),
        result="success",
        detail={"asset_id": body.asset_id, "k": body.k,
                "elapsed_ms": algo_result.get("elapsed_ms")},
        user_id=body.created_by,
    )

    return task


@router.get("/tasks")
async def list_privacy_tasks(
    asset_id: int | None = None,
    algorithm: str | None = None,
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List privacy computation tasks."""
    from sqlalchemy import select as sel, func
    stmt = sel(PrivacyTask)
    count_stmt = sel(func.count()).select_from(PrivacyTask)

    if asset_id is not None:
        stmt = stmt.where(PrivacyTask.asset_id == asset_id)
        count_stmt = count_stmt.where(PrivacyTask.asset_id == asset_id)
    if algorithm:
        stmt = stmt.where(PrivacyTask.algorithm == algorithm)
        count_stmt = count_stmt.where(PrivacyTask.algorithm == algorithm)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(PrivacyTask.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    tasks = rows.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": t.id,
                "asset_id": t.asset_id,
                "algorithm": t.algorithm if isinstance(t.algorithm, str) else t.algorithm.value,
                "params": t.params,
                "elapsed_ms": t.elapsed_ms,
                "created_at": t.created_at,
            }
            for t in tasks
        ],
    }


@router.get("/tasks/{task_id}", response_model=PrivacyTaskResponse)
async def get_privacy_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
) -> PrivacyTask:
    """Get full details of a privacy computation task."""
    row = await db.execute(select(PrivacyTask).where(PrivacyTask.id == task_id))
    task: PrivacyTask | None = row.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail=f"PrivacyTask {task_id} not found.")
    return task

"""
api/vpcs.py
Verifiable Private Constrained Shortest-path (VPCS) endpoints
for 数智安行 platform.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, GraphSnapshot, VPCSQuery
from app.schemas import VPCSQueryRequest, VPCSQueryResponse
from app.services.audit_service import create_audit_log
from app.algorithms.vpcs import run_vpcs_query

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_graph(db: AsyncSession, asset_id: int | None) -> dict:
    if asset_id is None:
        raise HTTPException(status_code=400, detail="asset_id is required.")

    asset_row = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset: Asset | None = asset_row.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found.")

    if asset.graph_snapshot_id is None:
        raise HTTPException(
            status_code=404,
            detail=f"Asset {asset_id} has no graph snapshot. "
                   "Call POST /api/assets/{id}/graph/generate first.",
        )

    snap_row = await db.execute(
        select(GraphSnapshot).where(GraphSnapshot.id == asset.graph_snapshot_id)
    )
    snap: GraphSnapshot | None = snap_row.scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail="Graph snapshot not found.")

    return {"nodes": snap.nodes, "edges": snap.edges}


async def _run_and_save(
    db: AsyncSession,
    body: VPCSQueryRequest,
    tampered: bool = False,
) -> dict:
    graph_dict = await _load_graph(db, body.asset_id)

    result = run_vpcs_query(
        graph_dict,
        source_node=body.source_node,
        target_node=body.target_node,
        cost_threshold=body.cost_threshold,
        time_threshold=body.time_threshold,
        distance_constraint=body.distance_constraint,
        budget=body.budget,
        tampered=tampered,
    )

    verify_result = result["verify_result"]
    if tampered:
        verify_result = False

    query = VPCSQuery(
        asset_id=body.asset_id,
        source_node=result["source_node"],
        target_node=result["target_node"],
        cost_threshold=body.cost_threshold,
        time_threshold=body.time_threshold,
        distance_constraint=body.distance_constraint,
        budget=body.budget,
        encrypted_graph_summary=result["encrypted_graph_summary"],
        dummy_edge_count=result["dummy_edge_count"],
        candidate_path_count=result["candidate_path_count"],
        result_path=result["result_path"],
        result_distance=result["result_distance"],
        result_cost=result["result_cost"],
        result_time=result["result_time"],
        proof_hash=result["proof_hash"],
        verify_result=verify_result,
        tampered=tampered,
        created_by=body.created_by,
    )
    db.add(query)
    await db.flush()
    await db.refresh(query)

    audit_result = "success" if verify_result else "warning"
    await create_audit_log(
        db,
        username="system",
        role="analyst",
        action="vpcs_query" + ("_tampered_demo" if tampered else ""),
        target_type="vpcs_query",
        target_id=str(query.id),
        result=audit_result,
        detail={
            "asset_id": body.asset_id,
            "source": body.source_node,
            "target": body.target_node,
            "verify_result": verify_result,
            "tampered": tampered,
            "elapsed_ms": result.get("elapsed_ms"),
        },
        user_id=body.created_by,
    )

    return {
        "id": query.id,
        "asset_id": query.asset_id,
        "source_node": query.source_node,
        "target_node": query.target_node,
        "cost_threshold": query.cost_threshold,
        "time_threshold": query.time_threshold,
        "distance_constraint": query.distance_constraint,
        "budget": query.budget,
        "encrypted_graph_summary": query.encrypted_graph_summary,
        "candidate_path_count": query.candidate_path_count,
        "dummy_edge_count": query.dummy_edge_count,
        "result_path": query.result_path,
        "result_distance": query.result_distance,
        "result_cost": query.result_cost,
        "result_time": query.result_time,
        "proof_hash": query.proof_hash,
        "verify_result": query.verify_result,
        "tampered": query.tampered,
        "created_by": query.created_by,
        "created_at": query.created_at,
        "elapsed_ms": result["elapsed_ms"],
        "explanation_steps": result["explanation_steps"],
        "path": query.result_path,
        "distance": query.result_distance,
        "cost": query.result_cost,
        "time": query.result_time,
        "encrypted_graph": {
            "node_count": result["encrypted_graph_summary"].get("node_count"),
            "real_edges": max(0, result["encrypted_graph_summary"].get("edge_count", 0) - query.dummy_edge_count),
            "dummy_edges": query.dummy_edge_count,
            "matrix_checksum": result["encrypted_graph_summary"].get("master_hash"),
        },
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/query", response_model=VPCSQueryResponse, status_code=status.HTTP_201_CREATED)
async def vpcs_query(
    body: VPCSQueryRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Execute a Verifiable Private Constrained Shortest-path query.

    Encrypts the graph with dummy edges, finds the constrained shortest path,
    generates a cryptographic proof, and verifies it.
    """
    return await _run_and_save(db, body, tampered=False)


@router.post("/tamper-demo", response_model=VPCSQueryResponse, status_code=status.HTTP_201_CREATED)
async def vpcs_tamper_demo(
    body: VPCSQueryRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Demo endpoint: run a VPCS query with a deliberately corrupted proof.

    verify_result will be False, demonstrating tamper detection.
    """
    return await _run_and_save(db, body, tampered=True)


@router.get("")
async def list_vpcs_queries(
    asset_id: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List VPCS query history."""
    stmt = select(VPCSQuery)
    count_stmt = select(func.count()).select_from(VPCSQuery)

    if asset_id is not None:
        stmt = stmt.where(VPCSQuery.asset_id == asset_id)
        count_stmt = count_stmt.where(VPCSQuery.asset_id == asset_id)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(VPCSQuery.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    queries = rows.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": q.id,
                "asset_id": q.asset_id,
                "source_node": q.source_node,
                "target_node": q.target_node,
                "result_path": q.result_path,
                "result_distance": q.result_distance,
                "result_cost": q.result_cost,
                "result_time": q.result_time,
                "verify_result": q.verify_result,
                "tampered": q.tampered,
                "proof_hash": q.proof_hash,
                "created_at": q.created_at,
            }
            for q in queries
        ],
    }


@router.get("/{query_id}", response_model=VPCSQueryResponse)
async def get_vpcs_query(
    query_id: int,
    db: AsyncSession = Depends(get_db),
) -> VPCSQuery:
    """Get full details of a specific VPCS query."""
    row = await db.execute(select(VPCSQuery).where(VPCSQuery.id == query_id))
    query: VPCSQuery | None = row.scalar_one_or_none()
    if query is None:
        raise HTTPException(status_code=404, detail=f"VPCSQuery {query_id} not found.")
    return query

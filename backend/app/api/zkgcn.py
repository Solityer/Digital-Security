"""
api/zkgcn.py
Zero-Knowledge GCN inference and proof endpoints for 数智安行 platform.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, GraphSnapshot, ZKGCNProof
from app.schemas import ZKGCNRequest, ZKGCNResponse
from app.services.audit_service import create_audit_log
from app.algorithms.zkgcn import run_zkgcn_infer

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
    body: ZKGCNRequest,
    tampered: bool = False,
) -> ZKGCNProof:
    graph_dict = await _load_graph(db, body.asset_id)

    result = run_zkgcn_infer(
        graph_dict,
        model_type=body.model_type,
        input_nodes=body.input_nodes if body.input_nodes else None,
        layers=body.layers,
        hidden_dim=body.hidden_dim,
        num_classes=3,  # default; could be exposed as a param
        tampered=tampered or body.tamper_test,
        seed=42,
    )

    verify_result = result["verify_result"]

    proof = ZKGCNProof(
        asset_id=body.asset_id,
        model_type=body.model_type,
        input_nodes=result["input_nodes"],
        adjacency_summary=result["adjacency_summary"],
        layer_summaries=result["layer_summaries"],
        inference_result=result["inference_result"],
        public_input_hash=result["public_input_hash"],
        witness_summary=result["witness_summary"],
        proof_hash=result["proof_hash"],
        vk_hash=result["vk_hash"],
        pk_hash=result["pk_hash"],
        verify_result=verify_result,
        tampered=tampered or body.tamper_test,
        elapsed_ms=result["elapsed_ms"],
        proof_size_kb=result["proof_size_kb"],
        created_by=body.created_by,
    )
    db.add(proof)
    await db.flush()
    await db.refresh(proof)

    audit_result = "success" if verify_result else "warning"
    await create_audit_log(
        db,
        username="system",
        role="analyst",
        action="zkgcn_infer" + ("_tampered_demo" if tampered or body.tamper_test else ""),
        target_type="zkgcn_proof",
        target_id=str(proof.id),
        result=audit_result,
        detail={
            "asset_id": body.asset_id,
            "model_type": body.model_type,
            "layers": body.layers,
            "verify_result": verify_result,
            "tampered": tampered or body.tamper_test,
            "elapsed_ms": result.get("elapsed_ms"),
            "proof_size_kb": result.get("proof_size_kb"),
        },
        user_id=body.created_by,
    )

    return proof


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/infer", response_model=ZKGCNResponse, status_code=status.HTTP_201_CREATED)
async def zkgcn_infer(
    body: ZKGCNRequest,
    db: AsyncSession = Depends(get_db),
) -> ZKGCNProof:
    """
    Run ZK-GCN inference on a data asset's graph.

    Executes the GCN forward pass, generates zero-knowledge proof witnesses,
    and verifies proof integrity.
    """
    return await _run_and_save(db, body, tampered=False)


@router.post("/tamper-demo", response_model=ZKGCNResponse, status_code=status.HTTP_201_CREATED)
async def zkgcn_tamper_demo(
    body: ZKGCNRequest,
    db: AsyncSession = Depends(get_db),
) -> ZKGCNProof:
    """
    Demo endpoint: run ZK-GCN inference with a deliberately corrupted proof.

    verify_result will be False, demonstrating tamper detection.
    """
    return await _run_and_save(db, body, tampered=True)


@router.get("")
async def list_zkgcn_proofs(
    asset_id: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List ZK-GCN proof history."""
    stmt = select(ZKGCNProof)
    count_stmt = select(func.count()).select_from(ZKGCNProof)

    if asset_id is not None:
        stmt = stmt.where(ZKGCNProof.asset_id == asset_id)
        count_stmt = count_stmt.where(ZKGCNProof.asset_id == asset_id)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(ZKGCNProof.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    proofs = rows.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": p.id,
                "asset_id": p.asset_id,
                "model_type": p.model_type,
                "verify_result": p.verify_result,
                "tampered": p.tampered,
                "elapsed_ms": p.elapsed_ms,
                "proof_size_kb": p.proof_size_kb,
                "proof_hash": p.proof_hash,
                "created_at": p.created_at,
            }
            for p in proofs
        ],
    }


@router.get("/{proof_id}", response_model=ZKGCNResponse)
async def get_zkgcn_proof(
    proof_id: int,
    db: AsyncSession = Depends(get_db),
) -> ZKGCNProof:
    """Get full details of a specific ZK-GCN proof."""
    row = await db.execute(select(ZKGCNProof).where(ZKGCNProof.id == proof_id))
    proof: ZKGCNProof | None = row.scalar_one_or_none()
    if proof is None:
        raise HTTPException(status_code=404, detail=f"ZKGCNProof {proof_id} not found.")
    return proof

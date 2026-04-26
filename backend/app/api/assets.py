"""
api/assets.py
Data-asset management endpoints for 数智安行 platform.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Asset, GraphSnapshot
from app.schemas import AssetCreate, AssetResponse, AssetUpdate
from app.services.audit_service import create_audit_log
from app.algorithms.graph_utils import (
    generate_financial_graph,
    generate_medical_graph,
    generate_government_graph,
    generate_social_graph,
    graph_to_dict,
    get_graph_stats,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_asset_hash(name: str, industry: str, ts: str) -> str:
    payload = f"{name}|{industry}|{ts}"
    return hashlib.sha256(payload.encode()).hexdigest()


def _make_ownership_credential(asset_hash: str) -> str:
    return hashlib.sha256(f"cred:{asset_hash}".encode()).hexdigest()


def _make_chain_record(asset_hash: str, ts: str) -> dict[str, Any]:
    block_sim = hashlib.sha256(f"block:{asset_hash}:{ts}".encode()).hexdigest()[:16]
    return {
        "timestamp": ts,
        "hash": asset_hash,
        "block_sim": block_sim,
        "chain": "数智安行-chain-v1",
    }


def _build_graph_for_industry(industry: str, seed: int = 42) -> dict[str, Any]:
    if industry == "finance":
        G = generate_financial_graph(seed=seed)
    elif industry == "medical":
        G = generate_medical_graph(seed=seed)
    elif industry == "government":
        G = generate_government_graph(seed=seed)
    else:
        G = generate_social_graph(seed=seed)
    return graph_to_dict(G)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_asset(
    body: AssetCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register a new data asset, generate hash + credential, create graph snapshot."""
    ts = datetime.utcnow().isoformat()
    asset_hash = _make_asset_hash(body.name, body.industry, ts)
    credential = _make_ownership_credential(asset_hash)
    chain_record = _make_chain_record(asset_hash, ts)

    # Build default graph snapshot
    graph_data = _build_graph_for_industry(body.industry)
    stats = get_graph_stats(
        __import__("app.algorithms.graph_utils", fromlist=["dict_to_graph"]).dict_to_graph(graph_data)
    )

    # Persist graph snapshot first (no asset_id yet)
    snap = GraphSnapshot(
        asset_id=None,
        nodes=graph_data["nodes"],
        edges=graph_data["edges"],
        node_count=stats["node_count"],
        edge_count=stats["edge_count"],
    )
    db.add(snap)
    await db.flush()
    await db.refresh(snap)

    # Persist asset
    asset = Asset(
        name=body.name,
        industry=body.industry,
        data_source=body.data_source,
        subject_type=body.subject_type,
        node_meaning=body.node_meaning,
        edge_meaning=body.edge_meaning,
        sensitivity_level=body.sensitivity_level,
        authorization_scope=body.authorization_scope,
        compliance_tags=body.compliance_tags,
        description=body.description,
        asset_hash=asset_hash,
        ownership_credential=credential,
        chain_record=json.dumps(chain_record),
        graph_snapshot_id=snap.id,
        owner_id=body.owner_id,
        status=body.status,
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)

    # Backfill snapshot.asset_id
    snap.asset_id = asset.id
    await db.flush()

    # Audit log
    await create_audit_log(
        db,
        username="system",
        role="admin",
        action="create_asset",
        target_type="asset",
        target_id=str(asset.id),
        result="success",
        detail={"name": body.name, "industry": body.industry, "asset_hash": asset_hash},
    )

    return {
        "id": asset.id,
        "asset_id": asset.id,
        "name": asset.name,
        "industry": asset.industry,
        "description": asset.description,
        "asset_hash": asset.asset_hash,
        "ownership_credential": asset.ownership_credential,
        "chain_record": chain_record,
        "status": asset.status,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "graph_snapshot_id": asset.graph_snapshot_id,
        "node_count": snap.node_count,
        "edge_count": snap.edge_count,
        "data_source": asset.data_source,
        "subject_type": asset.subject_type,
        "node_meaning": asset.node_meaning,
        "edge_meaning": asset.edge_meaning,
        "sensitivity_level": asset.sensitivity_level,
        "authorization_scope": asset.authorization_scope,
        "compliance_tags": asset.compliance_tags,
        "owner_id": asset.owner_id,
    }


@router.get("")
async def list_assets(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    industry: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List data assets with pagination and optional filters."""
    stmt = select(Asset)
    count_stmt = select(func.count()).select_from(Asset)

    if industry:
        stmt = stmt.where(Asset.industry == industry)
        count_stmt = count_stmt.where(Asset.industry == industry)
    if status:
        stmt = stmt.where(Asset.status == status)
        count_stmt = count_stmt.where(Asset.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Asset.created_at.desc()).offset(offset).limit(limit)
    rows = await db.execute(stmt)
    assets = rows.scalars().all()

    snapshot_ids = [a.graph_snapshot_id for a in assets if a.graph_snapshot_id is not None]
    snapshots_by_id: dict[int, GraphSnapshot] = {}
    if snapshot_ids:
        snapshot_rows = await db.execute(
            select(GraphSnapshot).where(GraphSnapshot.id.in_(snapshot_ids))
        )
        snapshots_by_id = {snapshot.id: snapshot for snapshot in snapshot_rows.scalars().all()}

    items = [
        {
            "id": a.id,
            "asset_id": a.id,
            "name": a.name,
            "industry": a.industry,
            "description": a.description,
            "asset_hash": a.asset_hash,
            "ownership_credential": a.ownership_credential,
            "chain_record": a.chain_record,
            "status": a.status,
            "graph_snapshot_id": a.graph_snapshot_id,
            "sensitivity_level": a.sensitivity_level,
            "compliance_tags": a.compliance_tags,
            "owner_id": a.owner_id,
            "node_count": snapshots_by_id.get(a.graph_snapshot_id).node_count if snapshots_by_id.get(a.graph_snapshot_id) else 0,
            "edge_count": snapshots_by_id.get(a.graph_snapshot_id).edge_count if snapshots_by_id.get(a.graph_snapshot_id) else 0,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a in assets
    ]
    return {"total": total, "items": items}


@router.get("/{asset_id}")
async def get_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single asset and its current graph snapshot."""
    row = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset: Asset | None = row.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found.")

    snap_data = None
    if asset.graph_snapshot_id:
        snap_row = await db.execute(
            select(GraphSnapshot).where(GraphSnapshot.id == asset.graph_snapshot_id)
        )
        snap: GraphSnapshot | None = snap_row.scalar_one_or_none()
        if snap:
            snap_data = {
                "id": snap.id,
                "asset_id": snap.asset_id,
                "nodes": snap.nodes,
                "edges": snap.edges,
                "node_count": snap.node_count,
                "edge_count": snap.edge_count,
                "created_at": snap.created_at,
            }

    return {
        "id": asset.id,
        "asset_id": asset.id,
        "name": asset.name,
        "industry": asset.industry,
        "description": asset.description,
        "asset_hash": asset.asset_hash,
        "ownership_credential": asset.ownership_credential,
        "chain_record": asset.chain_record,
        "status": asset.status,
        "graph_snapshot_id": asset.graph_snapshot_id,
        "data_source": asset.data_source,
        "subject_type": asset.subject_type,
        "node_meaning": asset.node_meaning,
        "edge_meaning": asset.edge_meaning,
        "sensitivity_level": asset.sensitivity_level,
        "authorization_scope": asset.authorization_scope,
        "compliance_tags": asset.compliance_tags,
        "owner_id": asset.owner_id,
        "node_count": snap_data["node_count"] if snap_data else 0,
        "edge_count": snap_data["edge_count"] if snap_data else 0,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "graph_snapshot": snap_data,
    }


@router.post("/{asset_id}/graph/generate")
async def generate_graph_snapshot(
    asset_id: int,
    seed: int = Query(42),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a new graph snapshot for an asset using its industry type."""
    row = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset: Asset | None = row.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found.")

    graph_data = _build_graph_for_industry(asset.industry, seed=seed)
    from app.algorithms.graph_utils import dict_to_graph
    stats = get_graph_stats(dict_to_graph(graph_data))

    snap = GraphSnapshot(
        asset_id=asset_id,
        nodes=graph_data["nodes"],
        edges=graph_data["edges"],
        node_count=stats["node_count"],
        edge_count=stats["edge_count"],
    )
    db.add(snap)
    await db.flush()
    await db.refresh(snap)

    # Update asset's primary snapshot reference
    asset.graph_snapshot_id = snap.id
    await db.flush()

    await create_audit_log(
        db,
        username="system",
        role="admin",
        action="generate_graph_snapshot",
        target_type="asset",
        target_id=str(asset_id),
        result="success",
        detail={"snapshot_id": snap.id, "seed": seed, "industry": asset.industry},
    )

    return {
        "id": snap.id,
        "asset_id": snap.asset_id,
        "nodes": snap.nodes,
        "edges": snap.edges,
        "node_count": snap.node_count,
        "edge_count": snap.edge_count,
        "created_at": snap.created_at,
        "graph_stats": stats,
        "graph": {
            "nodes": snap.nodes,
            "edges": snap.edges,
            "node_count": snap.node_count,
            "edge_count": snap.edge_count,
        },
    }


@router.patch("/{asset_id}")
async def update_asset(
    asset_id: int,
    body: AssetUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Partially update an asset's metadata."""
    row = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset: Asset | None = row.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found.")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(asset, field, value)
    await db.flush()

    await create_audit_log(
        db,
        username="system",
        role="admin",
        action="update_asset",
        target_type="asset",
        target_id=str(asset_id),
        result="success",
        detail={"updated_fields": list(update_data.keys())},
    )

    return {"id": asset.id, "name": asset.name, "status": asset.status,
            "updated_at": asset.updated_at}

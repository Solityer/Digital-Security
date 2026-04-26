"""
数智安行 – SQLAlchemy ORM models.

All tables follow the domain description for the data-governance platform.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


# ---------------------------------------------------------------------------
# Helper for UTC timestamps
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class UserRole(str, enum.Enum):
    admin = "admin"
    analyst = "analyst"
    auditor = "auditor"
    demo = "demo"


class IndustryType(str, enum.Enum):
    finance = "finance"
    medical = "medical"
    government = "government"
    social = "social"


class ContractStatus(str, enum.Enum):
    draft = "draft"
    pending = "pending"
    active = "active"
    suspended = "suspended"
    terminated = "terminated"


class AuditResult(str, enum.Enum):
    success = "success"
    failure = "failure"
    warning = "warning"


class PrivacyAlgorithm(str, enum.Enum):
    graph_sdp = "graph_sdp"
    gcc_sdp = "gcc_sdp"
    gs_ldp = "gs_ldp"
    ndkd = "ndkd"


class RiskEventType(str, enum.Enum):
    anomaly_access = "anomaly_access"
    unauthorized_access = "unauthorized_access"
    budget_exceeded = "budget_exceeded"
    expired_access = "expired_access"
    verify_failure = "verify_failure"
    data_quality = "data_quality"


class RiskSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class RiskStatus(str, enum.Enum):
    open = "open"
    investigating = "investigating"
    resolved = "resolved"


class AssetStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    archived = "archived"


class ScenarioKey(str, enum.Enum):
    finance = "finance"
    medical = "medical"
    government = "government"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class User(Base):
    """Platform user (admin / analyst / auditor / demo)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.analyst
    )
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    owned_assets: Mapped[list["Asset"]] = relationship(
        "Asset", back_populates="owner", foreign_keys="Asset.owner_id"
    )
    provided_contracts: Mapped[list["Contract"]] = relationship(
        "Contract", back_populates="provider", foreign_keys="Contract.provider_id"
    )
    consumed_contracts: Mapped[list["Contract"]] = relationship(
        "Contract", back_populates="consumer", foreign_keys="Contract.consumer_id"
    )
    authz_policies: Mapped[list["AuthorizationPolicy"]] = relationship(
        "AuthorizationPolicy", back_populates="user"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user", foreign_keys="AuditLog.user_id"
    )
    privacy_tasks: Mapped[list["PrivacyTask"]] = relationship(
        "PrivacyTask", back_populates="created_by_user", foreign_keys="PrivacyTask.created_by"
    )
    vpcs_queries: Mapped[list["VPCSQuery"]] = relationship(
        "VPCSQuery", back_populates="created_by_user", foreign_keys="VPCSQuery.created_by"
    )
    zkgcn_proofs: Mapped[list["ZKGCNProof"]] = relationship(
        "ZKGCNProof", back_populates="created_by_user", foreign_keys="ZKGCNProof.created_by"
    )
    risk_events: Mapped[list["RiskEvent"]] = relationship(
        "RiskEvent", back_populates="user", foreign_keys="RiskEvent.user_id"
    )


class GraphSnapshot(Base):
    """Stored graph topology snapshot for a data asset."""

    __tablename__ = "graph_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # List of {id, label, attrs}
    nodes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    # List of {source, target, weight, cost, time, label}
    edges: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    node_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    edge_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    asset: Mapped["Asset | None"] = relationship(
        "Asset", back_populates="graph_snapshots", foreign_keys=[asset_id]
    )


class Asset(Base):
    """Data asset registered in the governance platform."""

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    industry: Mapped[str] = mapped_column(
        Enum(IndustryType, name="industry_type"), nullable=False
    )
    data_source: Mapped[str] = mapped_column(String(512), nullable=True)
    subject_type: Mapped[str] = mapped_column(String(128), nullable=True)
    node_meaning: Mapped[str] = mapped_column(String(512), nullable=True)
    edge_meaning: Mapped[str] = mapped_column(String(512), nullable=True)
    sensitivity_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    authorization_scope: Mapped[str] = mapped_column(Text, nullable=True)
    compliance_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    asset_hash: Mapped[str] = mapped_column(String(256), nullable=True, unique=True)
    ownership_credential: Mapped[str] = mapped_column(Text, nullable=True)
    chain_record: Mapped[str] = mapped_column(String(512), nullable=True)
    graph_snapshot_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("graph_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    owner_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        Enum(AssetStatus, name="asset_status"), nullable=False, default=AssetStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, onupdate=_now
    )

    # Relationships
    owner: Mapped["User | None"] = relationship(
        "User", back_populates="owned_assets", foreign_keys=[owner_id]
    )
    graph_snapshots: Mapped[list["GraphSnapshot"]] = relationship(
        "GraphSnapshot", back_populates="asset", foreign_keys="GraphSnapshot.asset_id"
    )
    primary_snapshot: Mapped["GraphSnapshot | None"] = relationship(
        "GraphSnapshot",
        primaryjoin="Asset.graph_snapshot_id == GraphSnapshot.id",
        foreign_keys=[graph_snapshot_id],
        uselist=False,
        overlaps="graph_snapshots",
    )
    authz_policies: Mapped[list["AuthorizationPolicy"]] = relationship(
        "AuthorizationPolicy", back_populates="asset"
    )
    privacy_tasks: Mapped[list["PrivacyTask"]] = relationship(
        "PrivacyTask", back_populates="asset"
    )
    vpcs_queries: Mapped[list["VPCSQuery"]] = relationship(
        "VPCSQuery", back_populates="asset"
    )
    zkgcn_proofs: Mapped[list["ZKGCNProof"]] = relationship(
        "ZKGCNProof", back_populates="asset"
    )
    risk_events: Mapped[list["RiskEvent"]] = relationship(
        "RiskEvent", back_populates="asset", foreign_keys="RiskEvent.asset_id"
    )
    demo_scenarios: Mapped[list["DemoScenario"]] = relationship(
        "DemoScenario", back_populates="asset"
    )


class Contract(Base):
    """Data-sharing contract between a provider and a consumer."""

    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    provider_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    consumer_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purpose: Mapped[str] = mapped_column(Text, nullable=True)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accessible_fields: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allowed_algorithms: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    privacy_budget_limit: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    status: Mapped[str] = mapped_column(
        Enum(ContractStatus, name="contract_status"),
        nullable=False,
        default=ContractStatus.draft,
    )
    contract_hash: Mapped[str] = mapped_column(String(256), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, onupdate=_now
    )

    # Relationships
    provider: Mapped["User | None"] = relationship(
        "User", back_populates="provided_contracts", foreign_keys=[provider_id]
    )
    consumer: Mapped["User | None"] = relationship(
        "User", back_populates="consumed_contracts", foreign_keys=[consumer_id]
    )
    authz_policies: Mapped[list["AuthorizationPolicy"]] = relationship(
        "AuthorizationPolicy", back_populates="contract"
    )


class AuthorizationPolicy(Base):
    """RBAC + ABAC authorisation policy tied to a contract."""

    __tablename__ = "authorization_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    contract_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rbac_roles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    abac_attrs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    allowed_operations: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    contract: Mapped["Contract | None"] = relationship(
        "Contract", back_populates="authz_policies"
    )
    user: Mapped["User | None"] = relationship("User", back_populates="authz_policies")
    asset: Mapped["Asset | None"] = relationship("Asset", back_populates="authz_policies")


class AuditLog(Base):
    """Immutable, hash-chained audit log entry."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    username: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    action: Mapped[str] = mapped_column(String(256), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    result: Mapped[str] = mapped_column(
        Enum(AuditResult, name="audit_result"), nullable=False, default=AuditResult.success
    )
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    log_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    prev_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    user: Mapped["User | None"] = relationship(
        "User", back_populates="audit_logs", foreign_keys=[user_id]
    )


class PrivacyTask(Base):
    """Privacy-protection computation task (graph differential privacy)."""

    __tablename__ = "privacy_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    algorithm: Mapped[str] = mapped_column(
        Enum(PrivacyAlgorithm, name="privacy_algorithm"), nullable=False
    )
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    input_summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    elapsed_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    explanation_steps: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    asset: Mapped["Asset | None"] = relationship("Asset", back_populates="privacy_tasks")
    created_by_user: Mapped["User | None"] = relationship(
        "User", back_populates="privacy_tasks", foreign_keys=[created_by]
    )


class VPCSQuery(Base):
    """Verifiable Private Constrained Shortest-path query."""

    __tablename__ = "vpcs_queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_node: Mapped[str] = mapped_column(String(128), nullable=False)
    target_node: Mapped[str] = mapped_column(String(128), nullable=False)
    cost_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    time_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    distance_constraint: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    budget: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    encrypted_graph_summary: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    dummy_edge_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_path_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result_path: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    result_distance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    result_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    result_time: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    proof_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    verify_result: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tampered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    asset: Mapped["Asset | None"] = relationship("Asset", back_populates="vpcs_queries")
    created_by_user: Mapped["User | None"] = relationship(
        "User", back_populates="vpcs_queries", foreign_keys=[created_by]
    )


class ZKGCNProof(Base):
    """Zero-knowledge proof for a Graph Convolutional Network inference."""

    __tablename__ = "zkgcn_proofs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    model_type: Mapped[str] = mapped_column(String(64), nullable=False, default="gcn")
    input_nodes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    adjacency_summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    layer_summaries: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    inference_result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    public_input_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    witness_summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    proof_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    vk_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    pk_hash: Mapped[str] = mapped_column(String(256), nullable=True)
    verify_result: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tampered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    elapsed_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    proof_size_kb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    asset: Mapped["Asset | None"] = relationship("Asset", back_populates="zkgcn_proofs")
    created_by_user: Mapped["User | None"] = relationship(
        "User", back_populates="zkgcn_proofs", foreign_keys=[created_by]
    )


class RiskEvent(Base):
    """Risk/security event detected by the platform."""

    __tablename__ = "risk_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(
        Enum(RiskEventType, name="risk_event_type"), nullable=False
    )
    severity: Mapped[str] = mapped_column(
        Enum(RiskSeverity, name="risk_severity"), nullable=False, default=RiskSeverity.medium
    )
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(
        Enum(RiskStatus, name="risk_status"), nullable=False, default=RiskStatus.open
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    asset: Mapped["Asset | None"] = relationship(
        "Asset", back_populates="risk_events", foreign_keys=[asset_id]
    )
    user: Mapped["User | None"] = relationship(
        "User", back_populates="risk_events", foreign_keys=[user_id]
    )


class DemoScenario(Base):
    """Pre-configured demo scenario for live walkthroughs."""

    __tablename__ = "demo_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scenario_key: Mapped[str] = mapped_column(
        Enum(ScenarioKey, name="scenario_key"), nullable=False, unique=True, index=True
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    asset_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, server_default=func.now()
    )

    # Relationships
    asset: Mapped["Asset | None"] = relationship("Asset", back_populates="demo_scenarios")

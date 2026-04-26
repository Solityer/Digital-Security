"""
数智安行 – Pydantic v2 request / response schemas.

Covers all ORM models plus the specialised request/response types for
privacy-protection algorithms, VPCS queries, ZK-GCN proofs, authorisation
evaluation, audit-chain verification, risk assessment, and demo scenarios.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Shared base with ORM-mode enabled
# ---------------------------------------------------------------------------


class _ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ===========================================================================
# Graph primitives
# ===========================================================================


class GraphNode(BaseModel):
    id: str
    label: str
    x: float = 0.0
    y: float = 0.0
    attrs: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float = 1.0
    cost: float = 0.0
    time: float = 0.0
    label: str = ""


class GraphData(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


# ===========================================================================
# Health
# ===========================================================================


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


# ===========================================================================
# User
# ===========================================================================


class UserCreate(BaseModel):
    username: str = Field(..., max_length=64)
    email: str = Field(..., max_length=256)
    role: str = Field("analyst", pattern="^(admin|analyst|auditor|demo)$")
    password: str = Field(..., min_length=6)
    is_active: bool = True


class UserUpdate(BaseModel):
    username: str | None = Field(None, max_length=64)
    email: str | None = Field(None, max_length=256)
    role: str | None = Field(None, pattern="^(admin|analyst|auditor|demo)$")
    password: str | None = Field(None, min_length=6)
    is_active: bool | None = None


class UserResponse(_ORMBase):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime


# ===========================================================================
# GraphSnapshot
# ===========================================================================


class GraphSnapshotCreate(BaseModel):
    asset_id: int | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    node_count: int = 0
    edge_count: int = 0


class GraphSnapshotUpdate(BaseModel):
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    node_count: int | None = None
    edge_count: int | None = None


class GraphSnapshotResponse(_ORMBase):
    id: int
    asset_id: int | None
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    node_count: int
    edge_count: int
    created_at: datetime


# ===========================================================================
# Asset
# ===========================================================================


class AssetCreate(BaseModel):
    name: str = Field(..., max_length=256)
    industry: str = Field(..., pattern="^(finance|medical|government|social)$")
    data_source: str | None = None
    subject_type: str | None = None
    node_meaning: str | None = None
    edge_meaning: str | None = None
    sensitivity_level: int = Field(1, ge=1, le=5)
    authorization_scope: str | None = None
    compliance_tags: list[str] = Field(default_factory=list)
    description: str | None = None
    asset_hash: str | None = None
    ownership_credential: str | None = None
    chain_record: str | None = None
    graph_snapshot_id: int | None = None
    owner_id: int | None = None
    status: str = Field("active", pattern="^(active|inactive|archived)$")


class AssetUpdate(BaseModel):
    name: str | None = Field(None, max_length=256)
    industry: str | None = Field(None, pattern="^(finance|medical|government|social)$")
    data_source: str | None = None
    subject_type: str | None = None
    node_meaning: str | None = None
    edge_meaning: str | None = None
    sensitivity_level: int | None = Field(None, ge=1, le=5)
    authorization_scope: str | None = None
    compliance_tags: list[str] | None = None
    description: str | None = None
    asset_hash: str | None = None
    ownership_credential: str | None = None
    chain_record: str | None = None
    graph_snapshot_id: int | None = None
    status: str | None = Field(None, pattern="^(active|inactive|archived)$")


class AssetResponse(_ORMBase):
    id: int
    name: str
    industry: str
    data_source: str | None
    subject_type: str | None
    node_meaning: str | None
    edge_meaning: str | None
    sensitivity_level: int
    authorization_scope: str | None
    compliance_tags: list[str]
    description: str | None
    asset_hash: str | None
    ownership_credential: str | None
    chain_record: str | None
    graph_snapshot_id: int | None
    owner_id: int | None
    status: str
    created_at: datetime
    updated_at: datetime


# ===========================================================================
# Contract
# ===========================================================================


class ContractCreate(BaseModel):
    title: str = Field(..., max_length=256)
    provider_id: int | None = None
    consumer_id: int | None = None
    purpose: str | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    accessible_fields: list[str] = Field(default_factory=list)
    allowed_algorithms: list[str] = Field(default_factory=list)
    privacy_budget_limit: float = Field(1.0, gt=0)
    status: str = Field(
        "draft", pattern="^(draft|pending|active|suspended|terminated)$"
    )
    contract_hash: str | None = None


class ContractUpdate(BaseModel):
    title: str | None = Field(None, max_length=256)
    purpose: str | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    accessible_fields: list[str] | None = None
    allowed_algorithms: list[str] | None = None
    privacy_budget_limit: float | None = Field(None, gt=0)
    status: str | None = Field(
        None, pattern="^(draft|pending|active|suspended|terminated)$"
    )
    contract_hash: str | None = None


class ContractResponse(_ORMBase):
    id: int
    title: str
    provider_id: int | None
    consumer_id: int | None
    purpose: str | None
    valid_from: datetime | None
    valid_until: datetime | None
    accessible_fields: list[str]
    allowed_algorithms: list[str]
    privacy_budget_limit: float
    status: str
    contract_hash: str | None
    created_at: datetime
    updated_at: datetime


# ===========================================================================
# AuthorizationPolicy
# ===========================================================================


class AuthzPolicyCreate(BaseModel):
    contract_id: int | None = None
    user_id: int | None = None
    asset_id: int | None = None
    rbac_roles: list[str] = Field(default_factory=list)
    abac_attrs: dict[str, Any] = Field(default_factory=dict)
    allowed_operations: list[str] = Field(default_factory=list)


class AuthzPolicyUpdate(BaseModel):
    rbac_roles: list[str] | None = None
    abac_attrs: dict[str, Any] | None = None
    allowed_operations: list[str] | None = None


class AuthzPolicyResponse(_ORMBase):
    id: int
    contract_id: int | None
    user_id: int | None
    asset_id: int | None
    rbac_roles: list[str]
    abac_attrs: dict[str, Any]
    allowed_operations: list[str]
    created_at: datetime


class AuthzEvaluateRequest(BaseModel):
    user_id: int
    asset_id: int
    operation: str
    context_attrs: dict[str, Any] = Field(default_factory=dict)


class AuthzEvaluateResponse(BaseModel):
    allowed: bool
    matched_policy_id: int | None = None
    reason: str = ""


# ===========================================================================
# AuditLog
# ===========================================================================


class AuditLogCreate(BaseModel):
    user_id: int | None = None
    username: str = ""
    role: str = ""
    action: str
    target_type: str = ""
    target_id: str = ""
    result: str = Field("success", pattern="^(success|failure|warning)$")
    detail: dict[str, Any] = Field(default_factory=dict)
    log_hash: str | None = None
    prev_hash: str | None = None


class AuditLogResponse(_ORMBase):
    id: int
    timestamp: datetime
    user_id: int | None
    username: str
    role: str
    action: str
    target_type: str
    target_id: str
    result: str
    detail: dict[str, Any]
    log_hash: str | None
    prev_hash: str | None
    created_at: datetime


class AuditVerifyResponse(BaseModel):
    total_records: int
    valid_count: int
    invalid_count: int
    tampered_ids: list[int]
    chain_intact: bool
    verified_at: datetime


# ===========================================================================
# PrivacyTask – base and per-algorithm request schemas
# ===========================================================================


class PrivacyTaskBase(BaseModel):
    asset_id: int | None = None
    algorithm: str = Field(
        ..., pattern="^(graph_sdp|gcc_sdp|gs_ldp|ndkd)$"
    )
    params: dict[str, Any] = Field(default_factory=dict)
    created_by: int | None = None


class GraphSDPRequest(BaseModel):
    """Smooth Differential Privacy on a graph."""
    asset_id: int | None = None
    created_by: int | None = None
    epsilon: float = Field(1.0, gt=0, description="Privacy budget ε")
    delta: float = Field(1e-5, gt=0, description="Relaxation parameter δ")
    sensitivity: float = Field(1.0, gt=0, description="Global sensitivity")
    noise_mechanism: str = Field("gaussian", pattern="^(gaussian|laplace)$")
    clip_threshold: float = Field(5.0, gt=0)


class GCCSDPRequest(BaseModel):
    """Graph-Cluster-Coefficient SDP."""
    asset_id: int | None = None
    created_by: int | None = None
    epsilon: float = Field(1.0, gt=0)
    delta: float = Field(1e-5, gt=0)
    cluster_size: int = Field(5, ge=2)
    min_cluster_count: int = Field(2, ge=1)
    sensitivity: float = Field(1.0, gt=0)


class GSLDPRequest(BaseModel):
    """Graph-Structure Local Differential Privacy."""
    asset_id: int | None = None
    created_by: int | None = None
    epsilon: float = Field(2.0, gt=0)
    randomize_edges: bool = True
    randomize_attributes: bool = True
    edge_flip_prob: float = Field(0.1, ge=0.0, le=1.0)
    attr_noise_scale: float = Field(0.5, gt=0)


class NDKDRequest(BaseModel):
    """Node-Degree k-anonymity with differential privacy."""
    asset_id: int | None = None
    created_by: int | None = None
    epsilon: float = Field(1.0, gt=0)
    k: int = Field(5, ge=2, description="k-anonymity parameter")
    degree_threshold: int = Field(3, ge=1)
    suppress_outliers: bool = True


PrivacyTaskRequest = GraphSDPRequest | GCCSDPRequest | GSLDPRequest | NDKDRequest


class PrivacyTaskCreate(BaseModel):
    asset_id: int | None = None
    algorithm: str = Field(..., pattern="^(graph_sdp|gcc_sdp|gs_ldp|ndkd)$")
    params: dict[str, Any] = Field(default_factory=dict)
    input_summary: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    elapsed_ms: float = 0.0
    explanation_steps: list[dict[str, Any]] = Field(default_factory=list)
    created_by: int | None = None


class PrivacyTaskResponse(_ORMBase):
    id: int
    asset_id: int | None
    algorithm: str
    params: dict[str, Any]
    input_summary: dict[str, Any]
    result: dict[str, Any]
    metrics: dict[str, Any]
    elapsed_ms: float
    explanation_steps: list[dict[str, Any]]
    created_by: int | None
    created_at: datetime


# ===========================================================================
# VPCSQuery
# ===========================================================================


class VPCSQueryRequest(BaseModel):
    asset_id: int | None = None
    created_by: int | None = None
    source_node: str
    target_node: str
    cost_threshold: float = Field(0.0, ge=0)
    time_threshold: float = Field(0.0, ge=0)
    distance_constraint: float = Field(0.0, ge=0)
    budget: float = Field(0.0, ge=0)


class VPCSQueryCreate(BaseModel):
    asset_id: int | None = None
    source_node: str
    target_node: str
    cost_threshold: float = 0.0
    time_threshold: float = 0.0
    distance_constraint: float = 0.0
    budget: float = 0.0
    encrypted_graph_summary: dict[str, Any] = Field(default_factory=dict)
    dummy_edge_count: int = 0
    candidate_path_count: int = 0
    result_path: list[str] = Field(default_factory=list)
    result_distance: float = 0.0
    result_cost: float = 0.0
    result_time: float = 0.0
    proof_hash: str | None = None
    verify_result: bool = False
    tampered: bool = False
    created_by: int | None = None


class VPCSQueryResponse(_ORMBase):
    id: int
    asset_id: int | None
    source_node: str
    target_node: str
    cost_threshold: float
    time_threshold: float
    distance_constraint: float
    budget: float
    encrypted_graph_summary: dict[str, Any]
    dummy_edge_count: int
    candidate_path_count: int
    result_path: list[str]
    result_distance: float
    result_cost: float
    result_time: float
    proof_hash: str | None
    verify_result: bool
    tampered: bool
    created_by: int | None
    created_at: datetime


# ===========================================================================
# ZKGCNProof
# ===========================================================================


class ZKGCNRequest(BaseModel):
    asset_id: int | None = None
    created_by: int | None = None
    model_type: str = Field("gcn", pattern="^(gcn|gat|sage)$")
    input_nodes: list[str] = Field(default_factory=list)
    layers: int = Field(2, ge=1, le=8, description="Number of GCN layers")
    hidden_dim: int = Field(64, ge=4, description="Hidden layer dimension")
    tamper_test: bool = Field(False, description="Simulate tampered proof for demo")


class ZKGCNCreate(BaseModel):
    asset_id: int | None = None
    model_type: str = "gcn"
    input_nodes: list[str] = Field(default_factory=list)
    adjacency_summary: dict[str, Any] = Field(default_factory=dict)
    layer_summaries: list[dict[str, Any]] = Field(default_factory=list)
    inference_result: dict[str, Any] = Field(default_factory=dict)
    public_input_hash: str | None = None
    witness_summary: dict[str, Any] = Field(default_factory=dict)
    proof_hash: str | None = None
    vk_hash: str | None = None
    pk_hash: str | None = None
    verify_result: bool = False
    tampered: bool = False
    elapsed_ms: float = 0.0
    proof_size_kb: float = 0.0
    created_by: int | None = None


class ZKGCNResponse(_ORMBase):
    id: int
    asset_id: int | None
    model_type: str
    input_nodes: list[str]
    adjacency_summary: dict[str, Any]
    layer_summaries: list[dict[str, Any]]
    inference_result: dict[str, Any]
    public_input_hash: str | None
    witness_summary: dict[str, Any]
    proof_hash: str | None
    vk_hash: str | None
    pk_hash: str | None
    verify_result: bool
    tampered: bool
    elapsed_ms: float
    proof_size_kb: float
    created_by: int | None
    created_at: datetime


# ===========================================================================
# RiskEvent
# ===========================================================================


class RiskEvaluateRequest(BaseModel):
    asset_id: int | None = None
    user_id: int | None = None
    event_type: str = Field(
        ...,
        pattern=(
            "^(anomaly_access|unauthorized_access|budget_exceeded"
            "|expired_access|verify_failure|data_quality)$"
        ),
    )
    context: dict[str, Any] = Field(default_factory=dict)


class RiskEventCreate(BaseModel):
    event_type: str = Field(
        ...,
        pattern=(
            "^(anomaly_access|unauthorized_access|budget_exceeded"
            "|expired_access|verify_failure|data_quality)$"
        ),
    )
    severity: str = Field("medium", pattern="^(low|medium|high|critical)$")
    asset_id: int | None = None
    user_id: int | None = None
    description: str
    detail: dict[str, Any] = Field(default_factory=dict)
    risk_score: float = Field(0.0, ge=0.0, le=100.0)
    status: str = Field("open", pattern="^(open|investigating|resolved)$")


class RiskEventUpdate(BaseModel):
    severity: str | None = Field(None, pattern="^(low|medium|high|critical)$")
    description: str | None = None
    detail: dict[str, Any] | None = None
    risk_score: float | None = Field(None, ge=0.0, le=100.0)
    status: str | None = Field(None, pattern="^(open|investigating|resolved)$")


class RiskEventResponse(_ORMBase):
    id: int
    event_type: str
    severity: str
    asset_id: int | None
    user_id: int | None
    description: str
    detail: dict[str, Any]
    risk_score: float
    status: str
    created_at: datetime


# ===========================================================================
# DemoScenario
# ===========================================================================


class DemoRunRequest(BaseModel):
    scenario_key: str = Field(..., pattern="^(finance|medical|government)$")
    dry_run: bool = Field(False, description="Validate steps without executing")
    params: dict[str, Any] = Field(default_factory=dict)


class DemoScenarioCreate(BaseModel):
    scenario_key: str = Field(..., pattern="^(finance|medical|government)$")
    title: str = Field(..., max_length=256)
    description: str | None = None
    steps: list[dict[str, Any]] = Field(default_factory=list)
    asset_id: int | None = None


class DemoScenarioUpdate(BaseModel):
    title: str | None = Field(None, max_length=256)
    description: str | None = None
    steps: list[dict[str, Any]] | None = None
    asset_id: int | None = None
    last_run_at: datetime | None = None
    last_result: dict[str, Any] | None = None


class DemoScenarioResponse(_ORMBase):
    id: int
    scenario_key: str
    title: str
    description: str | None
    steps: list[dict[str, Any]]
    asset_id: int | None
    last_run_at: datetime | None
    last_result: dict[str, Any]
    created_at: datetime

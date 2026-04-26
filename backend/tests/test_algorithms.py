"""
test_algorithms.py
Unit tests for 数智安行 algorithm modules.

Run:
    cd /home/match/Digital-Security/backend
    python -m pytest tests/test_algorithms.py -v
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import math
import hashlib

import networkx as nx
import numpy as np
import pytest

from app.algorithms.graph_utils import (
    generate_financial_graph,
    generate_medical_graph,
    generate_government_graph,
    generate_social_graph,
    graph_to_dict,
    dict_to_graph,
    get_graph_stats,
)
from app.algorithms.metrics import (
    l1_distance,
    hellinger_distance,
    mse,
    edge_change_ratio,
)
from app.algorithms.graph_sdp import run_graph_sdp
from app.algorithms.gcc_sdp import run_gcc_sdp
from app.algorithms.gs_ldp import run_gs_ldp
from app.algorithms.ndkd import run_ndkd
from app.algorithms.vpcs import run_vpcs_query, run_vpcs_tamper_demo
from app.algorithms.zkgcn import run_zkgcn_infer, run_zkgcn_tamper_demo


# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

def _financial_dict():
    G = generate_financial_graph(seed=42)
    return graph_to_dict(G)


def _medical_dict():
    G = generate_medical_graph(seed=42)
    return graph_to_dict(G)


def _social_dict():
    G = generate_social_graph(seed=42, n=30)
    return graph_to_dict(G)


# ===========================================================================
# 1. Graph utilities – financial graph
# ===========================================================================

def test_graph_utils_financial():
    """generate_financial_graph must produce a graph with at least 30 nodes."""
    G = generate_financial_graph(seed=42)
    assert isinstance(G, nx.Graph)
    assert G.number_of_nodes() >= 30, (
        f"Expected >= 30 nodes, got {G.number_of_nodes()}"
    )
    # Check node attributes exist
    for nid, data in G.nodes(data=True):
        assert "label" in data
        assert "type"  in data


# ===========================================================================
# 2. Graph utilities – medical graph
# ===========================================================================

def test_graph_utils_medical():
    """generate_medical_graph must produce a graph with at least 20 edges."""
    G = generate_medical_graph(seed=42)
    assert isinstance(G, nx.Graph)
    assert G.number_of_edges() >= 20, (
        f"Expected >= 20 edges, got {G.number_of_edges()}"
    )


# ===========================================================================
# 3. graph_to_dict / dict_to_graph round-trip
# ===========================================================================

def test_graph_to_dict():
    """Round-trip: graph → dict → graph must preserve node and edge counts."""
    G_orig = generate_financial_graph(seed=42)
    d = graph_to_dict(G_orig)

    # Verify dict structure
    assert "nodes" in d
    assert "edges" in d
    assert len(d["nodes"]) == G_orig.number_of_nodes()
    assert len(d["edges"]) == G_orig.number_of_edges()

    # Verify node record structure
    first_node = d["nodes"][0]
    for key in ("id", "label", "type", "x", "y", "attrs"):
        assert key in first_node, f"Missing key '{key}' in node dict"

    # Round-trip
    G_rt = dict_to_graph(d)
    assert G_rt.number_of_nodes() == G_orig.number_of_nodes()
    assert G_rt.number_of_edges() == G_orig.number_of_edges()


# ===========================================================================
# 4. get_graph_stats
# ===========================================================================

def test_graph_stats():
    """get_graph_stats must return a dict with all expected keys."""
    G = generate_financial_graph(seed=42)
    stats = get_graph_stats(G)

    required_keys = [
        "node_count",
        "edge_count",
        "avg_degree",
        "density",
        "avg_clustering",
        "triangle_count",
        "diameter",
        "is_connected",
    ]
    for key in required_keys:
        assert key in stats, f"Missing stats key: '{key}'"

    assert stats["node_count"] == G.number_of_nodes()
    assert stats["edge_count"] == G.number_of_edges()
    assert stats["density"] >= 0.0


# ===========================================================================
# 5. Metrics – l1_distance
# ===========================================================================

def test_metrics_l1():
    """l1_distance with known distributions."""
    # Identical distributions → 0
    assert l1_distance([1, 0, 0], [1, 0, 0]) == pytest.approx(0.0, abs=1e-9)

    # Completely opposite distributions → 2.0
    result = l1_distance([1, 0, 0], [0, 0, 1])
    assert result == pytest.approx(2.0, abs=1e-6)

    # Uniform vs concentrated
    p = [0.5, 0.5]
    q = [1.0, 0.0]
    dist = l1_distance(p, q)
    assert 0.0 < dist <= 2.0

    # Dict inputs
    d1 = {1: 5, 2: 5}
    d2 = {1: 10, 2: 0}
    assert l1_distance(d1, d2) == pytest.approx(1.0, abs=1e-6)


# ===========================================================================
# 6. Metrics – hellinger_distance
# ===========================================================================

def test_metrics_hellinger():
    """hellinger_distance with known values."""
    # Identical distributions → 0
    assert hellinger_distance([1, 0], [1, 0]) == pytest.approx(0.0, abs=1e-9)

    # Opposite distributions → 1.0
    result = hellinger_distance([1, 0], [0, 1])
    assert result == pytest.approx(1.0, abs=1e-6)

    # Semi-uniform: H(p,q) in (0, 1)
    result2 = hellinger_distance([0.5, 0.5], [0.8, 0.2])
    assert 0.0 < result2 < 1.0


# ===========================================================================
# 7. Metrics – mse
# ===========================================================================

def test_metrics_mse():
    """mse with known arrays."""
    # Equal arrays → 0
    assert mse([1, 2, 3], [1, 2, 3]) == pytest.approx(0.0, abs=1e-9)

    # Shifted by 1 → MSE = 1.0
    assert mse([1, 2, 3], [2, 3, 4]) == pytest.approx(1.0, abs=1e-9)

    # Single element
    assert mse([0.0], [0.5]) == pytest.approx(0.25, abs=1e-9)


# ===========================================================================
# 8. graph_sdp – basic execution
# ===========================================================================

def test_graph_sdp_basic():
    """run_graph_sdp with epsilon=1.0 must return a result with all required keys."""
    gd = _financial_dict()
    result = run_graph_sdp(gd, epsilon=1.0, seed=42)

    required = ["input_summary", "params", "result", "metrics", "elapsed_ms",
                "explanation_steps"]
    for key in required:
        assert key in result, f"Missing key '{key}' in graph_sdp result"

    metric_keys = [
        "l1_true_vs_corrected",
        "hellinger_true_vs_corrected",
        "mse_true_vs_corrected",
        "utility_score",
    ]
    for key in metric_keys:
        assert key in result["metrics"], f"Missing metric '{key}'"

    assert result["input_summary"]["node_count"] > 0
    assert 0.0 <= result["metrics"]["utility_score"] <= 1.0


# ===========================================================================
# 9. graph_sdp – higher epsilon → better utility
# ===========================================================================

def test_graph_sdp_privacy_budget():
    """
    A higher privacy budget (epsilon) should yield a better utility score
    than a very small one (though not guaranteed every run; use fixed seed).
    """
    gd = _financial_dict()
    result_low  = run_graph_sdp(gd, epsilon=0.1, seed=0)
    result_high = run_graph_sdp(gd, epsilon=10.0, seed=0)

    utility_low  = result_low["metrics"]["utility_score"]
    utility_high = result_high["metrics"]["utility_score"]

    # With a fixed seed and extreme epsilon values the ordering should hold
    assert utility_high >= utility_low, (
        f"Expected higher epsilon → better utility, "
        f"but got {utility_high:.4f} <= {utility_low:.4f}"
    )


# ===========================================================================
# 10. gcc_sdp – basic execution
# ===========================================================================

def test_gcc_sdp_basic():
    """run_gcc_sdp must return a result with required keys."""
    gd = _financial_dict()
    result = run_gcc_sdp(gd, epsilon=1.0, seed=42)

    required = ["input_summary", "params", "result", "metrics", "elapsed_ms",
                "explanation_steps"]
    for key in required:
        assert key in result, f"Missing key '{key}'"

    r = result["result"]
    assert "true_global_cc"               in r
    assert "noisy_global_cc_laplace"      in r
    assert "perturbed_global_cc_subgraph" in r
    assert result["metrics"]["noise_scale"] > 0


# ===========================================================================
# 11. gs_ldp – basic execution
# ===========================================================================

def test_gs_ldp_basic():
    """run_gs_ldp must return a result with required keys."""
    gd = _financial_dict()
    result = run_gs_ldp(gd, epsilon=1.0, seed=42)

    required = ["input_summary", "params", "result", "metrics", "elapsed_ms",
                "explanation_steps"]
    for key in required:
        assert key in result, f"Missing key '{key}'"

    assert "true_edge_count"  in result["result"]
    assert "noisy_edge_count" in result["result"]
    assert "l1_degree_distribution" in result["metrics"]


# ===========================================================================
# 12. ndkd – k-anonymity satisfied
# ===========================================================================

def test_ndkd_k_anonymity():
    """run_ndkd with k=3 on a financial graph must satisfy k-anonymity."""
    gd = _financial_dict()
    result = run_ndkd(gd, k=3, epsilon=1.0, seed=42)

    required = ["input_summary", "params", "result", "metrics", "elapsed_ms",
                "explanation_steps"]
    for key in required:
        assert key in result, f"Missing key '{key}'"

    # k_anonymity_satisfied is checked after degree adjustment (before disturbance)
    k_ok = result["result"]["k_anonymity_satisfied"]
    assert k_ok is True, (
        "Expected k-anonymity to be satisfied after degree adjustment with k=3, "
        f"but got: {k_ok}"
    )


# ===========================================================================
# 13. vpcs – basic query (verify_result=True)
# ===========================================================================

def test_vpcs_basic():
    """run_vpcs_query on a normal (non-tampered) query must verify successfully."""
    gd = _financial_dict()
    result = run_vpcs_query(
        gd,
        source_node="0",
        target_node="10",
        cost_threshold=0.0,
        time_threshold=0.0,
        distance_constraint=0.0,
        budget=0.0,
        tampered=False,
        seed=42,
    )

    assert "verify_result" in result
    assert "proof_hash"    in result
    assert "result_path"   in result
    assert result["verify_result"] is True, (
        f"Expected verify_result=True for normal query, got {result['verify_result']}"
    )
    assert len(result["result_path"]) >= 1


# ===========================================================================
# 14. vpcs – tamper demo (verify_result=False)
# ===========================================================================

def test_vpcs_tamper():
    """run_vpcs_tamper_demo must show that the tampered proof fails verification."""
    gd = _financial_dict()
    demo = run_vpcs_tamper_demo({
        "graph_dict": gd,
        "source_node": "0",
        "target_node": "10",
        "seed": 42,
    })

    assert "normal"       in demo
    assert "tampered"     in demo
    assert "demo_summary" in demo

    assert demo["normal"]["verify_result"]   is True
    assert demo["tampered"]["verify_result"] is False
    assert demo["demo_summary"]["normal_verify"]   is True
    assert demo["demo_summary"]["tampered_verify"] is False


# ===========================================================================
# 15. zkgcn – basic inference (verify_result=True)
# ===========================================================================

def test_zkgcn_basic():
    """run_zkgcn_infer on a normal (non-tampered) run must verify successfully."""
    gd = _financial_dict()
    result = run_zkgcn_infer(
        gd,
        model_type="gcn",
        layers=2,
        hidden_dim=32,
        num_classes=3,
        tampered=False,
        seed=42,
    )

    required = [
        "model_type", "inference_result", "proof_hash",
        "vk_hash", "pk_hash", "verify_result", "elapsed_ms",
    ]
    for key in required:
        assert key in result, f"Missing key '{key}'"

    assert result["verify_result"] is True, (
        f"Expected verify_result=True for normal zkgcn, got {result['verify_result']}"
    )
    assert result["inference_result"]["num_nodes"] > 0


# ===========================================================================
# 16. zkgcn – tamper demo (verify_result=False)
# ===========================================================================

def test_zkgcn_tamper():
    """run_zkgcn_tamper_demo must show that the tampered proof fails verification."""
    gd = _financial_dict()
    demo = run_zkgcn_tamper_demo({
        "graph_dict": gd,
        "model_type": "gcn",
        "layers": 2,
        "hidden_dim": 32,
        "num_classes": 3,
        "seed": 42,
    })

    assert "normal"       in demo
    assert "tampered"     in demo
    assert "demo_summary" in demo

    assert demo["normal"]["verify_result"]   is True
    assert demo["tampered"]["verify_result"] is False
    assert demo["demo_summary"]["proofs_differ"] is True


# ===========================================================================
# 17. Audit chain hash logic
# ===========================================================================

def _compute_log_hash_inline(
    timestamp: str,
    username: str,
    action: str,
    target_type: str,
    target_id: str,
    result: str,
    prev_hash: str,
) -> str:
    """
    Inline copy of audit_service._compute_log_hash to avoid importing
    the SQLAlchemy-dependent audit_service module in an environment that
    may not have SQLAlchemy installed.
    """
    payload = (
        f"{timestamp}|{username}|{action}|"
        f"{target_type}|{target_id}|{result}|{prev_hash}"
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def test_audit_chain_valid():
    """
    Manually simulate the audit hash chain and verify it.
    Replicates the same logic as audit_service._compute_log_hash.
    """
    _compute_log_hash = _compute_log_hash_inline

    # Build a 3-entry chain from scratch
    entries = [
        {
            "timestamp": "2026-01-01T10:00:00",
            "username": "admin",
            "action": "create_asset",
            "target_type": "asset",
            "target_id": "1",
            "result": "success",
        },
        {
            "timestamp": "2026-01-01T10:01:00",
            "username": "analyst",
            "action": "run_algorithm",
            "target_type": "privacy_task",
            "target_id": "1",
            "result": "success",
        },
        {
            "timestamp": "2026-01-01T10:02:00",
            "username": "auditor",
            "action": "verify_chain",
            "target_type": "audit_log",
            "target_id": "all",
            "result": "success",
        },
    ]

    prev_hash = "0" * 64
    chain: list[dict] = []

    for entry in entries:
        log_hash = _compute_log_hash(
            entry["timestamp"],
            entry["username"],
            entry["action"],
            entry["target_type"],
            entry["target_id"],
            entry["result"],
            prev_hash,
        )
        chain.append({**entry, "log_hash": log_hash, "prev_hash": prev_hash})
        prev_hash = log_hash

    # Verify the chain: each entry's log_hash must match the recomputed value
    running_prev = "0" * 64
    for record in chain:
        expected = _compute_log_hash(
            record["timestamp"],
            record["username"],
            record["action"],
            record["target_type"],
            record["target_id"],
            record["result"],
            running_prev,
        )
        assert record["log_hash"] == expected, (
            f"Hash mismatch for entry {record['action']}"
        )
        running_prev = record["log_hash"]

    # Simulate tampering: mutate one entry's action
    chain[1]["action"] = "TAMPERED_ACTION"
    tamper_detected = False
    running_prev = "0" * 64
    for record in chain:
        expected = _compute_log_hash(
            record["timestamp"],
            record["username"],
            record["action"],
            record["target_type"],
            record["target_id"],
            record["result"],
            running_prev,
        )
        if record["log_hash"] != expected:
            tamper_detected = True
            break
        running_prev = record["log_hash"]

    assert tamper_detected, "Tampering was not detected in the audit chain"


# ===========================================================================
# 18. edge_change_ratio – known graphs
# ===========================================================================

def test_edge_change_ratio():
    """edge_change_ratio on known graph pairs."""
    # Identical graphs → ratio = 0.0
    G1 = nx.path_graph(5)
    G2 = nx.path_graph(5)
    assert edge_change_ratio(G1, G2) == pytest.approx(0.0)

    # G1 has edges {(0,1),(1,2),(2,3),(3,4)} – 4 edges
    # G_empty has no edges
    G_empty = nx.Graph()
    G_empty.add_nodes_from(range(5))
    ratio = edge_change_ratio(G1, G_empty)
    # symmetric diff = 4, original = 4 → ratio = 1.0
    assert ratio == pytest.approx(1.0)

    # Original empty → ratio = 0.0 (no edges to compare)
    assert edge_change_ratio(G_empty, G1) == pytest.approx(0.0)

    # Partially overlapping
    G3 = nx.path_graph(5)
    G4 = nx.Graph()
    G4.add_edges_from([(0, 1), (1, 2)])  # 2 out of 4 original edges
    ratio2 = edge_change_ratio(G3, G4)
    # symmetric diff = 2, original = 4 → ratio = 0.5
    assert ratio2 == pytest.approx(0.5)

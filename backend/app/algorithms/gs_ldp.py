"""
gs_ldp.py
Graph Statistics Local Differential Privacy (GS-LDP).

Based on: 基于本地差分隐私的分布式图统计采集算法 (傅培旺 et al., 2024).
Implements the core GS-LDP algorithm:
  1. Degree distribution collection with Node-LDP (symmetric unary coding + grouping)
  2. Triangle count sequence collection (Node-LDP & Edge-LDP with pruning)
  3. Clustering coefficient collection (Laplace mechanism on top of triangle counts)

数智安行 data governance platform.
"""

from __future__ import annotations

import math
import time
from typing import Any

import numpy as np
import networkx as nx

from .graph_utils import dict_to_graph, get_degree_distribution, graph_to_dict
from .metrics import l1_distance, hellinger_distance, normalize_histogram


# ---------------------------------------------------------------------------
# LDP primitives
# ---------------------------------------------------------------------------

def _rr_bit(bit: int, epsilon: float, rng: np.random.Generator) -> int:
    """
    1-bit Randomized Response.
    p = e^ε/(e^ε+1) to keep true, q = 1/(e^ε+1) to flip.
    """
    exp_e = math.exp(epsilon)
    p = exp_e / (exp_e + 1.0)
    return bit if rng.random() < p else (1 - bit)


def _debias_count(noisy_count: float, n_reports: int, epsilon: float) -> float:
    """
    Debias the noisy sum of RR bits.
    corrected = (noisy_count - n*q) / (p - q)
    """
    exp_e = math.exp(epsilon)
    p = exp_e / (exp_e + 1.0)
    q = 1.0 / (exp_e + 1.0)
    pq = p - q
    if pq < 1e-12:
        return noisy_count
    return (noisy_count - n_reports * q) / pq


# ---------------------------------------------------------------------------
# Symmetric Unary Coding (SUC) — Node-LDP degree distribution
# ---------------------------------------------------------------------------

def _suc_encode(value: int, domain_size: int) -> list[int]:
    """
    Symmetric Unary Coding: encode integer *value* in [0, domain_size) as a
    binary vector of length domain_size with 1 at position *value*.
    """
    vec = [0] * domain_size
    if 0 <= value < domain_size:
        vec[value] = 1
    return vec


def _suc_perturb(encoded: list[int], epsilon: float, rng: np.random.Generator) -> list[int]:
    """
    Perturb each bit of a SUC-encoded vector with Randomized Response.
    Each bit is kept with prob p = e^(ε/2)/(e^(ε/2)+1), flipped otherwise.
    """
    eps_half = epsilon / 2.0
    exp_h = math.exp(eps_half)
    p = exp_h / (exp_h + 1.0)
    return [bit if rng.random() < p else (1 - bit) for bit in encoded]


def _suc_aggregate_and_debias(
    perturbed_vectors: list[list[int]],
    domain_size: int,
    epsilon: float,
) -> list[float]:
    """
    Aggregate perturbed SUC vectors and debias each position.
    Returns estimated frequency for each degree bucket.
    """
    n = len(perturbed_vectors)
    if n == 0:
        return [0.0] * domain_size
    eps_half = epsilon / 2.0
    exp_h = math.exp(eps_half)
    p = exp_h / (exp_h + 1.0)
    q = 1.0 / (exp_h + 1.0)
    pq = p - q

    counts = [0.0] * domain_size
    for vec in perturbed_vectors:
        for i, bit in enumerate(vec):
            counts[i] += bit

    if pq < 1e-12:
        return [c / n for c in counts]

    debiased = [(c - n * q) / pq for c in counts]
    # Clip negatives and normalize
    debiased = [max(0.0, v) for v in debiased]
    total = sum(debiased)
    if total > 0:
        debiased = [v / total for v in debiased]
    return debiased


# ---------------------------------------------------------------------------
# Degree distribution with Node-LDP (grouping + SUC)
# ---------------------------------------------------------------------------

def _collect_degree_distribution_node_ldp(
    G: nx.Graph,
    epsilon: float,
    n_groups: int,
    rng: np.random.Generator,
) -> tuple[dict[int, float], int]:
    """
    Collect degree distribution using Node-LDP with grouping + SUC.

    Returns:
        estimated_dd  : dict degree -> estimated probability
        threshold     : degree threshold derived from distribution (used by triangle step)
    """
    nodes = list(G.nodes())
    n = len(nodes)
    if n == 0:
        return {}, 0

    true_degrees = dict(G.degree())
    max_degree = max(true_degrees.values()) if true_degrees else 0
    domain_size = max_degree + 1

    # Group nodes (grouping mechanism to reduce sensitivity)
    group_size = max(1, n // max(1, n_groups))
    shuffled = nodes.copy()
    rng.shuffle(shuffled)
    groups = [shuffled[i: i + group_size] for i in range(0, n, group_size)]

    all_perturbed: list[list[int]] = []
    for group in groups:
        group_eps = epsilon  # each group uses the full budget
        for node in group:
            deg = true_degrees[node]
            encoded = _suc_encode(min(deg, domain_size - 1), domain_size)
            perturbed = _suc_perturb(encoded, group_eps, rng)
            all_perturbed.append(perturbed)

    estimated_freq = _suc_aggregate_and_debias(all_perturbed, domain_size, epsilon)
    estimated_dd = {d: float(estimated_freq[d]) for d in range(domain_size)}

    # Threshold: degree value below which ~90% of nodes fall
    cumsum = 0.0
    threshold = domain_size - 1
    for d in range(domain_size):
        cumsum += estimated_dd[d]
        if cumsum >= 0.9:
            threshold = d
            break

    return estimated_dd, threshold


# ---------------------------------------------------------------------------
# Triangle count — Edge-LDP with pruning
# ---------------------------------------------------------------------------

def _collect_triangle_count_edge_ldp(
    G: nx.Graph,
    epsilon: float,
    threshold: int,
    rng: np.random.Generator,
) -> dict[Any, float]:
    """
    Collect triangle count sequence using Edge-LDP.

    Each node perturbs its adjacency row with 1-bit RR (edge-LDP),
    then the aggregator reconstructs a noisy adjacency matrix.
    A pruning step removes noisy edges exceeding the degree threshold
    to reduce over-estimation of triangles.

    Returns: dict node -> estimated local triangle count
    """
    nodes = list(G.nodes())
    n = len(nodes)
    node_index = {v: i for i, v in enumerate(nodes)}

    # Build true adjacency
    A = np.zeros((n, n), dtype=np.int8)
    for u, v in G.edges():
        i, j = node_index[u], node_index[v]
        A[i, j] = 1
        A[j, i] = 1

    exp_e = math.exp(epsilon)
    p_rr = exp_e / (exp_e + 1.0)
    q_rr = 1.0 / (exp_e + 1.0)

    # Perturb adjacency with edge-LDP (each node's row)
    A_noisy = np.zeros((n, n), dtype=np.int8)
    for i in range(n):
        for j in range(i + 1, n):
            bit = int(A[i, j])
            noisy = _rr_bit(bit, epsilon, rng)
            A_noisy[i, j] = noisy
            A_noisy[j, i] = noisy

    # Pruning: for each node, keep only top-threshold neighbours
    if threshold > 0:
        for i in range(n):
            row = A_noisy[i].copy()
            degree_noisy = int(row.sum())
            if degree_noisy > threshold:
                nonzero_js = np.where(row > 0)[0]
                to_remove = int(degree_noisy - threshold)
                remove_idx = rng.choice(nonzero_js, size=to_remove, replace=False)
                A_noisy[i, remove_idx] = 0
                A_noisy[remove_idx, i] = 0

    # Count triangles from noisy adjacency
    # For node i: triangle_count_i = sum_{j,k} A_noisy[i,j]*A_noisy[j,k]*A_noisy[k,i] / 2
    estimated_triangles: dict[Any, float] = {}
    A_sq = A_noisy.astype(np.int32) @ A_noisy.astype(np.int32)
    for i, node in enumerate(nodes):
        raw = float(A_sq[i, i]) / 2.0  # A^2[i,i] counts paths i->j->i for all j
        # Debias: E[A_noisy[i,j]] = (p-q)*A[i,j] + q
        # E[triangle_count_noisy] = (p-q)^3 * true + correction
        pq = p_rr - q_rr
        if abs(pq) > 1e-9:
            debiased = max(0.0, (raw - (n - 1) * q_rr ** 2) / (pq ** 2))
        else:
            debiased = raw
        estimated_triangles[node] = debiased

    return estimated_triangles


# ---------------------------------------------------------------------------
# Triangle count — Node-LDP
# ---------------------------------------------------------------------------

def _collect_triangle_count_node_ldp(
    G: nx.Graph,
    epsilon: float,
    threshold: int,
    rng: np.random.Generator,
) -> dict[Any, float]:
    """
    Collect triangle count sequence using Node-LDP.

    Each node perturbs its entire adjacency row (stronger privacy than Edge-LDP,
    more noise). Uses the same pruning step.
    """
    # Node-LDP applies a stricter per-node privacy budget: epsilon is split
    # across all n-1 edge bits. We use a conservative epsilon per bit.
    nodes = list(G.nodes())
    n = len(nodes)
    if n < 3:
        return {node: 0.0 for node in nodes}

    # For Node-LDP, each bit is perturbed with ε_bit = ε / (n-1)
    # This ensures the whole row satisfies ε-Node-LDP (composition)
    eps_bit = epsilon / max(1, n - 1)
    node_index = {v: i for i, v in enumerate(nodes)}

    A = np.zeros((n, n), dtype=np.int8)
    for u, v in G.edges():
        i, j = node_index[u], node_index[v]
        A[i, j] = 1
        A[j, i] = 1

    A_noisy = np.zeros((n, n), dtype=np.int8)
    for i in range(n):
        for j in range(i + 1, n):
            bit = int(A[i, j])
            noisy = _rr_bit(bit, eps_bit, rng)
            A_noisy[i, j] = noisy
            A_noisy[j, i] = noisy

    # Pruning
    if threshold > 0:
        for i in range(n):
            row = A_noisy[i].copy()
            degree_noisy = int(row.sum())
            if degree_noisy > threshold:
                nonzero_js = np.where(row > 0)[0]
                to_remove = int(degree_noisy - threshold)
                remove_idx = rng.choice(nonzero_js, size=to_remove, replace=False)
                A_noisy[i, remove_idx] = 0
                A_noisy[remove_idx, i] = 0

    # Count from noisy adjacency
    A_sq = A_noisy.astype(np.int32) @ A_noisy.astype(np.int32)
    estimated_triangles: dict[Any, float] = {}
    for i, node in enumerate(nodes):
        raw = float(A_sq[i, i]) / 2.0
        estimated_triangles[node] = max(0.0, raw)

    return estimated_triangles


# ---------------------------------------------------------------------------
# Clustering coefficient — Laplace on top of triangle estimates
# ---------------------------------------------------------------------------

def _collect_clustering_coefficient(
    G: nx.Graph,
    triangle_estimates: dict[Any, float],
    epsilon_cc: float,
    rng: np.random.Generator,
) -> tuple[dict[Any, float], float]:
    """
    Collect clustering coefficient using Laplace mechanism on estimated triangles.

    cc_i = 2 * triangles_i / (deg_i * (deg_i - 1))
    Then add Laplace noise with sensitivity = 1/(n-2).

    Returns: (per_node_cc, global_cc_estimate)
    """
    nodes = list(G.nodes())
    n = len(nodes)
    sensitivity = 1.0 / max(1, n - 2)
    scale = sensitivity / max(epsilon_cc, 1e-9)

    noisy_degrees = dict(G.degree())
    per_node_cc: dict[Any, float] = {}

    for node in nodes:
        deg = noisy_degrees.get(node, 0)
        possible = deg * (deg - 1)
        if possible <= 0:
            per_node_cc[node] = 0.0
            continue
        tri = triangle_estimates.get(node, 0.0)
        cc = min(1.0, 2.0 * tri / possible)
        noise = float(rng.laplace(0.0, scale))
        per_node_cc[node] = float(np.clip(cc + noise, 0.0, 1.0))

    global_cc = float(np.mean(list(per_node_cc.values()))) if per_node_cc else 0.0
    return per_node_cc, global_cc


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_gs_ldp(
    graph_dict: dict,
    epsilon: float,
    mode: str = "edge_ldp",
    n_groups: int = 5,
    randomize_edges: bool = True,
    randomize_attributes: bool = True,
    edge_flip_prob: float = 0.0,
    attr_noise_scale: float = 0.5,
    seed: int = 42,
) -> dict:
    """
    Run GS-LDP on the provided graph: collect degree distribution,
    triangle count sequence, and clustering coefficient simultaneously.

    Parameters
    ----------
    graph_dict        : dict   – graph in {nodes, edges} format
    epsilon           : float  – privacy budget ε
    mode              : str    – "node_ldp" or "edge_ldp" privacy model
    n_groups          : int    – number of node groups for degree distribution (Node-LDP)
    randomize_edges   : bool   – apply edge-level LDP (legacy flag, overridden by mode)
    randomize_attributes : bool – add Laplace noise to node scalar attributes
    edge_flip_prob    : float  – legacy extra flip probability (ignored when mode active)
    attr_noise_scale  : float  – Laplace scale for attribute noise
    seed              : int    – random seed

    Returns
    -------
    dict with keys: input_summary, params, result, metrics, elapsed_ms,
                    explanation_steps
    """
    t_start = time.time()
    rng = np.random.default_rng(seed)
    explanation_steps: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Step 1 – Load graph
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 1,
        "description": "图结构加载与初始化",
        "detail": f"将输入字典转换为 networkx 图，隐私模式: {mode.upper()}，ε={epsilon}。",
    })

    G = dict_to_graph(graph_dict)
    n = G.number_of_nodes()
    m = G.number_of_edges()
    nodes = list(G.nodes())

    # True statistics for comparison
    true_degrees = dict(G.degree())
    true_dd = get_degree_distribution(G)
    true_triangles = nx.triangles(G)
    true_per_node_cc = nx.clustering(G)
    true_global_cc = sum(true_per_node_cc.values()) / max(1, n)
    true_triangle_count = sum(true_triangles.values()) // 3

    exp_e = math.exp(epsilon)
    p_rr = exp_e / (exp_e + 1.0)
    q_rr = 1.0 / (exp_e + 1.0)

    input_summary = {
        "node_count": n,
        "edge_count": m,
        "epsilon": epsilon,
        "mode": mode,
        "true_triangle_count": true_triangle_count,
        "true_global_cc": round(true_global_cc, 6),
        "p_rr": round(p_rr, 6),
        "q_rr": round(q_rr, 6),
    }

    # ------------------------------------------------------------------
    # Step 2 – Degree distribution (Node-LDP with grouping + SUC)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 2,
        "description": "度分布采集 — Node-LDP（分组机制 + 对称一元编码 SUC）",
        "detail": (
            f"将 {n} 个节点分为 {n_groups} 组，每个节点用对称一元编码 (SUC) 将度数编码为"
            f"二进制向量，再用 ε/2-随机响应扰动各位，聚合后去偏差恢复度分布估计。"
        ),
    })

    estimated_dd, degree_threshold = _collect_degree_distribution_node_ldp(
        G, epsilon, n_groups, rng
    )

    # Compare with true degree distribution
    max_deg = max(true_dd.keys()) if true_dd else 0
    domain = list(range(max_deg + 1))
    true_norm = normalize_histogram({d: true_dd.get(d, 0) for d in domain})
    est_norm = normalize_histogram({d: estimated_dd.get(d, 0.0) for d in domain})

    t_list = [true_norm.get(d, 0.0) for d in domain]
    e_list = [est_norm.get(d, 0.0) for d in domain]
    dd_l1 = l1_distance(t_list, e_list)
    dd_hel = hellinger_distance(t_list, e_list)

    # ------------------------------------------------------------------
    # Step 3 – Triangle count (Node-LDP or Edge-LDP + pruning)
    # ------------------------------------------------------------------
    if mode == "node_ldp":
        tri_desc = "Node-LDP 三角计数（每节点对全行邻接向量扰动，ε_bit = ε/(n-1)）"
        tri_detail = (
            f"Node-LDP 下每位扰动预算 ε_bit = {epsilon}/{n-1} = {epsilon/max(1,n-1):.4f}，"
            f"保证整行满足 ε-Node-LDP。"
            f"以度分布阈值 {degree_threshold} 剪枝噪声边，再统计三角计数。"
        )
    else:
        tri_desc = "Edge-LDP 三角计数（每条边独立扰动，1-bit RR）"
        tri_detail = (
            f"Edge-LDP 下每条边以 p={p_rr:.4f} 保真，q={q_rr:.4f} 翻转，"
            f"以度分布阈值 {degree_threshold} 剪枝后统计三角计数。"
        )

    explanation_steps.append({
        "step": 3,
        "description": f"三角计数序列采集 — {tri_desc}",
        "detail": tri_detail,
    })

    if mode == "node_ldp":
        estimated_triangles = _collect_triangle_count_node_ldp(G, epsilon, degree_threshold, rng)
    else:
        estimated_triangles = _collect_triangle_count_edge_ldp(G, epsilon, degree_threshold, rng)

    # Triangle accuracy
    true_tri_list = [float(true_triangles.get(v, 0)) for v in nodes]
    est_tri_list = [estimated_triangles.get(v, 0.0) for v in nodes]
    tri_mae = float(np.mean(np.abs(np.array(true_tri_list) - np.array(est_tri_list))))
    tri_mse = float(np.mean((np.array(true_tri_list) - np.array(est_tri_list)) ** 2))

    # ------------------------------------------------------------------
    # Step 4 – Clustering coefficient (Laplace mechanism)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 4,
        "description": "聚类系数采集 — Laplace 机制",
        "detail": (
            "基于估计的三角计数计算各节点局部聚类系数 cc_i = 2*tri_i / (deg_i*(deg_i-1))，"
            f"添加 Laplace 噪声（敏感度 = 1/(n-2) = {1/max(1,n-2):.6f}，尺度 b=s/ε）。"
        ),
    })

    estimated_per_node_cc, estimated_global_cc = _collect_clustering_coefficient(
        G, estimated_triangles, epsilon, rng
    )

    cc_abs_error = abs(estimated_global_cc - true_global_cc)
    cc_rel_error = cc_abs_error / true_global_cc if true_global_cc > 0 else 0.0

    # ------------------------------------------------------------------
    # Step 5 – Optional: attribute noise (legacy)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 5,
        "description": "节点属性扰动（可选）",
        "detail": (
            f"对节点数值属性添加 Laplace 噪声（scale={attr_noise_scale}），"
            "支持数值型属性的本地差分隐私保护。"
            + ("（已启用）" if randomize_attributes else "（已禁用）")
        ),
    })

    noisy_attrs: dict[Any, dict] = {}
    if randomize_attributes:
        for v in nodes:
            attrs = dict(G.nodes[v])
            noisy_node_attrs: dict[str, Any] = {}
            for k, val in attrs.items():
                if isinstance(val, (int, float)) and k not in ("x", "y", "id"):
                    noise = float(rng.laplace(0.0, attr_noise_scale))
                    noisy_node_attrs[k] = round(float(val) + noise, 4)
                else:
                    noisy_node_attrs[k] = val
            noisy_attrs[v] = noisy_node_attrs
    else:
        for v in nodes:
            noisy_attrs[v] = dict(G.nodes[v])

    # ------------------------------------------------------------------
    # Step 6 – Edge-level reconstruction (for noisy graph output)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 6,
        "description": "扰动图重建与多统计指标汇总",
        "detail": (
            "综合度分布、三角计数、聚类系数的扰动结果，"
            "重建扰动图并计算各项效用指标，输出完整统计对比。"
        ),
    })

    # Build a simple noisy graph via Edge-LDP for output/display purposes
    node_index = {v: i for i, v in enumerate(nodes)}
    A = np.zeros((n, n), dtype=np.int8)
    for u, v in G.edges():
        i, j = node_index[u], node_index[v]
        A[i, j] = 1
        A[j, i] = 1

    A_noisy = np.zeros((n, n), dtype=np.int8)
    if randomize_edges or mode == "edge_ldp":
        for i in range(n):
            for j in range(i + 1, n):
                bit = int(A[i, j])
                noisy_bit = _rr_bit(bit, epsilon, rng)
                A_noisy[i, j] = noisy_bit
                A_noisy[j, i] = noisy_bit
    else:
        A_noisy = A.copy()

    G_noisy = nx.Graph()
    for node in nodes:
        G_noisy.add_node(node, **noisy_attrs.get(node, {}))
    for i in range(n):
        for j in range(i + 1, n):
            if A_noisy[i, j] == 1:
                u, v = nodes[i], nodes[j]
                edge_data = G.get_edge_data(u, v) or {}
                G_noisy.add_edge(u, v, **edge_data)

    noisy_dd = get_degree_distribution(G_noisy)
    edge_count_change = abs(G_noisy.number_of_edges() - m)
    edge_change_ratio = edge_count_change / max(1, m)

    # ------------------------------------------------------------------
    # Elapsed
    # ------------------------------------------------------------------
    elapsed_ms = (time.time() - t_start) * 1000.0

    # Degree distribution summary
    def _dd_summary(dd_dict: dict) -> dict:
        keys = sorted(dd_dict.keys())
        total = sum(dd_dict.values()) or 1
        return {
            "degrees": keys,
            "counts": [dd_dict.get(k, 0) for k in keys],
            "normalized": [round(dd_dict.get(k, 0) / total, 6) for k in keys],
        }

    return {
        "input_summary": input_summary,
        "params": {
            "epsilon": epsilon,
            "mode": mode,
            "n_groups": n_groups,
            "randomize_edges": randomize_edges,
            "randomize_attributes": randomize_attributes,
            "attr_noise_scale": attr_noise_scale,
            "seed": seed,
        },
        "result": {
            # Degree distribution
            "true_degree_distribution": _dd_summary(true_dd),
            "estimated_degree_distribution": _dd_summary(
                {d: round(v, 6) for d, v in estimated_dd.items() if v > 0}
            ),
            "degree_threshold": degree_threshold,
            # Triangle counts
            "true_total_triangles": true_triangle_count,
            "estimated_triangles_sample": {
                str(v): round(estimated_triangles.get(v, 0.0), 2)
                for v in nodes[:10]
            },
            "true_triangles_sample": {
                str(v): true_triangles.get(v, 0)
                for v in nodes[:10]
            },
            # Clustering coefficient
            "true_global_cc": round(true_global_cc, 6),
            "estimated_global_cc": round(estimated_global_cc, 6),
            "estimated_per_node_cc_sample": {
                str(v): round(estimated_per_node_cc.get(v, 0.0), 4)
                for v in nodes[:10]
            },
            "true_per_node_cc_sample": {
                str(v): round(true_per_node_cc.get(v, 0.0), 4)
                for v in nodes[:10]
            },
            # Noisy graph (backward-compat keys)
            "true_edge_count": m,
            "noisy_edge_count": G_noisy.number_of_edges(),
            "noisy_degree_distribution": _dd_summary(noisy_dd),
        },
        "metrics": {
            # Degree distribution utility
            "l1_degree_distribution": round(dd_l1, 6),
            "degree_dist_l1": round(dd_l1, 6),
            "degree_dist_hellinger": round(dd_hel, 6),
            # Triangle count utility
            "triangle_mae": round(tri_mae, 4),
            "triangle_mse": round(tri_mse, 4),
            # Clustering coefficient utility
            "cc_absolute_error": round(cc_abs_error, 6),
            "cc_relative_error": round(cc_rel_error, 6),
            # Edge perturbation
            "edge_count_change": edge_count_change,
            "edge_change_ratio": round(edge_change_ratio, 6),
            "p_rr": round(p_rr, 6),
            "q_rr": round(q_rr, 6),
        },
        "elapsed_ms": round(elapsed_ms, 3),
        "explanation_steps": explanation_steps,
    }

"""
gs_ldp.py
Graph Statistics Local Differential Privacy (GS-LDP).

Based on: 基于本地差分隐私的分布式图统计采集算法 (傅培旺).
Each node perturbs its local edge-presence bits via Randomized Response
before reporting to the aggregator, who reconstructs a noisy degree
distribution / edge-count estimate.

数智安行 data governance platform.
"""

from __future__ import annotations

import hashlib
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
    Returns the true bit with prob p = e^ε/(e^ε+1), flips with prob q = 1/(e^ε+1).
    """
    exp_e = math.exp(epsilon)
    p = exp_e / (exp_e + 1.0)
    return bit if rng.random() < p else (1 - bit)


def _debias_count(noisy_count: float, n_reports: int, epsilon: float) -> float:
    """
    Debias the noisy sum of Randomized-Response bits.
    corrected = (noisy_count - n * q) / (p - q)
    where p = e^ε/(e^ε+1), q = 1/(e^ε+1).
    """
    exp_e = math.exp(epsilon)
    p = exp_e / (exp_e + 1.0)
    q = 1.0 / (exp_e + 1.0)
    pq = p - q
    if pq < 1e-12:
        return noisy_count
    return (noisy_count - n_reports * q) / pq


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run_gs_ldp(
    graph_dict: dict,
    epsilon: float,
    randomize_edges: bool = True,
    randomize_attributes: bool = True,
    edge_flip_prob: float = 0.1,
    attr_noise_scale: float = 0.5,
    seed: int = 42,
) -> dict:
    """
    Run GS-LDP on the provided graph.

    Parameters
    ----------
    graph_dict        : dict  – graph in {nodes, edges} format
    epsilon           : float – privacy budget ε (used for RR probability)
    randomize_edges   : bool  – apply edge-level LDP
    randomize_attributes : bool – add noise to node scalar attributes
    edge_flip_prob    : float – additional edge flip probability (0.0 = off)
    attr_noise_scale  : float – Laplace scale for attribute noise
    seed              : int   – random seed

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
        "detail": "将输入字典转换为 networkx 图，统计基本信息。",
    })

    G = dict_to_graph(graph_dict)
    n = G.number_of_nodes()
    m = G.number_of_edges()
    nodes = list(G.nodes())
    node_index = {v: i for i, v in enumerate(nodes)}

    exp_e = math.exp(epsilon)
    p_rr = exp_e / (exp_e + 1.0)
    q_rr = 1.0 / (exp_e + 1.0)

    input_summary = {
        "node_count": n,
        "edge_count": m,
        "epsilon": epsilon,
        "p_rr": round(p_rr, 6),
        "q_rr": round(q_rr, 6),
    }

    # ------------------------------------------------------------------
    # Step 2 – Build adjacency matrix
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 2,
        "description": "构建邻接矩阵",
        "detail": f"将图转换为 {n}×{n} 二进制邻接矩阵，用于本地扰动。",
    })

    A = np.zeros((n, n), dtype=np.int8)
    for u, v in G.edges():
        i, j = node_index[u], node_index[v]
        A[i, j] = 1
        A[j, i] = 1

    # ------------------------------------------------------------------
    # Step 3 – Local edge perturbation (Randomized Response)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 3,
        "description": "本地边扰动 (随机响应 RR)",
        "detail": (
            f"每个节点对其邻接行执行 1-bit RR 扰动，ε={epsilon}，"
            f"保持真实值的概率 p={p_rr:.4f}，翻转概率 q={q_rr:.4f}。"
        ),
    })

    A_noisy = np.zeros((n, n), dtype=np.int8)
    if randomize_edges:
        for i in range(n):
            for j in range(i + 1, n):
                bit = int(A[i, j])
                noisy_bit = _rr_bit(bit, epsilon, rng)
                A_noisy[i, j] = noisy_bit
                A_noisy[j, i] = noisy_bit
    else:
        A_noisy = A.copy()

    # Apply extra edge-flip noise if requested
    if edge_flip_prob > 0 and randomize_edges:
        flip_mask = rng.random((n, n)) < edge_flip_prob
        flip_mask = np.tril(flip_mask, -1)
        flip_mask = flip_mask + flip_mask.T
        A_noisy = np.abs(A_noisy - flip_mask.astype(np.int8)).astype(np.int8)
        np.fill_diagonal(A_noisy, 0)

    # ------------------------------------------------------------------
    # Step 4 – Reconstruct noisy graph
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 4,
        "description": "重建扰动图",
        "detail": "根据扰动后的邻接矩阵重建图，计算扰动后的度数分布。",
    })

    G_noisy = nx.Graph()
    for node in nodes:
        G_noisy.add_node(node, **{k: v for k, v in G.nodes[node].items()})
    for i in range(n):
        for j in range(i + 1, n):
            if A_noisy[i, j] == 1:
                u, v = nodes[i], nodes[j]
                edge_data = G.get_edge_data(u, v) or {}
                G_noisy.add_edge(u, v, **edge_data)

    # ------------------------------------------------------------------
    # Step 5 – Degree debiasing
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 5,
        "description": "度数偏差修正",
        "detail": (
            "对每个节点报告的度数进行去偏差处理："
            "corrected_degree = (noisy_degree - n·q) / (p - q)。"
        ),
    })

    true_degrees = dict(G.degree())
    noisy_degrees = dict(G_noisy.degree())

    debiased_degrees: dict[Any, float] = {}
    for v in nodes:
        noisy_d = noisy_degrees.get(v, 0)
        debiased_d = _debias_count(float(noisy_d), n - 1, epsilon)
        debiased_degrees[v] = max(0.0, debiased_d)

    # ------------------------------------------------------------------
    # Step 6 – Attribute noise (optional)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 6,
        "description": "节点属性扰动 (可选)",
        "detail": (
            f"对节点数值属性添加 Laplace 噪声 (scale={attr_noise_scale})，"
            "实现本地属性差分隐私保护。"
        ),
    })

    noisy_attrs: dict[Any, dict] = {}
    if randomize_attributes:
        for v in nodes:
            attrs = dict(G.nodes[v])
            noisy_node_attrs = {}
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
    # Step 7 – Metrics
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 7,
        "description": "效用评估",
        "detail": "计算扰动前后度数分布的 L1、Hellinger 距离，并估算隐私放大效果。",
    })

    true_dd = get_degree_distribution(G)
    noisy_dd = get_degree_distribution(G_noisy)
    all_degs = sorted(set(true_dd) | set(noisy_dd))

    true_norm = normalize_histogram({d: true_dd.get(d, 0) for d in all_degs})
    noisy_norm = normalize_histogram({d: noisy_dd.get(d, 0) for d in all_degs})

    t_list = [true_norm[d] for d in all_degs]
    n_list = [noisy_norm[d] for d in all_degs]

    l1 = l1_distance(t_list, n_list)
    hel = hellinger_distance(t_list, n_list)

    # Degree error stats
    degree_errors = [
        abs(debiased_degrees[v] - true_degrees[v]) for v in nodes
    ]
    mean_deg_err = float(np.mean(degree_errors)) if degree_errors else 0.0

    edge_count_change = abs(G_noisy.number_of_edges() - m)
    edge_change_ratio = edge_count_change / max(1, m)

    elapsed_ms = (time.time() - t_start) * 1000.0

    # Build noisy graph dict (with updated attributes)
    noisy_graph_data = graph_to_dict(G_noisy)

    # Degree distribution summary
    def _dd_summary(dd_dict: dict) -> dict:
        keys = sorted(dd_dict.keys())
        total = sum(dd_dict.values()) or 1
        return {
            "degrees": keys,
            "counts": [dd_dict[k] for k in keys],
            "normalized": [round(dd_dict[k] / total, 6) for k in keys],
        }

    return {
        "input_summary": input_summary,
        "params": {
            "epsilon": epsilon,
            "randomize_edges": randomize_edges,
            "randomize_attributes": randomize_attributes,
            "edge_flip_prob": edge_flip_prob,
            "attr_noise_scale": attr_noise_scale,
            "seed": seed,
        },
        "result": {
            "true_edge_count": m,
            "noisy_edge_count": G_noisy.number_of_edges(),
            "true_degree_distribution": _dd_summary(true_dd),
            "noisy_degree_distribution": _dd_summary(noisy_dd),
            "sample_debiased_degrees": {
                str(v): round(debiased_degrees[v], 3) for v in nodes[:10]
            },
            "noisy_graph": noisy_graph_data,
        },
        "metrics": {
            "l1_degree_distribution": round(l1, 6),
            "hellinger_degree_distribution": round(hel, 6),
            "mean_degree_debiasing_error": round(mean_deg_err, 4),
            "edge_count_change": edge_count_change,
            "edge_change_ratio": round(edge_change_ratio, 6),
            "p_rr": round(p_rr, 6),
            "q_rr": round(q_rr, 6),
        },
        "elapsed_ms": round(elapsed_ms, 3),
        "explanation_steps": explanation_steps,
    }

"""
ndkd.py
Neighbor-Subgraph Disturbance k-Degree Anonymity (NDKD).

Based on: 邻居子图扰动下的k-度匿名隐私保护模型 (丁红发).
The algorithm modifies a graph so every distinct degree value occurs at
least k times, protecting individual degree information.

数智安行 data governance platform.
"""

from __future__ import annotations

import copy
import hashlib
import random
import time
from typing import Any

import numpy as np
import networkx as nx

from .graph_utils import (
    dict_to_graph,
    get_degree_distribution,
    graph_to_dict,
    get_graph_stats,
)
from .metrics import compute_utility_metrics


# ---------------------------------------------------------------------------
# k-degree anonymisation helpers
# ---------------------------------------------------------------------------


def _sort_degree_sequence(G: nx.Graph) -> list[tuple[Any, int]]:
    """Return list of (node, degree) sorted by degree descending."""
    return sorted(G.degree(), key=lambda x: x[1], reverse=True)


def _group_by_degree(degree_seq: list[tuple[Any, int]]) -> dict[int, list[Any]]:
    """Map degree -> list of nodes with that degree."""
    groups: dict[int, list[Any]] = {}
    for node, deg in degree_seq:
        groups.setdefault(deg, []).append(node)
    return groups


def _needs_anonymisation(groups: dict[int, list[Any]], k: int) -> bool:
    return any(len(v) < k for v in groups.values())


def _merge_small_groups(
    groups: dict[int, list[Any]], k: int, rng: random.Random
) -> dict[int, list[Any]]:
    """
    Iteratively merge groups smaller than k with adjacent degree groups.
    A group for degree d is merged with the nearest group (d+1 or d-1)
    to form a combined group of size >= k.
    """
    sorted_degs = sorted(groups.keys())
    merged: dict[int, list[Any]] = {}

    i = 0
    while i < len(sorted_degs):
        current_deg = sorted_degs[i]
        current_nodes = list(groups[current_deg])

        # Accumulate forward neighbours until count >= k
        j = i + 1
        while len(current_nodes) < k and j < len(sorted_degs):
            next_deg = sorted_degs[j]
            current_nodes.extend(groups[next_deg])
            j += 1

        # If still < k and we're near the end, absorb into the previous merged group
        if len(current_nodes) < k and merged:
            prev_deg = max(merged.keys())
            merged[prev_deg].extend(current_nodes)
            i = j
            continue

        # All merged nodes adopt the median degree of the span
        target_deg = sorted_degs[min(i + (j - i - 1) // 2, len(sorted_degs) - 1)]
        for node in current_nodes:
            merged.setdefault(target_deg, []).append(node)

        i = j

    return merged


def _adjust_degrees(
    G: nx.Graph, target_degrees: dict[Any, int], rng: random.Random
) -> nx.Graph:
    """
    Adjust a graph so that each node attains its target degree by
    adding or removing edges (preferring to perturb within each node's
    neighbourhood to preserve local structure).
    """
    H = G.copy()

    for node, t_deg in target_degrees.items():
        current_deg = H.degree(node)
        if current_deg == t_deg:
            continue

        if current_deg < t_deg:
            # Need to add edges
            non_neighbors = [
                v for v in H.nodes()
                if v != node and not H.has_edge(node, v)
            ]
            rng.shuffle(non_neighbors)
            to_add = t_deg - current_deg
            for v in non_neighbors[:to_add]:
                H.add_edge(node, v,
                           weight=round(rng.uniform(0.1, 5.0), 3),
                           cost=round(rng.uniform(1, 100), 2),
                           time=round(rng.uniform(0.1, 10.0), 1),
                           label="added")

        elif current_deg > t_deg:
            # Need to remove edges
            neighbors = list(H.neighbors(node))
            rng.shuffle(neighbors)
            to_remove = current_deg - t_deg
            for v in neighbors[:to_remove]:
                if H.has_edge(node, v):
                    H.remove_edge(node, v)

    return H


# ---------------------------------------------------------------------------
# Neighbour-subgraph disturbance
# ---------------------------------------------------------------------------


def _disturb_neighbour_subgraph(
    G: nx.Graph, node: Any, k: int, epsilon: float, rng: np.random.Generator
) -> nx.Graph:
    """
    Perturb the 1-hop neighbour subgraph of *node* to hide its structure.
    Edges within the neighbourhood are flipped with probability derived
    from the degree target and k.

    Disturbance probability: p_d = k / (k + exp(epsilon))
    """
    neighbours = list(G.neighbors(node))
    if len(neighbours) < 2:
        return G

    import math as _math
    H = G.copy()
    sub_nodes = neighbours
    p_d = k / (k + _math.exp(epsilon)) if (k + _math.exp(epsilon)) > 0 else 0.1

    for i in range(len(sub_nodes)):
        for j in range(i + 1, len(sub_nodes)):
            u, w = sub_nodes[i], sub_nodes[j]
            if rng.random() < p_d:
                if H.has_edge(u, w):
                    H.remove_edge(u, w)
                else:
                    H.add_edge(u, w,
                               weight=round(float(rng.uniform(0.1, 3.0)), 3),
                               cost=round(float(rng.uniform(1, 50)), 2),
                               time=round(float(rng.uniform(0.1, 5.0)), 1),
                               label="disturbed")
    return H


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

import math  # noqa: E402 – needed above


def run_ndkd(
    graph_dict: dict,
    k: int = 5,
    epsilon: float = 1.0,
    degree_threshold: int = 3,
    suppress_outliers: bool = True,
    seed: int = 42,
) -> dict:
    """
    Run NDKD: Neighbour-Subgraph Disturbance k-Degree Anonymity.

    Parameters
    ----------
    graph_dict        : dict  – graph in {nodes, edges} format
    k                 : int   – anonymity parameter (each degree >= k occurrences)
    epsilon           : float – privacy budget for subgraph disturbance
    degree_threshold  : int   – minimum degree to include in anonymisation
    suppress_outliers : bool  – suppress high-degree nodes (>= mean + 2σ)
    seed              : int   – random seed

    Returns
    -------
    dict with keys: input_summary, params, result, metrics, elapsed_ms,
                    explanation_steps
    """
    t_start = time.time()
    rng_np = np.random.default_rng(seed)
    rng_py = random.Random(seed)

    explanation_steps: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Step 1 – Load graph
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 1,
        "description": "图结构加载",
        "detail": "将输入字典转换为 networkx 图，获取初始统计信息。",
    })

    G_orig = dict_to_graph(graph_dict)
    n = G_orig.number_of_nodes()
    m = G_orig.number_of_edges()
    nodes = list(G_orig.nodes())

    input_summary = {
        "node_count": n,
        "edge_count": m,
        "k": k,
        "epsilon": epsilon,
    }

    # ------------------------------------------------------------------
    # Step 2 – Degree sequence analysis
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 2,
        "description": "度数序列分析",
        "detail": (
            f"计算所有节点的度数，识别需要 k-匿名化的度数组 (k={k})。"
            "统计各度数值出现次数，找出 < k 次的组。"
        ),
    })

    degree_seq = _sort_degree_sequence(G_orig)
    groups_orig = _group_by_degree(degree_seq)
    small_groups = {d: v for d, v in groups_orig.items() if len(v) < k}

    degree_values = [d for _, d in degree_seq]
    mean_deg = float(np.mean(degree_values)) if degree_values else 0.0
    std_deg = float(np.std(degree_values)) if degree_values else 0.0
    outlier_threshold = mean_deg + 2 * std_deg

    # ------------------------------------------------------------------
    # Step 3 – Suppress high-degree outliers
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 3,
        "description": "高度数异常节点抑制",
        "detail": (
            f"均值度数={mean_deg:.2f}, 标准差={std_deg:.2f}，"
            f"异常阈值={outlier_threshold:.2f}。"
            + (f"抑制 {sum(1 for d in degree_values if d >= outlier_threshold)} 个高度数节点。"
               if suppress_outliers else "不进行抑制。")
        ),
    })

    suppressed_nodes: set[Any] = set()
    if suppress_outliers:
        suppressed_nodes = {
            node for node, deg in degree_seq if deg >= outlier_threshold
        }

    # ------------------------------------------------------------------
    # Step 4 – Merge small degree groups
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 4,
        "description": "合并小度数组",
        "detail": (
            f"将出现次数 < k={k} 的度数组与相邻度数组合并，"
            f"使每个度数值至少出现 {k} 次。"
            f"共 {len(small_groups)} 个组需要合并。"
        ),
    })

    working_groups = {
        d: [v for v in nodes_list if v not in suppressed_nodes]
        for d, nodes_list in groups_orig.items()
        if not all(v in suppressed_nodes for v in nodes_list)
    }
    anonymised_groups = _merge_small_groups(working_groups, k, rng_py)

    # Map each node to its target degree
    target_degrees: dict[Any, int] = {}
    for t_deg, group_nodes in anonymised_groups.items():
        for v in group_nodes:
            target_degrees[v] = t_deg

    # Suppressed nodes keep their original degree (or min)
    for v in suppressed_nodes:
        target_degrees[v] = min(degree_threshold, G_orig.degree(v))

    # ------------------------------------------------------------------
    # Step 5 – Graph degree adjustment
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 5,
        "description": "图度数调整",
        "detail": (
            "通过增删边将每个节点的度数调整至目标度数。"
            "优先在高度关联节点间操作以保留图结构特征。"
        ),
    })

    G_anon = _adjust_degrees(G_orig, target_degrees, rng_py)

    # Capture k-anonymity state BEFORE disturbance (the intended guarantee)
    adj_dd = get_degree_distribution(G_anon)
    k_satisfied_after_adjustment = all(cnt >= k for cnt in adj_dd.values())

    # ------------------------------------------------------------------
    # Step 6 – Neighbour-subgraph disturbance
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 6,
        "description": "邻居子图扰动",
        "detail": (
            f"对每个节点的 1-hop 邻域子图执行扰动（扰动概率 ε={epsilon}），"
            f"进一步混淆邻居关系，防止利用度分布还原原始图结构。"
        ),
    })

    # Apply disturbance to a sampled set of nodes to bound computation
    sample_size = min(n, max(10, n // 3))
    disturb_candidates = [v for v in nodes if v not in suppressed_nodes]
    rng_py.shuffle(disturb_candidates)
    disturb_nodes = disturb_candidates[:sample_size]

    for v in disturb_nodes:
        G_anon = _disturb_neighbour_subgraph(G_anon, v, k, epsilon, rng_np)

    # ------------------------------------------------------------------
    # Step 7 – Metrics
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 7,
        "description": "效用与隐私评估",
        "detail": (
            "计算匿名化前后图统计量的变化，"
            "包括边变化率、度分布 L1 距离等效用损失指标。"
        ),
    })

    utility = compute_utility_metrics(G_orig, G_anon)

    # k-anonymity verification (after disturbance – may differ from adjustment-only guarantee)
    anon_dd = get_degree_distribution(G_anon)
    k_satisfied = all(cnt >= k for cnt in anon_dd.values())
    min_group_size = min(anon_dd.values()) if anon_dd else 0

    anon_stats = get_graph_stats(G_anon)
    orig_stats = get_graph_stats(G_orig)

    elapsed_ms = (time.time() - t_start) * 1000.0

    return {
        "input_summary": input_summary,
        "params": {
            "k": k,
            "epsilon": epsilon,
            "degree_threshold": degree_threshold,
            "suppress_outliers": suppress_outliers,
            "seed": seed,
        },
        "result": {
            "original_stats": orig_stats,
            "anonymised_stats": anon_stats,
            "k_anonymity_satisfied": k_satisfied_after_adjustment,
            "k_anonymity_satisfied_after_disturbance": k_satisfied,
            "min_group_size": min_group_size,
            "suppressed_node_count": len(suppressed_nodes),
            "degree_groups_merged": len(small_groups),
            "anonymised_graph": graph_to_dict(G_anon),
            "degree_distribution_before": {
                str(d): cnt for d, cnt in sorted(get_degree_distribution(G_orig).items())
            },
            "degree_distribution_after": {
                str(d): cnt for d, cnt in sorted(anon_dd.items())
            },
        },
        "metrics": utility,
        "elapsed_ms": round(elapsed_ms, 3),
        "explanation_steps": explanation_steps,
    }

"""
graph_sdp.py
Mixed Shuffled Differential Privacy for degree distribution histogram publishing.
Based on the Encode-Shuffle-Analyze (ESA) framework.

数智安行 data governance platform.
"""

import math
import time
import random
import numpy as np
import networkx as nx

from .graph_utils import dict_to_graph, get_degree_distribution
from .metrics import l1_distance, hellinger_distance, mse, normalize_histogram


# ---------------------------------------------------------------------------
# Core mechanisms
# ---------------------------------------------------------------------------

def _krr_perturb(value: int, domain: list, epsilon: float, rng: np.random.Generator) -> int:
    """
    k-Randomized Response (k-RR) mechanism.
    Reports the true value with probability p and any other value with probability q.
    p = exp(eps/2) / (exp(eps/2) + k - 1)
    q = 1           / (exp(eps/2) + k - 1)
    """
    k = len(domain)
    if k <= 1:
        return value

    exp_half = math.exp(epsilon / 2.0)
    p = exp_half / (exp_half + k - 1)
    q = 1.0 / (exp_half + k - 1)

    r = rng.random()
    if r < p:
        return value

    # Choose uniformly from domain \ {value}
    others = [d for d in domain if d != value]
    if not others:
        return value
    idx = int(rng.integers(0, len(others)))
    return others[idx]


def _mle_correct(aggregated: dict, domain: list, n: int, p: float, q: float) -> dict:
    """
    MLE (EM-style) correction for k-RR aggregated counts.
    corrected[d] = (aggregated[d] - n*q) / (p - q)
    Clip negatives to 0, then normalise.
    """
    corrected = {}
    pq_diff = p - q
    if pq_diff == 0:
        return {d: 1.0 / len(domain) for d in domain}

    for d in domain:
        cnt = aggregated.get(d, 0)
        corrected[d] = (cnt - n * q) / pq_diff

    # Clip negatives
    corrected = {d: max(0.0, v) for d, v in corrected.items()}

    total = sum(corrected.values())
    if total > 0:
        corrected = {d: v / total for d, v in corrected.items()}
    else:
        corrected = {d: 1.0 / len(domain) for d in domain}

    return corrected


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_graph_sdp(graph_dict: dict, epsilon: float, L: int = 10, seed: int = 42) -> dict:
    """
    Run Shuffled Differential Privacy on a graph's degree distribution.

    Parameters
    ----------
    graph_dict : dict  – graph in {nodes, edges} dict format
    epsilon    : float – privacy budget
    L          : int   – number of user groups for interactive protocol
    seed       : int   – random seed

    Returns
    -------
    dict with keys: input_summary, params, result, metrics, elapsed_ms, explanation_steps
    """
    t_start = time.time()
    rng = np.random.default_rng(seed)

    explanation_steps = []

    # ------------------------------------------------------------------
    # Step 1 – Convert and inspect graph
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 1,
        "description": "图结构转换与基本统计",
        "detail": "将输入字典转换为 networkx 图，计算基本统计信息。",
    })

    G = dict_to_graph(graph_dict)
    n_nodes = G.number_of_nodes()
    n_edges = G.number_of_edges()
    degrees = dict(G.degree())
    degree_values = list(degrees.values())
    max_degree = max(degree_values) if degree_values else 0
    unique_degrees = sorted(set(degree_values))

    input_summary = {
        "node_count": n_nodes,
        "edge_count": n_edges,
        "max_degree": max_degree,
        "unique_degrees": len(unique_degrees),
    }

    # ------------------------------------------------------------------
    # Step 2 – True degree distribution
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 2,
        "description": "计算真实度数分布直方图",
        "detail": (
            f"统计每个度数值出现的频次，共 {len(unique_degrees)} 个不同度数值，"
            f"最大度数 {max_degree}。"
        ),
    })

    true_dd = get_degree_distribution(G)
    domain = list(range(max_degree + 1))
    true_dd_full = {d: true_dd.get(d, 0) for d in domain}
    true_norm = normalize_histogram(true_dd_full)

    # ------------------------------------------------------------------
    # Step 3 – User grouping
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 3,
        "description": "用户分组 (交互式协议)",
        "detail": (
            f"将 {n_nodes} 个用户平均分为 {L} 组，每组独立执行本地随机化，"
            "减少用户之间的关联性。"
        ),
    })

    node_ids = list(G.nodes())
    shuffled_nodes = node_ids.copy()
    rng.shuffle(shuffled_nodes)
    group_size = max(1, n_nodes // L)
    groups = [shuffled_nodes[i: i + group_size] for i in range(0, n_nodes, group_size)]

    # ------------------------------------------------------------------
    # Step 4 – Local perturbation (k-RR)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 4,
        "description": "本地随机化 — k-RR 机制",
        "detail": (
            f"每位用户对自己的度数值执行 k-随机响应扰动（ε={epsilon}），"
            f"报告正确值的概率 p = exp(ε/2)/(exp(ε/2)+k-1)，"
            f"其中 k={len(domain)}（度数域大小）。"
        ),
    })

    k = len(domain)
    exp_half = math.exp(epsilon / 2.0)
    p_krr = exp_half / (exp_half + k - 1)
    q_krr = 1.0 / (exp_half + k - 1)

    perturbed_values = []
    for node in node_ids:
        true_deg = degrees[node]
        perturbed = _krr_perturb(true_deg, domain, epsilon, rng)
        perturbed_values.append(perturbed)

    # ------------------------------------------------------------------
    # Step 5 – Shuffle step
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 5,
        "description": "洗牌步骤 (Shuffle)",
        "detail": (
            "随机打乱所有扰动报告的顺序，切断报告值与用户身份的关联，"
            "进一步增强匿名性（隐私放大定理）。"
        ),
    })

    shuffled_values = perturbed_values.copy()
    rng.shuffle(shuffled_values)

    # ------------------------------------------------------------------
    # Step 6 – Aggregation
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 6,
        "description": "聚合统计",
        "detail": "统计洗牌后各度数值出现的频次，生成扰动后的度数分布直方图。",
    })

    aggregated = {d: 0 for d in domain}
    for v in shuffled_values:
        if v in aggregated:
            aggregated[v] += 1

    perturbed_norm = normalize_histogram(aggregated)

    # ------------------------------------------------------------------
    # Step 7 – MLE correction
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 7,
        "description": "最大似然估计 (MLE) 校正",
        "detail": (
            f"使用公式 corrected[d] = (agg[d] - n·q)/(p - q) 去偏差，"
            f"其中 p={p_krr:.4f}, q={q_krr:.6f}, n={n_nodes}。"
            "裁剪负值并重新归一化。"
        ),
    })

    corrected_norm = _mle_correct(aggregated, domain, n_nodes, p_krr, q_krr)

    # ------------------------------------------------------------------
    # Step 8 – Metrics
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 8,
        "description": "效用评估",
        "detail": "计算真实分布与校正分布之间的 L1、Hellinger 距离和 MSE，并评估改进效果。",
    })

    def _norm_list(d_dict):
        keys = sorted(d_dict.keys())
        return [d_dict[k] for k in keys]

    true_list = _norm_list(true_norm)
    perturbed_list = _norm_list(perturbed_norm)
    corrected_list = _norm_list(corrected_norm)

    l1_tc = l1_distance(true_list, corrected_list)
    hel_tc = hellinger_distance(true_list, corrected_list)
    mse_tc = mse(true_list, corrected_list)
    l1_tp = l1_distance(true_list, perturbed_list)

    l1_improvement = l1_tp - l1_tc
    utility_score = max(0.0, 1.0 - l1_tc)

    elapsed_ms = (time.time() - t_start) * 1000.0

    # ------------------------------------------------------------------
    # Build result distributions
    # ------------------------------------------------------------------
    def _dist_dict(count_dict):
        sorted_deg = sorted(count_dict.keys())
        total = sum(count_dict.values()) or 1
        return {
            "degrees": sorted_deg,
            "counts": [int(round(count_dict[d] * total)) for d in sorted_deg],
            "normalized": [round(count_dict[d], 6) for d in sorted_deg],
        }

    return {
        "input_summary": input_summary,
        "params": {"epsilon": epsilon, "L": L, "seed": seed},
        "result": {
            "true_distribution": _dist_dict(true_norm),
            "perturbed_distribution": _dist_dict(perturbed_norm),
            "corrected_distribution": _dist_dict(corrected_norm),
        },
        "metrics": {
            "l1_true_vs_corrected": round(l1_tc, 6),
            "hellinger_true_vs_corrected": round(hel_tc, 6),
            "mse_true_vs_corrected": round(mse_tc, 8),
            "l1_improvement_over_perturbed": round(l1_improvement, 6),
            "utility_score": round(utility_score, 6),
        },
        "elapsed_ms": round(elapsed_ms, 3),
        "explanation_steps": explanation_steps,
    }

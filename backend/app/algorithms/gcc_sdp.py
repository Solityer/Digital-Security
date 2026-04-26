"""
gcc_sdp.py
Clustering Coefficient Privacy Publishing using Differential Privacy.

数智安行 data governance platform.
"""

import time
import math
import numpy as np
import networkx as nx

from .graph_utils import dict_to_graph, get_clustering_coefficients
from .metrics import clustering_coefficient_delta


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _laplace_noise(sensitivity: float, epsilon: float, rng: np.random.Generator) -> float:
    """Draw a single Laplace noise sample with given sensitivity and epsilon."""
    scale = sensitivity / max(epsilon, 1e-9)
    return float(rng.laplace(0.0, scale))


def _count_wedges(G: nx.Graph) -> dict:
    """
    For each node v, wedge_count[v] = C(deg(v), 2) = deg*(deg-1)/2.
    A wedge is an open triad (path of length 2) centred on v.
    """
    return {v: (G.degree(v) * (G.degree(v) - 1)) // 2 for v in G.nodes()}


def _perturb_local_subgraph(G: nx.Graph, node: int, epsilon: float,
                             rng: np.random.Generator) -> nx.Graph:
    """
    Perturb the 1-hop neighbourhood subgraph of *node* using edge-flip
    probabilities derived from epsilon to produce a noisy local clustering
    coefficient.

    Each pair (u, w) in N(node) is toggled independently:
      – existing edge removed with probability p_flip
      – missing edge added    with probability p_flip
    where p_flip = 1 / (1 + exp(epsilon)).
    """
    neighbours = list(G.neighbors(node))
    sub = G.subgraph(neighbours).copy()

    p_flip = 1.0 / (1.0 + math.exp(epsilon))

    # Iterate over all pairs within the neighbourhood
    for i in range(len(neighbours)):
        for j in range(i + 1, len(neighbours)):
            u, w = neighbours[i], neighbours[j]
            if rng.random() < p_flip:
                if sub.has_edge(u, w):
                    sub.remove_edge(u, w)
                else:
                    sub.add_edge(u, w)

    return sub


def _local_clustering_from_sub(sub: nx.Graph, node_degree: int) -> float:
    """
    Compute local clustering coefficient from a node's perturbed subgraph.
    cc = actual_edges / possible_edges  where possible = deg*(deg-1)/2.
    """
    possible = node_degree * (node_degree - 1) / 2.0
    if possible <= 0:
        return 0.0
    actual = sub.number_of_edges()
    return min(1.0, actual / possible)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_gcc_sdp(graph_dict: dict, epsilon: float, seed: int = 42) -> dict:
    """
    Run differential-privacy-based clustering coefficient publishing.

    Parameters
    ----------
    graph_dict : dict  – graph in {nodes, edges} format
    epsilon    : float – privacy budget (ε)
    seed       : int   – random seed

    Returns
    -------
    dict with keys: input_summary, params, result, metrics, elapsed_ms, explanation_steps
    """
    t_start = time.time()
    rng = np.random.default_rng(seed)

    explanation_steps = []

    # ------------------------------------------------------------------
    # Step 1 – Convert graph
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 1,
        "description": "图结构转换",
        "detail": "将输入字典转换为 networkx 图对象，准备后续计算。",
    })

    G = dict_to_graph(graph_dict)
    n_nodes = G.number_of_nodes()
    n_edges = G.number_of_edges()

    input_summary = {
        "node_count": n_nodes,
        "edge_count": n_edges,
    }

    # ------------------------------------------------------------------
    # Step 2 – True clustering coefficients
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 2,
        "description": "计算真实聚类系数",
        "detail": "计算图的全局聚类系数及每个节点的局部聚类系数分布。",
    })

    true_cc_info = get_clustering_coefficients(G)
    true_global_cc = true_cc_info["mean"]
    true_per_node = nx.clustering(G)

    # True global CC via closed-triad / wedge formula
    total_triangles = sum(nx.triangles(G).values()) / 3.0
    wedges_per_node = _count_wedges(G)
    total_wedges = sum(wedges_per_node.values())
    true_global_cc_triad = (3.0 * total_triangles / total_wedges) if total_wedges > 0 else 0.0

    # ------------------------------------------------------------------
    # Step 3 – Wedge counting
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 3,
        "description": "统计楔形 (开放三元组)",
        "detail": (
            f"每个节点 v 的楔形数 = C(deg(v),2) = deg*(deg-1)/2。"
            f"全图共 {int(total_wedges)} 个楔形，{int(total_triangles)} 个三角形。"
        ),
    })

    # ------------------------------------------------------------------
    # Step 4 – Noisy global clustering coefficient (Laplace mechanism)
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 4,
        "description": "全局聚类系数扰动 (Laplace 机制)",
        "detail": (
            f"敏感度=1.0，ε={epsilon}，"
            f"噪声尺度 b=sensitivity/ε={1.0/max(epsilon,1e-9):.4f}。"
            "每个节点对全局聚类系数的贡献加入 Laplace 噪声。"
        ),
    })

    sensitivity = 1.0
    noisy_contributions = []
    for v in G.nodes():
        local_cc = true_per_node.get(v, 0.0)
        noise = _laplace_noise(sensitivity, epsilon, rng)
        noisy_contributions.append(np.clip(local_cc + noise, 0.0, 1.0))

    noisy_global_cc = float(np.mean(noisy_contributions)) if noisy_contributions else 0.0
    noise_magnitude = float(np.std(noisy_contributions))

    # ------------------------------------------------------------------
    # Step 5 – Local clustering coefficient via subgraph perturbation
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 5,
        "description": "局部子图扰动 (节点级聚类系数)",
        "detail": (
            "对每个节点的 1-hop 邻域子图执行边翻转扰动，"
            f"翻转概率 p_flip = 1/(1+exp(ε)) = {1/(1+math.exp(epsilon)):.4f}。"
            "重新计算扰动后的局部聚类系数。"
        ),
    })

    perturbed_per_node = {}
    for v in G.nodes():
        deg_v = G.degree(v)
        if deg_v < 2:
            perturbed_per_node[v] = 0.0
            continue
        sub = _perturb_local_subgraph(G, v, epsilon, rng)
        perturbed_per_node[v] = _local_clustering_from_sub(sub, deg_v)

    perturbed_global_cc = float(np.mean(list(perturbed_per_node.values()))) if perturbed_per_node else 0.0

    # ------------------------------------------------------------------
    # Step 6 – Compute metrics
    # ------------------------------------------------------------------
    explanation_steps.append({
        "step": 6,
        "description": "效用评估",
        "detail": "计算扰动前后聚类系数的绝对误差与相对误差。",
    })

    abs_delta_noisy = abs(noisy_global_cc - true_global_cc)
    rel_delta_noisy = abs_delta_noisy / true_global_cc if true_global_cc > 0 else 0.0

    abs_delta_sub = abs(perturbed_global_cc - true_global_cc)
    rel_delta_sub = abs_delta_sub / true_global_cc if true_global_cc > 0 else 0.0

    # Per-node distribution summary
    true_vals = list(true_per_node.values())
    perturbed_vals = list(perturbed_per_node.values())
    per_node_mse = float(np.mean((np.array(true_vals) - np.array(perturbed_vals)) ** 2)) if true_vals else 0.0

    elapsed_ms = (time.time() - t_start) * 1000.0

    return {
        "input_summary": input_summary,
        "params": {"epsilon": epsilon, "seed": seed},
        "result": {
            "true_global_cc": round(true_global_cc, 6),
            "true_global_cc_triad_formula": round(true_global_cc_triad, 6),
            "noisy_global_cc_laplace": round(noisy_global_cc, 6),
            "perturbed_global_cc_subgraph": round(perturbed_global_cc, 6),
            "total_wedges": int(total_wedges),
            "total_triangles": int(total_triangles),
            "per_node_cc_sample": {
                str(v): round(true_per_node[v], 4)
                for v in list(G.nodes())[:10]
            },
            "per_node_perturbed_sample": {
                str(v): round(perturbed_per_node[v], 4)
                for v in list(G.nodes())[:10]
            },
        },
        "metrics": {
            "laplace_noise_absolute_delta": round(abs_delta_noisy, 6),
            "laplace_noise_relative_delta": round(rel_delta_noisy, 6),
            "subgraph_absolute_delta": round(abs_delta_sub, 6),
            "subgraph_relative_delta": round(rel_delta_sub, 6),
            "noise_magnitude_std": round(noise_magnitude, 6),
            "per_node_mse": round(per_node_mse, 8),
            "noise_scale": round(sensitivity / max(epsilon, 1e-9), 6),
        },
        "elapsed_ms": round(elapsed_ms, 3),
        "explanation_steps": explanation_steps,
    }

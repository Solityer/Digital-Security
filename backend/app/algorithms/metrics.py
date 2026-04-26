"""
metrics.py
Statistical utility and privacy metrics for the 数智安行 data governance platform.
"""

import math
import numpy as np
import networkx as nx

from .graph_utils import get_degree_distribution, get_clustering_coefficients, get_triangle_count


# ---------------------------------------------------------------------------
# Basic distance metrics
# ---------------------------------------------------------------------------

def _to_array_pair(p, q):
    """
    Normalise p and q to aligned numpy arrays.
    p and q may be dicts (histogram) or array-like.
    Returns (p_arr, q_arr) as numpy float64 arrays of the same length.
    """
    if isinstance(p, dict) and isinstance(q, dict):
        keys = sorted(set(p.keys()) | set(q.keys()))
        p_arr = np.array([p.get(k, 0.0) for k in keys], dtype=np.float64)
        q_arr = np.array([q.get(k, 0.0) for k in keys], dtype=np.float64)
    else:
        p_arr = np.asarray(p, dtype=np.float64).ravel()
        q_arr = np.asarray(q, dtype=np.float64).ravel()
        min_len = min(len(p_arr), len(q_arr))
        p_arr = p_arr[:min_len]
        q_arr = q_arr[:min_len]
    return p_arr, q_arr


def l1_distance(p, q) -> float:
    """
    L1 (Manhattan) distance between two normalized histograms.
    p, q can be dicts mapping value→frequency, or array-like.
    Returns sum of |p_i - q_i|.
    """
    p_arr, q_arr = _to_array_pair(p, q)
    # Normalize
    p_sum = p_arr.sum()
    q_sum = q_arr.sum()
    if p_sum > 0:
        p_arr = p_arr / p_sum
    if q_sum > 0:
        q_arr = q_arr / q_sum
    return float(np.sum(np.abs(p_arr - q_arr)))


def hellinger_distance(p, q) -> float:
    """
    Hellinger distance between two probability distributions.
    H(p, q) = sqrt(0.5 * sum((sqrt(p_i) - sqrt(q_i))^2))
    """
    p_arr, q_arr = _to_array_pair(p, q)
    p_sum = p_arr.sum()
    q_sum = q_arr.sum()
    if p_sum > 0:
        p_arr = p_arr / p_sum
    if q_sum > 0:
        q_arr = q_arr / q_sum
    p_arr = np.clip(p_arr, 0.0, None)
    q_arr = np.clip(q_arr, 0.0, None)
    diff = np.sqrt(p_arr) - np.sqrt(q_arr)
    return float(np.sqrt(0.5 * np.sum(diff ** 2)))


def mse(true_vals, pred_vals) -> float:
    """
    Mean Squared Error between two arrays or dicts.
    """
    t_arr, p_arr = _to_array_pair(true_vals, pred_vals)
    if len(t_arr) == 0:
        return 0.0
    return float(np.mean((t_arr - p_arr) ** 2))


# ---------------------------------------------------------------------------
# Graph-level metrics
# ---------------------------------------------------------------------------

def edge_change_ratio(G_orig: nx.Graph, G_anon: nx.Graph) -> float:
    """
    Symmetric edge change ratio: |E_orig △ E_anon| / |E_orig|.
    Returns 0.0 when G_orig has no edges.
    """
    edges_orig = set(frozenset(e) for e in G_orig.edges())
    edges_anon = set(frozenset(e) for e in G_anon.edges())
    symmetric_diff = len(edges_orig.symmetric_difference(edges_anon))
    if len(edges_orig) == 0:
        return 0.0
    return float(symmetric_diff / len(edges_orig))


def degree_distribution_delta(G_orig: nx.Graph, G_anon: nx.Graph) -> dict:
    """
    Compare degree distributions between original and anonymized graphs.
    Returns dict with l1, hellinger, mse.
    """
    dd_orig = get_degree_distribution(G_orig)
    dd_anon = get_degree_distribution(G_anon)

    # Align on shared key space
    all_degrees = sorted(set(dd_orig.keys()) | set(dd_anon.keys()))
    orig_counts = np.array([dd_orig.get(d, 0) for d in all_degrees], dtype=np.float64)
    anon_counts = np.array([dd_anon.get(d, 0) for d in all_degrees], dtype=np.float64)

    n_orig = orig_counts.sum() or 1.0
    n_anon = anon_counts.sum() or 1.0
    orig_norm = orig_counts / n_orig
    anon_norm = anon_counts / n_anon

    return {
        "l1": float(np.sum(np.abs(orig_norm - anon_norm))),
        "hellinger": hellinger_distance(orig_norm, anon_norm),
        "mse": float(np.mean((orig_norm - anon_norm) ** 2)),
    }


def clustering_coefficient_delta(G_orig: nx.Graph, G_anon: nx.Graph) -> dict:
    """
    Compare mean clustering coefficients between original and anonymized graphs.
    """
    cc_orig = get_clustering_coefficients(G_orig)["mean"]
    cc_anon = get_clustering_coefficients(G_anon)["mean"]
    absolute_change = abs(cc_anon - cc_orig)
    relative_change = absolute_change / cc_orig if cc_orig > 0 else 0.0
    return {
        "absolute_change": round(absolute_change, 6),
        "relative_change": round(relative_change, 6),
        "original": round(cc_orig, 6),
        "anonymized": round(cc_anon, 6),
    }


def triangle_count_delta(G_orig: nx.Graph, G_anon: nx.Graph) -> dict:
    """
    Compare triangle counts between original and anonymized graphs.
    """
    tc_orig = get_triangle_count(G_orig)
    tc_anon = get_triangle_count(G_anon)
    absolute_change = abs(tc_anon - tc_orig)
    relative_change = absolute_change / tc_orig if tc_orig > 0 else 0.0
    return {
        "absolute_change": absolute_change,
        "relative_change": round(relative_change, 6),
        "original": tc_orig,
        "anonymized": tc_anon,
    }


# ---------------------------------------------------------------------------
# Histogram utilities
# ---------------------------------------------------------------------------

def normalize_histogram(hist_dict: dict) -> dict:
    """
    Return a normalized copy of a histogram dict (values sum to 1.0).
    """
    total = sum(hist_dict.values())
    if total == 0:
        return {k: 0.0 for k in hist_dict}
    return {k: v / total for k, v in hist_dict.items()}


# ---------------------------------------------------------------------------
# Composite utility metric
# ---------------------------------------------------------------------------

def compute_utility_metrics(G_orig: nx.Graph, G_anon: nx.Graph) -> dict:
    """
    Compute all utility metrics comparing G_orig to G_anon.
    Returns a comprehensive dict with all metric values.
    """
    ecr = edge_change_ratio(G_orig, G_anon)
    dd_delta = degree_distribution_delta(G_orig, G_anon)
    cc_delta = clustering_coefficient_delta(G_orig, G_anon)
    tc_delta = triangle_count_delta(G_orig, G_anon)

    # Composite utility score: 1 - weighted average of normalized losses
    utility_score = max(0.0, 1.0 - (
        0.3 * ecr
        + 0.3 * dd_delta["l1"]
        + 0.2 * cc_delta["relative_change"]
        + 0.2 * min(tc_delta["relative_change"], 1.0)
    ))

    return {
        "edge_change_ratio": round(ecr, 6),
        "degree_distribution": {
            "l1": round(dd_delta["l1"], 6),
            "hellinger": round(dd_delta["hellinger"], 6),
            "mse": round(dd_delta["mse"], 8),
        },
        "clustering_coefficient": {
            "absolute_change": cc_delta["absolute_change"],
            "relative_change": cc_delta["relative_change"],
            "original": cc_delta["original"],
            "anonymized": cc_delta["anonymized"],
        },
        "triangle_count": {
            "absolute_change": tc_delta["absolute_change"],
            "relative_change": tc_delta["relative_change"],
            "original": tc_delta["original"],
            "anonymized": tc_delta["anonymized"],
        },
        "utility_score": round(utility_score, 6),
    }

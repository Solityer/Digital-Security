"""
graph_utils.py
Utilities for graph generation and analysis for the 数智安行 data governance platform.
"""

import math
import random
import networkx as nx
import numpy as np


# ---------------------------------------------------------------------------
# Graph generators
# ---------------------------------------------------------------------------

def generate_financial_graph(seed: int = 42) -> nx.Graph:
    """
    Generate a synthetic financial network with 50 nodes.
    Node types: user, account, merchant.
    Edge attributes: weight, cost, time, label.
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    G = nx.Graph()

    node_types = (
        [(i, "user") for i in range(20)]
        + [(i + 20, "account") for i in range(15)]
        + [(i + 35, "merchant") for i in range(15)]
    )

    type_labels = {
        "user": ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace",
                 "Hank", "Iris", "Jack", "Karen", "Leo", "Mia", "Ned",
                 "Olivia", "Pete", "Quinn", "Rose", "Sam", "Tina"],
        "account": [f"ACC-{1000 + i}" for i in range(15)],
        "merchant": [f"MRC-{200 + i}" for i in range(15)],
    }
    type_counters = {t: 0 for t in type_labels}

    for nid, ntype in node_types:
        idx = type_counters[ntype]
        label = type_labels[ntype][idx % len(type_labels[ntype])]
        type_counters[ntype] += 1
        G.add_node(
            nid,
            label=label,
            type=ntype,
            x=float(np_rng.uniform(0, 800)),
            y=float(np_rng.uniform(0, 600)),
        )

    # Connect users to accounts
    for uid in range(20):
        acc = rng.randint(20, 34)
        G.add_edge(uid, acc,
                   weight=round(rng.uniform(0.5, 5.0), 3),
                   cost=round(rng.uniform(10, 500), 2),
                   time=round(rng.uniform(1, 72), 1),
                   label="holds")

    # Connect accounts to merchants
    for aid in range(20, 35):
        mrc = rng.randint(35, 49)
        G.add_edge(aid, mrc,
                   weight=round(rng.uniform(1.0, 10.0), 3),
                   cost=round(rng.uniform(50, 2000), 2),
                   time=round(rng.uniform(0.5, 24), 1),
                   label="transacts")

    # Random cross-edges
    nodes = list(G.nodes())
    for _ in range(30):
        u = rng.choice(nodes)
        v = rng.choice(nodes)
        if u != v and not G.has_edge(u, v):
            G.add_edge(u, v,
                       weight=round(rng.uniform(0.1, 8.0), 3),
                       cost=round(rng.uniform(1, 1000), 2),
                       time=round(rng.uniform(0.1, 48), 1),
                       label="linked")
    return G


def generate_medical_graph(seed: int = 42) -> nx.Graph:
    """
    Generate a synthetic medical network with 40 nodes.
    Node types: hospital, patient, disease, test.
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    G = nx.Graph()

    node_defs = (
        [(i, "hospital") for i in range(8)]
        + [(i + 8, "patient") for i in range(15)]
        + [(i + 23, "disease") for i in range(10)]
        + [(i + 33, "test") for i in range(7)]
    )

    hospital_names = [f"医院-{chr(65 + i)}" for i in range(8)]
    patient_names = [f"患者-{1000 + i}" for i in range(15)]
    disease_names = ["高血压", "糖尿病", "冠心病", "肺炎", "肝炎",
                     "骨折", "贫血", "哮喘", "肾病", "中风"]
    test_names = ["血常规", "CT扫描", "心电图", "B超", "MRI", "基因检测", "尿常规"]

    labels_map = {
        "hospital": hospital_names,
        "patient": patient_names,
        "disease": disease_names,
        "test": test_names,
    }
    counters = {t: 0 for t in labels_map}

    for nid, ntype in node_defs:
        idx = counters[ntype]
        label = labels_map[ntype][idx % len(labels_map[ntype])]
        counters[ntype] += 1
        G.add_node(nid, label=label, type=ntype,
                   x=float(np_rng.uniform(0, 700)),
                   y=float(np_rng.uniform(0, 500)))

    edge_defs = [
        (range(8, 23), range(8), "treated_at", (200, 5000), (1, 30)),
        (range(8, 23), range(23, 33), "diagnosed_with", (100, 2000), (1, 14)),
        (range(8, 23), range(33, 40), "underwent", (50, 1500), (1, 7)),
        (range(8), range(23, 33), "treats", (500, 10000), (7, 90)),
    ]

    for src_range, dst_range, lbl, cost_range, time_range in edge_defs:
        for src in src_range:
            dst = rng.choice(list(dst_range))
            if not G.has_edge(src, dst):
                G.add_edge(src, dst,
                           weight=round(rng.uniform(0.5, 5.0), 3),
                           cost=round(rng.uniform(*cost_range), 2),
                           time=round(rng.uniform(*time_range), 1),
                           label=lbl)

    nodes = list(G.nodes())
    for _ in range(15):
        u, v = rng.sample(nodes, 2)
        if not G.has_edge(u, v):
            G.add_edge(u, v,
                       weight=round(rng.uniform(0.1, 3.0), 3),
                       cost=round(rng.uniform(10, 500), 2),
                       time=round(rng.uniform(1, 10), 1),
                       label="related")
    return G


def generate_government_graph(seed: int = 42) -> nx.Graph:
    """
    Generate a synthetic government/enterprise network with 45 nodes.
    Node types: company, license, region, transport.
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    G = nx.Graph()

    node_defs = (
        [(i, "company") for i in range(15)]
        + [(i + 15, "license") for i in range(10)]
        + [(i + 25, "region") for i in range(12)]
        + [(i + 37, "transport") for i in range(8)]
    )

    company_names = [f"公司-{chr(65 + i)}{chr(65 + i)}" for i in range(15)]
    license_names = [f"许可证-{2000 + i}" for i in range(10)]
    region_names = ["北京", "上海", "广州", "深圳", "杭州",
                    "成都", "武汉", "西安", "南京", "重庆",
                    "天津", "苏州"]
    transport_names = ["铁路", "公路", "航空", "水运", "地铁", "轻轨", "管道", "快递"]

    labels_map = {
        "company": company_names,
        "license": license_names,
        "region": region_names,
        "transport": transport_names,
    }
    counters = {t: 0 for t in labels_map}

    for nid, ntype in node_defs:
        idx = counters[ntype]
        label = labels_map[ntype][idx % len(labels_map[ntype])]
        counters[ntype] += 1
        G.add_node(nid, label=label, type=ntype,
                   x=float(np_rng.uniform(0, 900)),
                   y=float(np_rng.uniform(0, 700)))

    # Companies hold licenses
    for cid in range(15):
        lic = rng.randint(15, 24)
        if not G.has_edge(cid, lic):
            G.add_edge(cid, lic,
                       weight=round(rng.uniform(1, 5), 3),
                       cost=round(rng.uniform(1000, 50000), 2),
                       time=round(rng.uniform(30, 365), 1),
                       label="holds_license")

    # Companies in regions
    for cid in range(15):
        reg = rng.randint(25, 36)
        if not G.has_edge(cid, reg):
            G.add_edge(cid, reg,
                       weight=round(rng.uniform(0.5, 3), 3),
                       cost=round(rng.uniform(500, 10000), 2),
                       time=round(rng.uniform(1, 30), 1),
                       label="located_in")

    # Regions use transports
    for rid in range(25, 37):
        trn = rng.randint(37, 44)
        if not G.has_edge(rid, trn):
            G.add_edge(rid, trn,
                       weight=round(rng.uniform(1, 8), 3),
                       cost=round(rng.uniform(100, 5000), 2),
                       time=round(rng.uniform(0.5, 12), 1),
                       label="uses_transport")

    nodes = list(G.nodes())
    for _ in range(20):
        u, v = rng.sample(nodes, 2)
        if not G.has_edge(u, v):
            G.add_edge(u, v,
                       weight=round(rng.uniform(0.1, 5.0), 3),
                       cost=round(rng.uniform(100, 5000), 2),
                       time=round(rng.uniform(1, 100), 1),
                       label="associated")
    return G


def generate_social_graph(seed: int = 42, n: int = 60) -> nx.Graph:
    """
    Generate a Barabasi-Albert social network with n nodes and random attributes.
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    m = max(2, n // 15)
    G = nx.barabasi_albert_graph(n, m, seed=seed)

    genders = ["male", "female", "other"]
    interests = ["sports", "music", "tech", "art", "travel", "food", "reading", "gaming"]

    for node in G.nodes():
        G.nodes[node]["label"] = f"User-{node}"
        G.nodes[node]["type"] = "user"
        G.nodes[node]["age"] = rng.randint(18, 65)
        G.nodes[node]["gender"] = rng.choice(genders)
        G.nodes[node]["interest"] = rng.choice(interests)
        G.nodes[node]["x"] = float(np_rng.uniform(0, 800))
        G.nodes[node]["y"] = float(np_rng.uniform(0, 600))

    for u, v in G.edges():
        G[u][v]["weight"] = round(rng.uniform(0.1, 5.0), 3)
        G[u][v]["cost"] = round(rng.uniform(0, 100), 2)
        G[u][v]["time"] = round(rng.uniform(0.1, 24), 1)
        G[u][v]["label"] = rng.choice(["friend", "follow", "colleague", "family"])

    return G


# ---------------------------------------------------------------------------
# Graph serialization
# ---------------------------------------------------------------------------

def graph_to_dict(G: nx.Graph) -> dict:
    """
    Convert a networkx graph to a serializable dict.
    Nodes: {id, label, type, x, y, attrs}
    Edges: {source, target, weight, cost, time, label}
    """
    nodes = []
    for nid, data in G.nodes(data=True):
        extra = {k: v for k, v in data.items()
                 if k not in ("label", "type", "x", "y")}
        nodes.append({
            "id": nid,
            "label": data.get("label", str(nid)),
            "type": data.get("type", "unknown"),
            "x": float(data.get("x", 0.0)),
            "y": float(data.get("y", 0.0)),
            "attrs": extra,
        })

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "weight": float(data.get("weight", 1.0)),
            "cost": float(data.get("cost", 0.0)),
            "time": float(data.get("time", 0.0)),
            "label": data.get("label", ""),
        })

    return {"nodes": nodes, "edges": edges}


def dict_to_graph(d: dict) -> nx.Graph:
    """
    Reconstruct a networkx Graph from the dict format produced by graph_to_dict.
    """
    G = nx.Graph()
    for node in d.get("nodes", []):
        attrs = {k: v for k, v in node.items() if k != "id"}
        attrs.update(node.get("attrs", {}))
        attrs.pop("attrs", None)
        G.add_node(node["id"], **attrs)

    for edge in d.get("edges", []):
        u = edge["source"]
        v = edge["target"]
        attrs = {k: v for k, v in edge.items() if k not in ("source", "target")}
        G.add_edge(u, v, **attrs)

    return G


# ---------------------------------------------------------------------------
# Graph statistics
# ---------------------------------------------------------------------------

def get_degree_distribution(G: nx.Graph) -> dict:
    """Return a dict mapping degree → count."""
    distribution: dict[int, int] = {}
    for _, deg in G.degree():
        distribution[deg] = distribution.get(deg, 0) + 1
    return distribution


def get_clustering_coefficients(G: nx.Graph) -> dict:
    """Return dict with mean, std, and per_node clustering coefficients."""
    per_node = nx.clustering(G)
    values = list(per_node.values())
    mean_val = float(np.mean(values)) if values else 0.0
    std_val = float(np.std(values)) if values else 0.0
    return {
        "mean": mean_val,
        "std": std_val,
        "per_node": {str(k): round(v, 6) for k, v in per_node.items()},
    }


def get_triangle_count(G: nx.Graph) -> int:
    """Return the total number of triangles in the graph."""
    triangles = nx.triangles(G)
    return sum(triangles.values()) // 3


def get_graph_stats(G: nx.Graph) -> dict:
    """
    Return comprehensive graph statistics.
    Handles disconnected graphs for diameter (uses largest component).
    """
    n = G.number_of_nodes()
    e = G.number_of_edges()
    avg_degree = (2 * e / n) if n > 0 else 0.0
    density = nx.density(G)

    cc_info = get_clustering_coefficients(G)
    avg_clustering = cc_info["mean"]
    tri_count = get_triangle_count(G)

    connected = nx.is_connected(G)
    if connected and n > 1:
        try:
            diameter = nx.diameter(G)
        except nx.NetworkXError:
            diameter = -1
    elif n > 1:
        # Use largest connected component
        lcc = max(nx.connected_components(G), key=len)
        sub = G.subgraph(lcc)
        try:
            diameter = nx.diameter(sub)
        except nx.NetworkXError:
            diameter = -1
    else:
        diameter = 0

    return {
        "node_count": n,
        "edge_count": e,
        "avg_degree": round(avg_degree, 4),
        "density": round(density, 6),
        "avg_clustering": round(avg_clustering, 6),
        "triangle_count": tri_count,
        "diameter": diameter,
        "is_connected": connected,
    }

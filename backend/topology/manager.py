"""TopologyManager — generates network topologies via NetworkX.

Supports Scale-Free, Random, Clustered, Kademlia-like, and more.
Output is a list of edges that NodePool uses to wire up peer connections.
"""

from __future__ import annotations

from dataclasses import dataclass

import networkx as nx


@dataclass
class TopologyConfig:
    topo_type: str = "random"
    n_nodes: int = 20
    # Erdős–Rényi
    p: float = 0.15
    # Barabási–Albert
    m: int = 3
    # Stochastic block model
    n_clusters: int = 3
    intra_p: float = 0.3
    inter_p: float = 0.01


class TopologyManager:
    SUPPORTED_TYPES = [
        "random",
        "scale_free",
        "clustered",
        "small_world",
        "complete",
        "ring",
        "star",
        "tree",
    ]

    def generate(self, config: TopologyConfig) -> nx.Graph:
        """Generate a NetworkX graph from config."""
        n = config.n_nodes
        match config.topo_type:
            case "random":
                return nx.erdos_renyi_graph(n, config.p)
            case "scale_free":
                return nx.barabasi_albert_graph(n, min(config.m, n - 1))
            case "clustered":
                return self._clustered(n, config.n_clusters, config.intra_p, config.inter_p)
            case "small_world":
                k = min(4, n - 1)
                return nx.watts_strogatz_graph(n, k, config.p)
            case "complete":
                return nx.complete_graph(n)
            case "ring":
                return nx.cycle_graph(n)
            case "star":
                return nx.star_graph(n - 1)
            case "tree":
                return nx.random_labeled_tree(n)
            case _:
                raise ValueError(f"Unknown topology: {config.topo_type}")

    @staticmethod
    def _clustered(n: int, n_clusters: int, intra_p: float, inter_p: float) -> nx.Graph:
        """Stochastic block model for clustered networks."""
        sizes = []
        base = n // n_clusters
        remainder = n % n_clusters
        for i in range(n_clusters):
            sizes.append(base + (1 if i < remainder else 0))

        # Build probability matrix
        probs = []
        for i in range(n_clusters):
            row = []
            for j in range(n_clusters):
                row.append(intra_p if i == j else inter_p)
            probs.append(row)

        return nx.stochastic_block_model(sizes, probs)

    @staticmethod
    def graph_to_edges(g: nx.Graph) -> list[tuple[str, str]]:
        """Convert NetworkX edges to peer ID pairs."""
        return [(f"peer-{u}", f"peer-{v}") for u, v in g.edges()]

    @staticmethod
    def graph_layout(g: nx.Graph, scale: float = 400.0) -> dict[str, tuple[float, float]]:
        """Compute 2D positions for graph nodes using spring layout."""
        pos = nx.spring_layout(g, scale=scale)
        return {f"peer-{node}": (float(x), float(y)) for node, (x, y) in pos.items()}

    @staticmethod
    def compute_metrics(g: nx.Graph) -> dict:
        """Compute graph-theoretic metrics for topology analysis."""
        n = g.number_of_nodes()
        e = g.number_of_edges()
        if n == 0:
            return {"nodes": 0, "edges": 0}

        degrees = [d for _, d in g.degree()]
        avg_degree = sum(degrees) / n if n > 0 else 0
        max_degree = max(degrees) if degrees else 0
        min_degree = min(degrees) if degrees else 0

        # Degree distribution (histogram buckets)
        from collections import Counter
        degree_counts = Counter(degrees)
        degree_dist = [{"degree": d, "count": c} for d, c in sorted(degree_counts.items())]

        # Clustering coefficient
        clustering = nx.average_clustering(g)

        # Connected components
        components = list(nx.connected_components(g))
        is_connected = len(components) == 1
        largest_cc_size = max(len(c) for c in components) if components else 0

        # Diameter and avg path length (only on largest component if disconnected)
        diameter = -1
        avg_path_length = -1.0
        if is_connected and n > 1:
            try:
                diameter = nx.diameter(g)
                avg_path_length = nx.average_shortest_path_length(g)
            except nx.NetworkXError:
                pass
        elif not is_connected and largest_cc_size > 1:
            largest_cc = g.subgraph(max(components, key=len)).copy()
            try:
                diameter = nx.diameter(largest_cc)
                avg_path_length = nx.average_shortest_path_length(largest_cc)
            except nx.NetworkXError:
                pass

        # Density
        density = nx.density(g)

        # Algebraic connectivity (Fiedler value) — measures how well-connected
        algebraic_connectivity = 0.0
        if is_connected and n > 2:
            try:
                algebraic_connectivity = round(nx.algebraic_connectivity(g), 4)
            except Exception:
                pass

        return {
            "nodes": n,
            "edges": e,
            "avg_degree": round(avg_degree, 2),
            "min_degree": min_degree,
            "max_degree": max_degree,
            "degree_distribution": degree_dist,
            "clustering_coefficient": round(clustering, 4),
            "is_connected": is_connected,
            "n_components": len(components),
            "largest_component": largest_cc_size,
            "diameter": diameter,
            "avg_path_length": round(avg_path_length, 3) if avg_path_length > 0 else -1,
            "density": round(density, 4),
            "algebraic_connectivity": algebraic_connectivity,
        }

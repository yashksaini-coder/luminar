"""Tests for TopologyManager — graph generation and conversion."""

from backend.topology.manager import TopologyManager, TopologyConfig


def test_random_graph():
    tm = TopologyManager()
    config = TopologyConfig(topo_type="random", n_nodes=20, p=0.3)
    g = tm.generate(config)
    assert len(g.nodes) == 20
    assert len(g.edges) > 0


def test_scale_free_graph():
    tm = TopologyManager()
    config = TopologyConfig(topo_type="scale_free", n_nodes=20, m=2)
    g = tm.generate(config)
    assert len(g.nodes) == 20


def test_clustered_graph():
    tm = TopologyManager()
    config = TopologyConfig(topo_type="clustered", n_nodes=21, n_clusters=3, intra_p=0.5, inter_p=0.05)
    g = tm.generate(config)
    assert len(g.nodes) == 21


def test_small_world():
    tm = TopologyManager()
    config = TopologyConfig(topo_type="small_world", n_nodes=20, p=0.3)
    g = tm.generate(config)
    assert len(g.nodes) == 20


def test_graph_to_edges():
    tm = TopologyManager()
    config = TopologyConfig(topo_type="complete", n_nodes=4)
    g = tm.generate(config)
    edges = tm.graph_to_edges(g)
    assert len(edges) == 6  # C(4,2)
    assert all(isinstance(e, tuple) and e[0].startswith("peer-") for e in edges)


def test_graph_layout():
    tm = TopologyManager()
    config = TopologyConfig(topo_type="random", n_nodes=10, p=0.3)
    g = tm.generate(config)
    layout = tm.graph_layout(g)
    assert len(layout) == 10
    assert all(isinstance(v, tuple) and len(v) == 2 for v in layout.values())


def test_all_supported_types():
    tm = TopologyManager()
    for topo_type in TopologyManager.SUPPORTED_TYPES:
        config = TopologyConfig(topo_type=topo_type, n_nodes=10, p=0.3, m=2)
        g = tm.generate(config)
        assert len(g.nodes) >= 1


# ── Metrics Tests ──

def test_metrics_complete_graph():
    """Complete graph has known properties."""
    import networkx as nx
    g = nx.complete_graph(5)
    m = TopologyManager.compute_metrics(g)
    assert m["nodes"] == 5
    assert m["edges"] == 10
    assert m["avg_degree"] == 4.0
    assert m["diameter"] == 1
    assert m["is_connected"] is True
    assert m["clustering_coefficient"] == 1.0
    assert m["density"] == 1.0


def test_metrics_ring():
    """Ring has diameter n//2, clustering 0, avg degree 2."""
    import networkx as nx
    g = nx.cycle_graph(8)
    m = TopologyManager.compute_metrics(g)
    assert m["nodes"] == 8
    assert m["edges"] == 8
    assert m["avg_degree"] == 2.0
    assert m["diameter"] == 4
    assert m["clustering_coefficient"] == 0.0
    assert m["is_connected"] is True


def test_metrics_star():
    """Star has diameter 2."""
    import networkx as nx
    g = nx.star_graph(5)
    m = TopologyManager.compute_metrics(g)
    assert m["nodes"] == 6
    assert m["diameter"] == 2
    assert m["is_connected"] is True


def test_metrics_disconnected():
    """Disconnected graph reports components and measures largest."""
    import networkx as nx
    g = nx.Graph()
    g.add_edges_from([(0, 1), (1, 2)])
    g.add_edges_from([(3, 4)])
    g.add_node(5)
    m = TopologyManager.compute_metrics(g)
    assert m["is_connected"] is False
    assert m["n_components"] == 3
    assert m["largest_component"] == 3
    assert m["diameter"] == 2


def test_metrics_degree_distribution():
    """Degree distribution has correct counts."""
    import networkx as nx
    g = nx.star_graph(3)
    m = TopologyManager.compute_metrics(g)
    dd = {d["degree"]: d["count"] for d in m["degree_distribution"]}
    assert dd[1] == 3
    assert dd[3] == 1


def test_metrics_path_graph():
    """Path graph has known diameter and avg path length."""
    import networkx as nx
    g = nx.path_graph(5)
    m = TopologyManager.compute_metrics(g)
    assert m["diameter"] == 4
    assert m["avg_path_length"] == 2.0
    assert m["clustering_coefficient"] == 0.0


def test_metrics_empty_graph():
    """Empty graph returns basic info."""
    import networkx as nx
    g = nx.Graph()
    m = TopologyManager.compute_metrics(g)
    assert m["nodes"] == 0
    assert m["edges"] == 0

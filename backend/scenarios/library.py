"""Pre-built simulation scenarios for Luminarr."""

from __future__ import annotations

from .types import ScenarioDefinition, ScenarioPhase

# The first 10 peers go into group_a, the rest into group_b for partition scenarios
_GROUP_A = [f"peer-{i}" for i in range(10)]
_GROUP_B = [f"peer-{i}" for i in range(10, 20)]

SCENARIOS: dict[str, ScenarioDefinition] = {
    "free_play": ScenarioDefinition(
        id="free_play",
        name="Free Play",
        description=(
            "Full manual control. No automatic faults. Use the Fault tab to inject "
            "latency, partitions, Sybil, or Eclipse attacks at any time."
        ),
        icon="🎮",
        topology_type="random",
        topology_params={"p": 0.15},
        phases=[],
        duration=120.0,
    ),
    "gossip_benchmark": ScenarioDefinition(
        id="gossip_benchmark",
        name="Gossip Benchmark",
        description=(
            "Scale-free topology (hub nodes). Observe how GossipSub converges to "
            "mesh degree D=6, watch P1–P4 peer scores evolve, and measure "
            "message propagation latency across the network."
        ),
        icon="📡",
        topology_type="scale_free",
        topology_params={"m": 2},
        phases=[],
        duration=90.0,
    ),
    "partition_test": ScenarioDefinition(
        id="partition_test",
        name="Partition Recovery",
        description=(
            "Clustered topology with two groups. A network partition is injected "
            "at T+15s, splitting the mesh in two. The partition clears at T+35s — "
            "watch the GossipSub mesh heal and delivery ratios recover."
        ),
        icon="⚡",
        topology_type="clustered",
        topology_params={"n_clusters": 2, "intra_p": 0.4, "inter_p": 0.05},
        phases=[
            ScenarioPhase(
                at=15.0,
                label="Partitioning network — mesh splits",
                action="inject_partition",
                params={"group_a": _GROUP_A, "group_b": _GROUP_B},
            ),
            ScenarioPhase(
                at=35.0,
                label="Clearing partition — mesh healing",
                action="clear_faults",
                params={},
            ),
        ],
        duration=60.0,
    ),
    "sybil_eclipse": ScenarioDefinition(
        id="sybil_eclipse",
        name="Sybil + Eclipse Attack",
        description=(
            "Random topology under attack. At T+10s, 5 Sybil nodes flood the "
            "GossipSub mesh. At T+25s, peer-10 is eclipsed by 4 attacker nodes. "
            "Watch the P3/P4 scoring system identify and prune malicious peers."
        ),
        icon="🕵️",
        topology_type="random",
        topology_params={"p": 0.2},
        phases=[
            ScenarioPhase(
                at=10.0,
                label="Injecting 5 Sybil attackers into mesh",
                action="inject_sybil",
                params={"n_attackers": 5, "target_topic": "lumina/blocks/1.0"},
            ),
            ScenarioPhase(
                at=25.0,
                label="Launching Eclipse attack on peer-10",
                action="inject_eclipse",
                params={"target_peer_id": "peer-10", "n_attackers": 4},
            ),
            ScenarioPhase(
                at=40.0,
                label="Clearing all attacks — recovery phase",
                action="clear_faults",
                params={},
            ),
        ],
        duration=60.0,
    ),
}

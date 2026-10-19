"""Tests for the Prometheus text exposition with Lighthouse label names."""

import trio

from backend.events.types import GossipGraft, GossipMessage, GossipPrune, ScenarioPhaseFired
from backend.otel.metrics import GossipMetrics
from backend.simulation.engine import SimulationEngine

TOPIC = "lumina/blocks/1.0"


def test_counters_only_without_engine():
    m = GossipMetrics()
    text = m.render(None)
    assert "luminar_faults_active 0" in text
    assert "gossipsub_mesh_peer_counts" not in text


def test_lighthouse_label_scheme_and_gauges():
    engine = SimulationEngine(n_nodes=4)
    engine.wire_topology([(f"peer-{i}", f"peer-{(i + 1) % 4}") for i in range(4)], {})
    m = GossipMetrics()
    engine.event_bus.sinks.append(m.sink)

    async def run():
        bus = engine.event_bus
        await bus.emit(GossipGraft(at=1.0, from_peer="peer-0", to_peer="peer-1", topic=TOPIC))
        await bus.emit(
            GossipPrune(at=1.0, from_peer="peer-0", to_peer="sybil-0", topic=TOPIC, reason="score")
        )
        await bus.emit(GossipPrune(at=1.0, from_peer="peer-0", to_peer="peer-2", topic=TOPIC))
        await bus.emit(
            GossipMessage(at=1.0, topic=TOPIC, from_peer="peer-0", msg_id="msg-1", hops=0)
        )
        await bus.emit(
            GossipMessage(
                at=1.1, topic=TOPIC, from_peer="peer-0", to_peer="peer-1", msg_id="msg-1", hops=1
            )
        )
        await bus.emit(
            GossipMessage(
                at=1.2,
                topic=TOPIC,
                from_peer="sybil-0",
                to_peer="peer-1",
                msg_id="spam-1",
                via="spam",
            )
        )
        await bus.emit(
            ScenarioPhaseFired(
                at=10.0, scenario_id="demo", phase_idx=0, label="Sybil", action="inject_sybil"
            )
        )

    trio.run(run)
    text = m.render(engine, telemetry_peers=2)
    lines = text.splitlines()

    assert (
        'gossipsub_mesh_peer_inclusion_events{hash="lumina/blocks/1.0",reason="Random"} 1' in lines
    )
    assert 'gossipsub_mesh_peer_churn_events{hash="lumina/blocks/1.0",reason="BadScore"} 1' in lines
    assert 'gossipsub_mesh_peer_churn_events{hash="lumina/blocks/1.0",reason="Excess"} 1' in lines
    assert 'gossipsub_topic_msg_published{hash="lumina/blocks/1.0"} 1' in lines
    assert 'gossipsub_topic_msg_recv_counts{hash="lumina/blocks/1.0"} 1' in lines
    assert 'luminar_invalid_messages_total{topic="lumina/blocks/1.0"} 1' in lines
    phase = [
        ln
        for ln in lines
        if ln.startswith(
            'luminar_scenario_phase{action="inject_sybil",label="Sybil",scenario="demo"} '
        )
    ]
    assert phase and float(phase[0].rsplit(" ", 1)[1]) > 1.7e12  # wall-clock ms
    assert 'luminar_telemetry_peers{source="json"} 2' in lines
    # Gauges computed at scrape with Lighthouse's MeshPeerLabel keys
    assert any(
        line.startswith(
            'gossipsub_mesh_peer_counts{supports_partial="false",topic_hash="lumina/blocks/1.0"} '
        )
        for line in lines
    )
    assert 'gossipsub_score_per_mesh_bucket{hash="lumina/blocks/1.0",le="+Inf"} 4' in lines
    assert "# TYPE gossipsub_score_per_mesh histogram" in lines
    assert "luminar_node_count 4" in lines
    # Never a peer_id label
    assert "peer_id=" not in text


def test_label_values_are_escaped():
    from backend.otel.metrics import _fmt_labels, _lbl

    out = _fmt_labels(_lbl(label='Peer "A" eclipsed\nnow', path="a\\b"))
    assert out == '{label="Peer \\"A\\" eclipsed\\nnow",path="a\\\\b"}'

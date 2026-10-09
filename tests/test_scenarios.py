"""Tests for ScenarioRunner phase execution and the scenario library."""

import pytest

from backend.events.bus import EventBus
from backend.fault.injector import FaultInjector
from backend.scenarios.library import SCENARIOS
from backend.scenarios.runner import ScenarioRunner
from backend.scenarios.types import ScenarioPhase
from backend.simulation.clock import SimulationClock
from backend.simulation.node_pool import NodePool


@pytest.fixture
def fault_injector():
    bus = EventBus()
    clock = SimulationClock(bus)
    clock._time = 1.0
    clock._paused = False
    pool = NodePool(bus, clock, n_nodes=12, max_streams_per_node=8, max_dht_queries=2)
    pool.wire_topology([(f"peer-{i}", f"peer-{(i + 1) % 12}") for i in range(12)])
    fi = FaultInjector(bus, clock, pool)
    pool.gossip._fault_injector = fi
    return fi


async def test_phase_emits_scenario_phase_fired(fault_injector):
    runner = ScenarioRunner()
    scenario = SCENARIOS["demo_sybil_eclipse"]
    runner.set_scenario(scenario)
    phase = scenario.phases[0]
    await runner._execute_phase(phase, fault_injector)

    fired = [e for e in fault_injector._event_bus.ring if e.event_type == "ScenarioPhaseFired"]
    assert len(fired) == 1
    e = fired[0].to_dict()
    assert e["scenario_id"] == "demo_sybil_eclipse"
    assert e["phase_idx"] == 0
    assert e["label"] == phase.label
    assert e["action"] == "inject_sybil"
    assert e["category"] == "simulation"
    # The phase event precedes the fault it triggers
    types = [x.event_type for x in fault_injector._event_bus.ring]
    assert types.index("ScenarioPhaseFired") < types.index("FaultInjected")


def test_demo_scenario_shape():
    """The demo scenario keeps ≥ D_LOW eclipse attackers so the eclipse cannot self-heal."""
    from backend.gossip.engine import D_LOW

    s = SCENARIOS["demo_sybil_eclipse"]
    actions = [p.action for p in s.phases]
    assert actions == ["inject_sybil", "inject_eclipse", "clear_faults"]
    assert [p.at for p in s.phases] == [10.0, 16.0, 24.0]
    assert s.phases[1].params["n_attackers"] >= D_LOW


def test_unknown_phase_is_logged_not_raised(fault_injector):
    import trio

    runner = ScenarioRunner()
    phase = ScenarioPhase(at=0, label="x", action="nope")
    trio.run(runner._execute_phase, phase, fault_injector)

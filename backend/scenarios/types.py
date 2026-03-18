"""Scenario type definitions."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ScenarioPhase:
    """A timed action within a scenario."""

    at: float  # Simulation time (seconds) when this phase triggers
    label: str  # Human-readable display label (shown in header)
    action: str  # One of: inject_partition, inject_sybil, inject_eclipse,
    #         inject_latency, inject_drop, clear_faults
    params: dict = field(default_factory=dict)


@dataclass
class ScenarioDefinition:
    """A complete scenario with topology config and timed phases."""

    id: str
    name: str
    description: str
    icon: str  # Emoji icon for scenario cards
    topology_type: str
    topology_params: dict  # Passed to TopologyConfig (excluding topo_type/n_nodes)
    phases: list[ScenarioPhase] = field(default_factory=list)
    duration: float = 90.0  # Expected sim duration (seconds) — informational only

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "topology_type": self.topology_type,
            "phases": [{"at": p.at, "label": p.label, "action": p.action} for p in self.phases],
            "duration": self.duration,
        }

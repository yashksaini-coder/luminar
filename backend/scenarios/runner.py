"""ScenarioRunner — trio task that executes scenario phases at the right sim time.

Runs as a persistent trio task within the simulation nursery.
When a scenario is launched, the runner watches the clock and fires
fault-injection actions at the configured simulation timestamps.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import trio

from .types import ScenarioDefinition, ScenarioPhase

if TYPE_CHECKING:
    from backend.fault.injector import FaultInjector
    from backend.simulation.clock import SimulationClock

logger = logging.getLogger(__name__)


class ScenarioRunner:
    """Watches simulation clock and executes scenario phases at configured times.

    Thread-safety: set_scenario() can be called from the asyncio thread
    (CPython GIL makes simple attribute assignment atomic). The run() coroutine
    only reads these attributes and runs entirely on the trio thread.
    """

    def __init__(self) -> None:
        self._scenario: ScenarioDefinition | None = None
        self._phase_idx: int = 0
        self._fault_ids: list[str] = []

    def set_scenario(self, scenario: ScenarioDefinition | None) -> None:
        """Update the active scenario (safe to call from asyncio thread)."""
        self._scenario = scenario
        self._phase_idx = 0
        self._fault_ids = []

    def get_status(self) -> dict:
        """Return current scenario state for the /api/scenarios/active endpoint."""
        if self._scenario is None:
            return {"active": False, "scenario": None}

        phases = self._scenario.phases
        phase_idx = self._phase_idx

        next_phase = phases[phase_idx] if phase_idx < len(phases) else None
        completed_labels = [phases[i].label for i in range(min(phase_idx, len(phases)))]

        return {
            "active": True,
            "scenario": self._scenario.to_dict(),
            "phase_idx": phase_idx,
            "total_phases": len(phases),
            "next_phase_at": next_phase.at if next_phase else None,
            "next_phase_label": next_phase.label if next_phase else None,
            "completed_phases": completed_labels,
            "all_phases_done": phase_idx >= len(phases),
        }

    async def run(self, clock: SimulationClock, fault_injector: FaultInjector) -> None:
        """Persistent trio task — polls clock every 200ms and fires phases."""
        while True:
            try:
                await trio.sleep(0.2)

                scenario = self._scenario
                if scenario is None:
                    continue

                phases = scenario.phases
                idx = self._phase_idx

                if idx >= len(phases):
                    continue  # All phases done for this scenario

                next_phase = phases[idx]

                # Only fire when clock is running and has reached the phase time
                if not clock.paused and clock.time >= next_phase.at:
                    self._phase_idx = idx + 1  # Increment before executing to prevent re-fire
                    logger.info(
                        "Scenario '%s' phase %d/%d: %s",
                        scenario.id,
                        idx + 1,
                        len(phases),
                        next_phase.label,
                    )
                    await self._execute_phase(next_phase, fault_injector)
            except trio.Cancelled:
                raise  # Always propagate cancellation
            except Exception:
                logger.exception("ScenarioRunner loop error — continuing")

    async def _execute_phase(
        self, phase: ScenarioPhase, fault_injector: FaultInjector
    ) -> None:
        """Execute a single scenario phase action."""
        action = phase.action
        params = phase.params

        try:
            match action:
                case "inject_partition":
                    fault_id = await fault_injector.inject_partition(
                        params["group_a"], params["group_b"]
                    )
                    self._fault_ids.append(fault_id)

                case "inject_sybil":
                    fault_id = await fault_injector.inject_sybil(
                        params["n_attackers"], params["target_topic"]
                    )
                    self._fault_ids.append(fault_id)

                case "inject_eclipse":
                    fault_id = await fault_injector.inject_eclipse(
                        params["target_peer_id"], params["n_attackers"]
                    )
                    self._fault_ids.append(fault_id)

                case "inject_latency":
                    fault_id = await fault_injector.inject_latency(
                        params["peer_a"],
                        params["peer_b"],
                        params["ms"],
                        params.get("jitter_ms", 0),
                    )
                    self._fault_ids.append(fault_id)

                case "inject_drop":
                    fault_id = await fault_injector.drop_peer(params["peer_id"])
                    self._fault_ids.append(fault_id)

                case "clear_faults":
                    await fault_injector.clear_all()
                    self._fault_ids.clear()

                case _:
                    logger.warning("Unknown scenario action: %s", action)

        except Exception:
            logger.exception("Error executing scenario phase '%s'", phase.label)

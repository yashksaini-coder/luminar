"""SimulationClock — controllable time source for the simulation.

Supports play/pause/speed/seek. The clock emits ClockTick events at regular intervals
and all simulation components read time from this clock rather than wall clock.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import trio

if TYPE_CHECKING:
    from backend.events.bus import EventBus

# Default tick interval in simulated seconds
TICK_INTERVAL = 0.1


class SimulationClock:
    def __init__(self, event_bus: EventBus, tick_interval: float = TICK_INTERVAL) -> None:
        self._event_bus = event_bus
        self._tick_interval = tick_interval
        self._time: float = 0.0
        self._speed: float = 1.0
        self._paused: bool = True
        self._running: bool = False

    @property
    def time(self) -> float:
        return self._time

    @property
    def speed(self) -> float:
        return self._speed

    @speed.setter
    def speed(self, value: float) -> None:
        self._speed = max(0.1, min(value, 100.0))

    @property
    def paused(self) -> bool:
        return self._paused

    def play(self) -> None:
        self._paused = False

    def pause(self) -> None:
        self._paused = True

    def reset(self) -> None:
        self._time = 0.0
        self._paused = True

    def seek(self, t: float) -> None:
        """Jump to a specific simulation time. Used with replay/scrubber."""
        self._time = max(0.0, t)

    async def run(self, task_status=trio.TASK_STATUS_IGNORED) -> None:
        """Main clock loop. Call via nursery.start() or nursery.start_soon()."""
        from backend.events.types import ClockTick

        self._running = True
        task_status.started()

        while self._running:
            if self._paused:
                await trio.sleep(0.05)
                continue

            wall_sleep = self._tick_interval / self._speed
            await trio.sleep(wall_sleep)
            self._time += self._tick_interval

            await self._event_bus.emit(ClockTick(at=self._time, speed=self._speed))

    def stop(self) -> None:
        self._running = False

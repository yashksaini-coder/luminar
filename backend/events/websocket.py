"""WebSocket fan-out — bridges EventBus to connected browser clients."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import trio
from fastapi import WebSocket, WebSocketDisconnect

if TYPE_CHECKING:
    from backend.events.bus import EventBus

logger = logging.getLogger(__name__)


async def ws_event_handler(ws: WebSocket, event_bus: EventBus) -> None:
    """Handle a single WebSocket connection: subscribe to EventBus, forward events as JSON."""
    await ws.accept()
    recv_ch = event_bus.subscribe()
    logger.info("WS client connected")

    try:
        async for event in recv_ch:
            try:
                await ws.send_bytes(event.to_json())
            except Exception:
                break
    except (WebSocketDisconnect, trio.ClosedResourceError):
        pass
    finally:
        await recv_ch.aclose()
        logger.info("WS client disconnected")

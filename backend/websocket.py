"""
SEFS WebSocket Manager — broadcast real-time events to connected clients.
"""

import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger("sefs.websocket")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts events."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Any = None) -> None:
        """Broadcast an event to all connected clients."""
        message = json.dumps({"type": event_type, "data": data})
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, event_type: str, data: Any = None) -> None:
        """Send an event to a specific client."""
        message = json.dumps({"type": event_type, "data": data})
        try:
            await websocket.send_text(message)
        except Exception:
            self.disconnect(websocket)


# Singleton instance
ws_manager = ConnectionManager()

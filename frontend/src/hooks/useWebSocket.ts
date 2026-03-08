import { useEffect, useRef, useState, useCallback } from "react";
import type { WSEvent } from "../types";

export function useWebSocket() {
	const wsRef = useRef<WebSocket | null>(null);
	const [connected, setConnected] = useState(false);
	const [events, setEvents] = useState<WSEvent[]>([]);
	const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
	const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) return;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

		ws.onopen = () => {
			setConnected(true);
		};

		ws.onmessage = (event) => {
			try {
				const parsed: WSEvent = JSON.parse(event.data);
				setLastEvent(parsed);
				setEvents((prev) => [parsed, ...prev].slice(0, 100));
			} catch {
				// ignore malformed messages
			}
		};

		ws.onclose = () => {
			setConnected(false);
			// Reconnect after 3 seconds
			reconnectTimeout.current = setTimeout(connect, 3000);
		};

		ws.onerror = () => {
			ws.close();
		};

		wsRef.current = ws;
	}, []);

	useEffect(() => {
		connect();
		return () => {
			clearTimeout(reconnectTimeout.current);
			wsRef.current?.close();
		};
	}, [connect]);

	const clearEvents = useCallback(() => {
		setEvents([]);
	}, []);

	return { connected, events, lastEvent, clearEvents };
}

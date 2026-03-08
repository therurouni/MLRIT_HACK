import { useEffect, useRef, useState, useCallback } from "react";
import { useHandTracking, type GestureType } from "../hooks/useHandTracking";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as d3 from "d3";

// ── Finger connections for skeleton drawing ─────────────────────────────────
const HAND_CONNECTIONS = [
	[0, 1], [1, 2], [2, 3], [3, 4],       // thumb
	[0, 5], [5, 6], [6, 7], [7, 8],       // index
	[0, 9], [9, 10], [10, 11], [11, 12],   // middle
	[0, 13], [13, 14], [14, 15], [15, 16], // ring
	[0, 17], [17, 18], [18, 19], [19, 20], // pinky
	[5, 9], [9, 13], [13, 17],             // palm
];

const GESTURE_LABELS: Record<GestureType, string> = {
	none: "No gesture",
	pointer: "Point — hover (hold to click)",
	click: "Dwell — click!",
	pan: "Open palm — grab node (hold 1s)",
	zoom: "Pinch — zoom",
	scroll: "Two fingers — scroll",
	fist: "Fist — cancel",
};

const GESTURE_COLORS: Record<GestureType, string> = {
	none: "#6b7280",
	pointer: "#3b82f6",
	click: "#22c55e",
	pan: "#D97757",
	zoom: "#a855f7",
	scroll: "#0ea5e9",
	fist: "#ef4444",
};

interface Props {
	enabled: boolean;
	onToggle: () => void;
}

export default function HandTracker({ enabled, onToggle }: Props) {
	const { handState, videoRef, canvasRef } = useHandTracking(enabled);
	const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const prevScreenPos = useRef({ x: 0, y: 0 });
	const prevGestureRef = useRef<GestureType>("none");
	// Grab-and-drag state
	const [grabbedNode, setGrabbedNode] = useState<SVGGElement | null>(null);
	const grabReadyRef = useRef(false);
	const grabbedDatumRef = useRef<any>(null);

	// Draw hand skeleton on overlay canvas
	const drawSkeleton = useCallback((landmarks: NormalizedLandmark[][] | null) => {
		const canvas = overlayCanvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		if (!landmarks) return;

		for (const hand of landmarks) {
			// Draw connections
			ctx.strokeStyle = GESTURE_COLORS[handState.gesture];
			ctx.lineWidth = 2;
			for (const [a, b] of HAND_CONNECTIONS) {
				const pA = hand[a];
				const pB = hand[b];
				ctx.beginPath();
				// Mirror X for webcam
				ctx.moveTo((1 - pA.x) * canvas.width, pA.y * canvas.height);
				ctx.lineTo((1 - pB.x) * canvas.width, pB.y * canvas.height);
				ctx.stroke();
			}

			// Draw landmarks
			for (let i = 0; i < hand.length; i++) {
				const p = hand[i];
				ctx.beginPath();
				ctx.arc(
					(1 - p.x) * canvas.width,
					p.y * canvas.height,
					i === 8 || i === 4 ? 5 : 3, // bigger dots for index tip & thumb tip
					0,
					2 * Math.PI,
				);
				ctx.fillStyle = i === 8 ? "#22c55e" : i === 4 ? "#ef4444" : "#ffffff";
				ctx.fill();
			}
		}
	}, [handState.gesture]);

	// Draw skeleton on each state update
	useEffect(() => {
		drawSkeleton(handState.landmarks);
	}, [handState.landmarks, drawSkeleton]);

	// Find the active SVG canvas
	const findSvgCanvas = useCallback((): SVGSVGElement | null => {
		// Try the spatial view SVG first, then the force graph SVG
		return (
			document.querySelector<SVGSVGElement>("svg.w-full.h-full") ||
			document.querySelector<SVGSVGElement>(".h-full svg") ||
			document.querySelector<SVGSVGElement>("svg")
		);
	}, []);

	// Dispatch synthetic events based on gestures
	useEffect(() => {
		if (!enabled || !handState.detecting) return;

		const screenX = handState.cursorX * window.innerWidth;
		const screenY = handState.cursorY * window.innerHeight;

		// Smooth the screen position
		const smoothX = prevScreenPos.current.x + (screenX - prevScreenPos.current.x) * 0.5;
		const smoothY = prevScreenPos.current.y + (screenY - prevScreenPos.current.y) * 0.5;
		prevScreenPos.current = { x: smoothX, y: smoothY };

		// Move virtual cursor
		if (cursorRef.current) {
			cursorRef.current.style.left = `${smoothX}px`;
			cursorRef.current.style.top = `${smoothY}px`;
		}

		const targetEl = document.elementFromPoint(smoothX, smoothY);
		if (!targetEl) return;

		// ── Pointer mode: move cursor, trigger hover ──
		if (handState.gesture === "pointer") {
			targetEl.dispatchEvent(new MouseEvent("mousemove", {
				clientX: smoothX,
				clientY: smoothY,
				bubbles: true,
				cancelable: true,
			}));
		}

		// ── Click: pinch triggers click ──
		if (handState.clickTriggered) {
			for (const type of ["mousedown", "mouseup", "click"] as const) {
				targetEl.dispatchEvent(new MouseEvent(type, {
					clientX: smoothX,
					clientY: smoothY,
					bubbles: true,
					cancelable: true,
					button: 0,
				}));
			}
		}

		// ── Pan: open palm grabs and drags nodes ──
		if (handState.gesture === "pan") {
			if (handState.grabProgress >= 1 && !grabReadyRef.current && !grabbedNode) {
				// 1 second hold complete — grab nearest node
				grabReadyRef.current = true;
				
				// Find the nearest D3 node <g> element under cursor
				// D3 structure: svg > g (zoom) > g (nodes container) > g (node) > circle
				const elements = document.elementsFromPoint(smoothX, smoothY);
				let nodeGroup: SVGGElement | null = null;
				
				for (const el of elements) {
					// Look for a <g> that has a <circle> child (node group)
					if (el.tagName === 'g' && el.querySelector('circle')) {
						nodeGroup = el as SVGGElement;
						break;
					}
					// Or a circle inside a <g>
					if (el.tagName === 'circle' && el.parentElement?.tagName === 'g') {
						nodeGroup = el.parentElement as unknown as SVGGElement;
						break;
					}
				}
				
				if (nodeGroup) {
					// Get the D3 datum bound to this element
					const datum = d3.select(nodeGroup).datum() as any;
					if (datum) {
						setGrabbedNode(nodeGroup);
						grabbedDatumRef.current = datum;
						// Fix the node position to start dragging
						datum.fx = datum.x;
						datum.fy = datum.y;
						// Visual feedback - highlight the grabbed node
						d3.select(nodeGroup).select('circle')
							.attr('stroke', '#fff')
							.attr('stroke-width', 3);
					}
				}
			} else if (grabbedNode && grabReadyRef.current && grabbedDatumRef.current) {
				// Continue dragging — update node position directly
				const datum = grabbedDatumRef.current;
				
				// Convert screen coordinates to SVG coordinates
				const svgEl = findSvgCanvas();
				if (svgEl) {
					const svgRect = svgEl.getBoundingClientRect();
					// Get the current zoom transform
					const zoomG = svgEl.querySelector('g');
					if (zoomG) {
						const transform = d3.zoomTransform(svgEl);
						// Convert screen coords to SVG coords accounting for zoom
						const svgX = (smoothX - svgRect.left - transform.x) / transform.k;
						const svgY = (smoothY - svgRect.top - transform.y) / transform.k;
						datum.fx = svgX;
						datum.fy = svgY;
					}
				}
			}
		} else {
			// Gesture changed — release the grabbed node
			if (grabbedNode || grabReadyRef.current) {
				if (grabbedDatumRef.current) {
					// Unfix the node so it can move freely again
					grabbedDatumRef.current.fx = null;
					grabbedDatumRef.current.fy = null;
				}
				if (grabbedNode) {
					// Remove highlight
					d3.select(grabbedNode).select('circle')
						.attr('stroke', 'none')
						.attr('stroke-width', 0);
				}
				grabbedDatumRef.current = null;
				setGrabbedNode(null);
				grabReadyRef.current = false;
			}
		}

		// ── Zoom: pinch distance change ──
		if (handState.gesture === "zoom" && Math.abs(handState.zoomDelta) > 0.005) {
			const svgEl = findSvgCanvas();
			if (svgEl) {
				const rect = svgEl.getBoundingClientRect();
				svgEl.dispatchEvent(new WheelEvent("wheel", {
					clientX: rect.left + rect.width / 2,
					clientY: rect.top + rect.height / 2,
					deltaY: -handState.zoomDelta * 120,
					deltaMode: 0,
					bubbles: true,
					cancelable: true,
				}));
			}
		}

		// ── Scroll: two fingers + vertical movement ──
		if (handState.gesture === "scroll" && Math.abs(handState.scrollDelta) > 0) {
			const scrollTarget = document.elementFromPoint(smoothX, smoothY);
			if (scrollTarget) {
				scrollTarget.dispatchEvent(new WheelEvent("wheel", {
					clientX: smoothX,
					clientY: smoothY,
					deltaY: -handState.scrollDelta * 15,
					deltaMode: 0,
					bubbles: true,
					cancelable: true,
				}));
			}
		}

		// ── Fist: dismiss / Escape ──
		if (handState.gesture === "fist" && prevGestureRef.current !== "fist") {
			document.body.dispatchEvent(new KeyboardEvent("keydown", {
				key: "Escape",
				code: "Escape",
				bubbles: true,
				cancelable: true,
			}));
		}
		prevGestureRef.current = handState.gesture;
	}, [enabled, handState, findSvgCanvas]);

	return (
		<>
			{/* Toggle button */}
			<button
				onClick={onToggle}
				className={`fixed bottom-16 right-4 z-[100] flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all duration-200 shadow-lg ${
					enabled
						? "bg-claude-accent/20 border-claude-accent text-claude-accent hover:bg-claude-accent/30"
						: "bg-claude-surface/90 border-claude-border text-claude-muted hover:text-claude-text hover:bg-claude-surface"
				}`}
				title={enabled ? "Disable hand tracking" : "Enable hand tracking"}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v0" />
					<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
					<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
					<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
				</svg>
				{enabled ? "Hand Tracking ON" : "Hand Tracking"}
			</button>

			{enabled && (
				<>
					{/* Webcam preview with skeleton overlay */}
					<div className="fixed bottom-16 left-4 z-[100] rounded-xl overflow-hidden border border-claude-border shadow-2xl bg-black"
						style={{ width: 240, height: 180 }}
					>
						{/* Mirror the video feed - reuse the main video ref */}
						<video
							ref={videoRef}
							className="w-full h-full object-cover"
							style={{ transform: "scaleX(-1)" }}
							playsInline
							muted
							autoPlay
						/>
						{/* Skeleton overlay */}
						<canvas
							ref={overlayCanvasRef}
							width={240}
							height={180}
							className="absolute inset-0 w-full h-full"
						/>
						{/* Gesture label */}
						<div
							className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] font-mono text-center backdrop-blur-sm"
							style={{
								backgroundColor: `${GESTURE_COLORS[handState.gesture]}20`,
								color: GESTURE_COLORS[handState.gesture],
								borderTop: `1px solid ${GESTURE_COLORS[handState.gesture]}40`,
							}}
						>
							{handState.detecting ? GESTURE_LABELS[handState.gesture] : "Show hand to camera..."}
						</div>
						{/* Detection indicator */}
						<div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
							handState.detecting ? "bg-green-400 animate-pulse" : "bg-red-400"
						}`} />
					</div>

					{/* Virtual cursor */}
					{handState.detecting && handState.gesture !== "none" && (
						<div
							ref={cursorRef}
							className="fixed z-[99] pointer-events-none"
							style={{
								left: handState.cursorX * window.innerWidth,
								top: handState.cursorY * window.innerHeight,
								transform: "translate(-50%, -50%)",
							}}
						>
							{/* Outer ring */}
							<div
								className="rounded-full border-2 transition-all duration-100"
								style={{
								width: handState.gesture === "click" ? 16 
									: handState.gesture === "pan" ? (grabbedNode ? 36 : 32)
									: handState.gesture === "fist" ? 20 : 24,
								height: handState.gesture === "click" ? 16 
									: handState.gesture === "pan" ? (grabbedNode ? 36 : 32)
									: handState.gesture === "fist" ? 20 : 24,
								borderColor: GESTURE_COLORS[handState.gesture],
								backgroundColor: handState.gesture === "click"
									? `${GESTURE_COLORS.click}60`
									: handState.gesture === "fist"
									? `${GESTURE_COLORS.fist}40`
									: grabbedNode
									? `${GESTURE_COLORS.pan}40`
										: "transparent",
									boxShadow: `0 0 12px ${GESTURE_COLORS[handState.gesture]}80`,
								}}
							/>
							{/* Center dot */}
							<div
								className="absolute rounded-full"
								style={{
									width: 4,
									height: 4,
									backgroundColor: GESTURE_COLORS[handState.gesture],
									top: "50%",
									left: "50%",
									transform: "translate(-50%, -50%)",
								}}
							/>
							{/* Dwell progress ring */}
							{handState.gesture === "pointer" && handState.dwellProgress > 0 && (
								<svg
									width="32"
									height="32"
									className="absolute"
									style={{
										top: "50%",
										left: "50%",
										transform: "translate(-50%, -50%) rotate(-90deg)",
										opacity: handState.dwellProgress > 0 ? 1 : 0,
										transition: "opacity 0.1s",
									}}
								>
									<circle
										cx="16"
										cy="16"
										r="13"
										fill="none"
										stroke={GESTURE_COLORS.click}
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeDasharray={2 * Math.PI * 13}
										strokeDashoffset={2 * Math.PI * 13 * (1 - handState.dwellProgress)}
									/>
								</svg>
							)}
							{/* Grab progress ring */}
							{handState.gesture === "pan" && handState.grabProgress > 0 && handState.grabProgress < 1 && (
								<svg
									width="40"
									height="40"
									className="absolute"
									style={{
										top: "50%",
										left: "50%",
										transform: "translate(-50%, -50%) rotate(-90deg)",
									}}
								>
									<circle
										cx="20"
										cy="20"
										r="17"
										fill="none"
										stroke={GESTURE_COLORS.pan}
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeDasharray={2 * Math.PI * 17}
										strokeDashoffset={2 * Math.PI * 17 * (1 - handState.grabProgress)}
									/>
								</svg>
							)}
							{/* Gesture icon */}
							{handState.gesture === "pan" && (
								<div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono whitespace-nowrap"
									style={{ color: GESTURE_COLORS.pan }}>
									{grabbedNode ? "DRAGGING" : handState.grabProgress >= 1 ? "GRAB!" : "HOLD..."}
								</div>
							)}
							{handState.gesture === "zoom" && (
								<div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono whitespace-nowrap"
									style={{ color: GESTURE_COLORS.zoom }}>
									ZOOM {handState.zoomDelta > 0 ? "+" : handState.zoomDelta < 0 ? "-" : ""}
								</div>
							)}
							{handState.gesture === "scroll" && (
								<div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono whitespace-nowrap"
									style={{ color: GESTURE_COLORS.scroll }}>
									SCROLL {handState.scrollDelta > 0 ? "\u25B2" : handState.scrollDelta < 0 ? "\u25BC" : ""}
								</div>
							)}
							{handState.gesture === "fist" && (
								<div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono whitespace-nowrap"
									style={{ color: GESTURE_COLORS.fist }}>
									ESC
								</div>
							)}
						</div>
					)}
				</>
			)}
		</>
	);
}

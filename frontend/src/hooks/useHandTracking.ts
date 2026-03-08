import { useRef, useState, useEffect, useCallback } from "react";
import {
	HandLandmarker,
	FilesetResolver,
	type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ── Gesture types ───────────────────────────────────────────────────────────
export type GestureType = "none" | "pointer" | "click" | "pan" | "zoom" | "scroll" | "fist";

export interface HandState {
	/** Current detected gesture */
	gesture: GestureType;
	/** Cursor position mapped to screen (0-1 normalized) */
	cursorX: number;
	cursorY: number;
	/** Raw landmark positions (21 points per hand) */
	landmarks: NormalizedLandmark[][] | null;
	/** Whether hand tracking is active and detecting */
	detecting: boolean;
	/** Zoom delta per frame (positive = zoom in) */
	zoomDelta: number;
	/** Pan delta per frame */
	panDeltaX: number;
	panDeltaY: number;
	/** Dwell-click triggered (index held still for 800ms) */
	clickTriggered: boolean;
	/** Dwell progress 0–1 (how close to triggering a dwell click) */
	dwellProgress: number;
	/** Scroll delta per frame (positive = scroll up) */
	scrollDelta: number;
	/** Grab progress 0–1 (how close to grabbing a node with open palm) */
	grabProgress: number;
}

// ── Geometry helpers ────────────────────────────────────────────────────────
// MediaPipe hand landmarks: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
// 0=wrist, 4=thumb_tip, 8=index_tip, 12=middle_tip, 16=ring_tip, 20=pinky_tip
// MCP joints: 5=index_mcp, 9=middle_mcp, 13=ring_mcp, 17=pinky_mcp
// PIP joints: 6=index_pip, 10=middle_pip, 14=ring_pip, 18=pinky_pip

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
	return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
	return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Hand scale = distance from wrist (0) to middle MCP (9). Used to normalize thresholds. */
function getHandScale(landmarks: NormalizedLandmark[]): number {
	return Math.max(dist(landmarks[0], landmarks[9]), 0.01);
}

/**
 * Rotation-robust finger extension check.
 * A finger is extended when tip-to-MCP distance > PIP-to-MCP distance * factor,
 * AND the curl angle (MCP→PIP→TIP) is obtuse (> ~140°).
 */
function isFingerExtended(
	landmarks: NormalizedLandmark[],
	tip: number, pip: number, mcp: number,
): boolean {
	const tipToMcp = dist(landmarks[tip], landmarks[mcp]);
	const pipToMcp = dist(landmarks[pip], landmarks[mcp]);

	// Distance ratio: extended finger has tip far from MCP relative to PIP
	const distRatio = tipToMcp / Math.max(pipToMcp, 0.001);

	// Curl angle: vectors MCP→PIP and PIP→TIP
	const v1x = landmarks[pip].x - landmarks[mcp].x;
	const v1y = landmarks[pip].y - landmarks[mcp].y;
	const v1z = landmarks[pip].z - landmarks[mcp].z;
	const v2x = landmarks[tip].x - landmarks[pip].x;
	const v2y = landmarks[tip].y - landmarks[pip].y;
	const v2z = landmarks[tip].z - landmarks[pip].z;
	const dot = v1x * v2x + v1y * v2y + v1z * v2z;
	const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
	const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
	const cosAngle = dot / Math.max(mag1 * mag2, 0.0001);
	// cosAngle > ~0 means angle < 90° (curled), cosAngle < ~-0.5 means angle > 120° (straight)

	// Finger is extended if: tip is far enough AND angle is relatively straight
	return distRatio > 1.4 && cosAngle > -0.1;
}

/** Curl detection: finger is tightly curled when tip is very close to MCP. */
function isFingerCurled(
	landmarks: NormalizedLandmark[],
	tip: number, mcp: number,
	handScale: number,
): boolean {
	return dist(landmarks[tip], landmarks[mcp]) / handScale < 0.65;
}

function isThumbExtended(landmarks: NormalizedLandmark[]): boolean {
	// Use angle-based check: CMC(1)→MCP(2)→IP(3)→TIP(4)
	// Check if thumb tip is far from index MCP (landmark 5) relative to hand scale
	const handScale = getHandScale(landmarks);
	const tipToIndexMcp = dist(landmarks[4], landmarks[5]);

	// Also check curl angle of thumb: vectors (2→3) and (3→4)
	const v1x = landmarks[3].x - landmarks[2].x;
	const v1y = landmarks[3].y - landmarks[2].y;
	const v1z = landmarks[3].z - landmarks[2].z;
	const v2x = landmarks[4].x - landmarks[3].x;
	const v2y = landmarks[4].y - landmarks[3].y;
	const v2z = landmarks[4].z - landmarks[3].z;
	const dot = v1x * v2x + v1y * v2y + v1z * v2z;
	const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
	const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
	const cosAngle = dot / Math.max(mag1 * mag2, 0.0001);

	return tipToIndexMcp / handScale > 0.6 && cosAngle > -0.2;
}

function isThumbCurled(landmarks: NormalizedLandmark[]): boolean {
	const handScale = getHandScale(landmarks);
	// Thumb is curled when tip (4) is close to index MCP (5) or palm center (9)
	const tipToIndexMcp = dist(landmarks[4], landmarks[5]);
	const tipToPalm = dist(landmarks[4], landmarks[9]);
	return Math.min(tipToIndexMcp, tipToPalm) / handScale < 0.55;
}

function getExtendedFingerCount(landmarks: NormalizedLandmark[]): number {
	let count = 0;
	if (isThumbExtended(landmarks)) count++;
	if (isFingerExtended(landmarks, 8, 6, 5)) count++;   // index
	if (isFingerExtended(landmarks, 12, 10, 9)) count++;  // middle
	if (isFingerExtended(landmarks, 16, 14, 13)) count++;  // ring
	if (isFingerExtended(landmarks, 20, 18, 17)) count++;  // pinky
	return count;
}

function getPinchDistance(landmarks: NormalizedLandmark[]): number {
	return dist(landmarks[4], landmarks[8]);
}

/** Normalize pinch distance by hand scale so it works at any camera distance. */
function getNormalizedPinchDistance(landmarks: NormalizedLandmark[]): number {
	return getPinchDistance(landmarks) / getHandScale(landmarks);
}

// ── Gesture stabilization ──────────────────────────────────────────────────
// Require STABILITY_FRAMES consecutive frames of the same gesture before switching.
// This prevents flickering between gestures due to single-frame noise.
const STABILITY_FRAMES = 3;

let gestureBuffer: GestureType[] = [];

function stabilizeGesture(rawGesture: GestureType, prevStable: GestureType): GestureType {
	gestureBuffer.push(rawGesture);
	if (gestureBuffer.length > STABILITY_FRAMES) {
		gestureBuffer = gestureBuffer.slice(-STABILITY_FRAMES);
	}

	// All recent frames must agree to switch
	if (gestureBuffer.length >= STABILITY_FRAMES &&
		gestureBuffer.every((g) => g === rawGesture)) {
		return rawGesture;
	}

	return prevStable;
}

function classifyGestureRaw(landmarks: NormalizedLandmark[]): GestureType {
	const handScale = getHandScale(landmarks);
	const indexUp = isFingerExtended(landmarks, 8, 6, 5);
	const middleUp = isFingerExtended(landmarks, 12, 10, 9);
	const ringUp = isFingerExtended(landmarks, 16, 14, 13);
	const pinkyUp = isFingerExtended(landmarks, 20, 18, 17);
	const normalizedPinch = getNormalizedPinchDistance(landmarks);
	const extendedCount = getExtendedFingerCount(landmarks);

	// Pinch: thumb and index tips very close → zoom
	if (normalizedPinch < 0.28) {
		return "zoom";
	}

	// Open palm: 4+ fingers extended → pan mode
	if (extendedCount >= 4 && indexUp && middleUp && ringUp) {
		return "pan";
	}

	// Index + middle up, ring + pinky down → scroll
	if (indexUp && middleUp && !ringUp && !pinkyUp) {
		return "scroll";
	}

	// Index finger only → pointer/cursor mode (dwell-click handled in detectLoop)
	if (indexUp && !middleUp && !ringUp && !pinkyUp) {
		return "pointer";
	}

	// Fist: all four fingers curled AND thumb curled
	if (isFingerCurled(landmarks, 8, 5, handScale) &&
		isFingerCurled(landmarks, 12, 9, handScale) &&
		isFingerCurled(landmarks, 16, 13, handScale) &&
		isFingerCurled(landmarks, 20, 17, handScale) &&
		isThumbCurled(landmarks)) {
		return "fist";
	}

	return "none";
}

// ── Smoothing helper ────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

// ── Main hook ───────────────────────────────────────────────────────────────
export function useHandTracking(enabled: boolean) {
	const [handState, setHandState] = useState<HandState>({
		gesture: "none",
		cursorX: 0.5,
		cursorY: 0.5,
		landmarks: null,
		detecting: false,
		zoomDelta: 0,
		panDeltaX: 0,
		panDeltaY: 0,
		clickTriggered: false,
		dwellProgress: 0,
		scrollDelta: 0,
		grabProgress: 0,
	});

	const handLandmarkerRef = useRef<HandLandmarker | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const animFrameRef = useRef<number>(0);
	const prevGestureRef = useRef<GestureType>("none");
	const prevCursorRef = useRef({ x: 0.5, y: 0.5 });
	const prevPanRef = useRef({ x: 0.5, y: 0.5 });
	const prevPinchDistRef = useRef(0);
	const prevScrollYRef = useRef(0.5);
	const clickCooldownRef = useRef(false);
	const lastDetectTimeRef = useRef(0);
	const streamRef = useRef<MediaStream | null>(null);
	// Dwell-click state
	const dwellStartTimeRef = useRef(0);
	const dwellAnchorRef = useRef({ x: 0, y: 0 });
	// Grab state (open palm hold)
	const grabStartTimeRef = useRef(0);

	const initHandLandmarker = useCallback(async () => {
		try {
			const vision = await FilesetResolver.forVisionTasks(
				"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
			);
			const handLandmarker = await HandLandmarker.createFromOptions(vision, {
				baseOptions: {
					modelAssetPath:
						"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
					delegate: "GPU",
				},
				runningMode: "VIDEO",
				numHands: 2,
				minHandDetectionConfidence: 0.6,
				minTrackingConfidence: 0.6,
			});
			handLandmarkerRef.current = handLandmarker;
		} catch (err) {
			console.error("Failed to init HandLandmarker:", err);
		}
	}, []);

	const startCamera = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { width: 640, height: 480, facingMode: "user" },
			});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}
		} catch (err) {
			console.error("Failed to start camera:", err);
		}
	}, []);

	const stopCamera = useCallback(() => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
		}
		if (videoRef.current) {
			videoRef.current.srcObject = null;
		}
	}, []);

	const detectLoop = useCallback(() => {
		const video = videoRef.current;
		const landmarker = handLandmarkerRef.current;

		if (!video || !landmarker || video.readyState < 2) {
			animFrameRef.current = requestAnimationFrame(detectLoop);
			return;
		}

		const now = performance.now();
		// Throttle to ~30fps
		if (now - lastDetectTimeRef.current < 33) {
			animFrameRef.current = requestAnimationFrame(detectLoop);
			return;
		}
		lastDetectTimeRef.current = now;

		const results = landmarker.detectForVideo(video, now);

		if (results.landmarks && results.landmarks.length > 0) {
			const primaryHand = results.landmarks[0];
			const rawGesture = classifyGestureRaw(primaryHand);
			const gesture = stabilizeGesture(rawGesture, prevGestureRef.current);

			// Index finger tip (landmark 8) as cursor position
			// Mirror X because webcam is mirrored
			const rawX = 1 - primaryHand[8].x;
			const rawY = primaryHand[8].y;

			// Velocity-adaptive cursor smoothing:
			// Fast hand movement → less smoothing (responsive)
			// Slow/still hand → more smoothing (stable, no jitter)
			const velocity = Math.sqrt(
				(rawX - prevCursorRef.current.x) ** 2 +
				(rawY - prevCursorRef.current.y) ** 2,
			);
			const smoothing = velocity > 0.08 ? 0.55 : velocity > 0.03 ? 0.35 : 0.18;
			const cx = lerp(prevCursorRef.current.x, rawX, smoothing);
			const cy = lerp(prevCursorRef.current.y, rawY, smoothing);
			prevCursorRef.current = { x: cx, y: cy };

			// Dead zone threshold — ignore deltas below this to kill tremor noise
			const DEAD_ZONE = 0.002;

			// Calculate deltas for pan
			let panDX = 0;
			let panDY = 0;
			if (gesture === "pan" && prevGestureRef.current === "pan") {
				// Use palm center (landmark 9) for pan
				const palmX = 1 - primaryHand[9].x;
				const palmY = primaryHand[9].y;
				const rawDX = palmX - prevPanRef.current.x;
				const rawDY = palmY - prevPanRef.current.y;
				panDX = Math.abs(rawDX) > DEAD_ZONE ? rawDX * 1800 : 0;
				panDY = Math.abs(rawDY) > DEAD_ZONE ? rawDY * 1800 : 0;
				prevPanRef.current = { x: palmX, y: palmY };
			} else {
				prevPanRef.current = { x: 1 - primaryHand[9].x, y: primaryHand[9].y };
			}

			// Calculate zoom delta via pinch distance change
			let zoomDelta = 0;
			const currentPinchDist = getNormalizedPinchDistance(primaryHand);
			if (gesture === "zoom" && prevGestureRef.current === "zoom") {
				const rawDelta = currentPinchDist - prevPinchDistRef.current;
				zoomDelta = Math.abs(rawDelta) > DEAD_ZONE ? rawDelta * 8 : 0;
			}
			prevPinchDistRef.current = currentPinchDist;

			// Calculate scroll delta (index tip Y movement when 2 fingers up)
			let scrollDelta = 0;
			if (gesture === "scroll" && prevGestureRef.current === "scroll") {
				const idxY = primaryHand[8].y;
				const rawDelta = (prevScrollYRef.current - idxY);
				scrollDelta = Math.abs(rawDelta) > DEAD_ZONE ? rawDelta * 8 : 0;
				prevScrollYRef.current = idxY;
			} else {
				prevScrollYRef.current = primaryHand[8].y;
			}

			// Grab progress: open palm held for 1 second to grab/select a node
			let grabProgress = 0;
			const GRAB_TIME = 1000;
			if (gesture === "pan") {
				if (prevGestureRef.current !== "pan") {
					grabStartTimeRef.current = now;
				}
				grabProgress = Math.min((now - grabStartTimeRef.current) / GRAB_TIME, 1);
			} else {
				grabStartTimeRef.current = 0;
			}

			// Dwell-click: index pointer held still for 800ms triggers click
			let clickTriggered = false;
			let dwellProgress = 0;
			const DWELL_TIME = 800;
			const DWELL_RADIUS = 0.025; // max cursor drift allowed during dwell

			if (gesture === "pointer") {
				const driftX = cx - dwellAnchorRef.current.x;
				const driftY = cy - dwellAnchorRef.current.y;
				const drift = Math.sqrt(driftX * driftX + driftY * driftY);

				if (prevGestureRef.current !== "pointer" || drift > DWELL_RADIUS) {
					// Reset dwell — just entered pointer or moved too far
					dwellStartTimeRef.current = now;
					dwellAnchorRef.current = { x: cx, y: cy };
				} else {
					// Accumulate dwell time
					const elapsed = now - dwellStartTimeRef.current;
					dwellProgress = Math.min(elapsed / DWELL_TIME, 1);

					if (elapsed >= DWELL_TIME && !clickCooldownRef.current) {
						clickTriggered = true;
						clickCooldownRef.current = true;
						dwellStartTimeRef.current = now; // reset for next dwell
						dwellAnchorRef.current = { x: cx, y: cy };
						setTimeout(() => {
							clickCooldownRef.current = false;
						}, 400);
					}
				}
			} else {
				// Not pointer — reset dwell
				dwellStartTimeRef.current = 0;
			}

			prevGestureRef.current = gesture;

			setHandState({
				gesture,
				cursorX: cx,
				cursorY: cy,
				landmarks: results.landmarks,
				detecting: true,
				zoomDelta,
				panDeltaX: panDX,
				panDeltaY: panDY,
				clickTriggered,
				dwellProgress,
				scrollDelta,
				grabProgress,
			});
		} else {
			prevGestureRef.current = "none";
			gestureBuffer = [];
			setHandState((prev) => ({
				...prev,
				gesture: "none",
				landmarks: null,
				detecting: false,
				zoomDelta: 0,
				panDeltaX: 0,
				panDeltaY: 0,
				clickTriggered: false,
				dwellProgress: 0,
				scrollDelta: 0,
				grabProgress: 0,
			}));
		}

		animFrameRef.current = requestAnimationFrame(detectLoop);
	}, []);

	useEffect(() => {
		if (enabled) {
			(async () => {
				await initHandLandmarker();
				await startCamera();
				animFrameRef.current = requestAnimationFrame(detectLoop);
			})();
		}

		return () => {
			cancelAnimationFrame(animFrameRef.current);
			stopCamera();
			if (handLandmarkerRef.current) {
				handLandmarkerRef.current.close();
				handLandmarkerRef.current = null;
			}
		};
	}, [enabled, initHandLandmarker, startCamera, stopCamera, detectLoop]);

	return { handState, videoRef, canvasRef };
}

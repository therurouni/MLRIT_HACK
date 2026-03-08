import { useEffect, useRef, useState } from "react";
import { getUmapData } from "../api";
import type { UmapPoint } from "../types";

const CLUSTER_COLORS = [
	"#3b82f6",
	"#22c55e",
	"#a855f7",
	"#f97316",
	"#ec4899",
	"#06b6d4",
	"#eab308",
	"#ef4444",
	"#6366f1",
	"#14b8a6",
	"#f43f5e",
	"#84cc16",
	"#8b5cf6",
	"#0ea5e9",
	"#d946ef",
];

const UNCLUSTERED_COLOR = "#4b5563";

function getColor(label: number): string {
	if (label < 0) return UNCLUSTERED_COLOR;
	return CLUSTER_COLORS[label % CLUSTER_COLORS.length];
}

export default function UmapView() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [points, setPoints] = useState<UmapPoint[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hoveredPoint, setHoveredPoint] = useState<UmapPoint | null>(null);

	const loadData = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getUmapData();
			setPoints(data.points || []);
		} catch (e: any) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const drawCanvas = () => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container || points.length === 0) return;

		const width = container.clientWidth;
		const height = container.clientHeight;
		canvas.width = width * window.devicePixelRatio;
		canvas.height = height * window.devicePixelRatio;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

		// Clear
		ctx.fillStyle = "#0f172a";
		ctx.fillRect(0, 0, width, height);

		// Compute bounds
		const padding = 60;
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;

		const scaleX = (v: number) =>
			padding + ((v - minX) / rangeX) * (width - 2 * padding);
		const scaleY = (v: number) =>
			padding + ((v - minY) / rangeY) * (height - 2 * padding);

		// Draw points
		for (const p of points) {
			const px = scaleX(p.x);
			const py = scaleY(p.y);
			const color = getColor(p.cluster_label);

			ctx.beginPath();
			ctx.arc(px, py, 6, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Label
			ctx.fillStyle = "#94a3b8";
			ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
			ctx.fillText(p.filename, px + 10, py + 4);
		}
	};

	useEffect(() => {
		drawCanvas();
		const resizeHandler = () => drawCanvas();
		window.addEventListener("resize", resizeHandler);
		return () => window.removeEventListener("resize", resizeHandler);
	}, [points]);

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container || points.length === 0) return;

		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const width = container.clientWidth;
		const height = container.clientHeight;

		const padding = 60;
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;

		const scaleX = (v: number) =>
			padding + ((v - minX) / rangeX) * (width - 2 * padding);
		const scaleY = (v: number) =>
			padding + ((v - minY) / rangeY) * (height - 2 * padding);

		let closest: UmapPoint | null = null;
		let minDist = Infinity;
		for (const p of points) {
			const dx = scaleX(p.x) - mx;
			const dy = scaleY(p.y) - my;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < 20 && dist < minDist) {
				minDist = dist;
				closest = p;
			}
		}
		setHoveredPoint(closest);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-claude-muted">
				<div className="text-center">
					<div className="text-4xl mb-2 animate-spin text-claude-accent">*</div>
					<p>Loading UMAP projection...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-claude-error">
				<p>{error}</p>
				<button
					onClick={loadData}
					className="ml-4 px-4 py-2 bg-claude-accent text-white rounded">
					Retry
				</button>
			</div>
		);
	}

	if (points.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-claude-muted">
				<div className="text-4xl mb-4 text-claude-muted font-bold">--</div>
				<h2 className="text-xl font-semibold mb-2">No UMAP data</h2>
				<p className="text-sm">
					Run clustering to generate the 2D UMAP projection.
				</p>
				<button
					onClick={loadData}
					className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover">
					Refresh
				</button>
			</div>
		);
	}

	// Build legend
	const clusterLabels = [...new Set(points.map((p) => p.cluster_label))].sort(
		(a, b) => a - b,
	);

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-2">
				<h2 className="text-lg font-semibold">UMAP Spatial View</h2>
				<div className="flex items-center gap-3">
					{clusterLabels.map((label) => {
						const name =
							points.find((p) => p.cluster_label === label)?.cluster_name ||
							`Cluster ${label}`;
						return (
							<span
								key={label}
								className="flex items-center gap-1 text-xs text-claude-muted">
								<span
									className="w-3 h-3 rounded-full inline-block"
									style={{ backgroundColor: getColor(label) }}
								/>
								{label < 0 ? "Unclustered" : name}
							</span>
						);
					})}
					<button
						onClick={loadData}
						className="ml-2 px-3 py-1 text-xs bg-claude-surface border border-claude-border rounded hover:border-claude-accent">
						Refresh
					</button>
				</div>
			</div>
			<div
				ref={containerRef}
				className="flex-1 bg-claude-bg rounded-lg border border-claude-border overflow-hidden relative">
				<canvas
					ref={canvasRef}
					onMouseMove={handleMouseMove}
					className="w-full h-full"
				/>
				{hoveredPoint && (
					<div className="absolute bottom-4 left-4 bg-claude-surface border border-claude-border rounded-lg px-3 py-2 text-sm">
						<div className="font-semibold">{hoveredPoint.filename}</div>
						<div className="text-xs text-claude-muted">
							Cluster:{" "}
							{hoveredPoint.cluster_name || `#${hoveredPoint.cluster_label}`}
						</div>
						<div className="text-xs text-claude-muted">
							Position: ({hoveredPoint.x.toFixed(2)},{" "}
							{hoveredPoint.y.toFixed(2)})
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

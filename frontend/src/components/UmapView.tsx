import { useEffect, useRef, useState } from "react";
import { getUmapData, getFileById, openFile } from "../api";
import type { UmapPoint, FileRecord } from "../types";

const CLUSTER_COLORS = [
	"#D97757",
	"#3b82f6",
	"#22c55e",
	"#a855f7",
	"#ec4899",
	"#eab308",
	"#06b6d4",
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
	const [hoveredFileSummary, setHoveredFileSummary] = useState<string | null>(null);
	const fetchTimeoutRef = useRef<number | null>(null);

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

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (fetchTimeoutRef.current) {
				clearTimeout(fetchTimeoutRef.current);
			}
		};
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
		
		// Clear previous timeout
		if (fetchTimeoutRef.current) {
			clearTimeout(fetchTimeoutRef.current);
		}
		
		setHoveredPoint(closest);
		
		// Fetch file details if hovering over a point
		if (closest) {
			fetchTimeoutRef.current = window.setTimeout(async () => {
				try {
					const fileData: FileRecord = await getFileById(closest.file_id);
					const summary = fileData.content_preview || "No preview available";
					const truncatedSummary = summary.length > 200 ? summary.substring(0, 200) + "..." : summary;
					setHoveredFileSummary(truncatedSummary);
				} catch (error) {
					console.error("Failed to fetch file details:", error);
					setHoveredFileSummary(null);
				}
			}, 200);
		} else {
			setHoveredFileSummary(null);
		}
	};

	const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
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

		// Find clicked point
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

		// Open file if clicked
		if (closest) {
			try {
				await openFile(closest.file_id);
			} catch (error) {
				console.error("Failed to open file:", error);
			}
		}
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
		<div className="h-full relative">
			<div
				ref={containerRef}
				className="w-full h-full bg-claude-bg overflow-hidden">
				<canvas
					ref={canvasRef}
					onMouseMove={handleMouseMove}
					onClick={handleCanvasClick}
					className="w-full h-full cursor-pointer"
				/>
			</div>

			{/* Cluster legend - bottom left */}
			<div className="absolute bottom-4 left-4 bg-claude-surface/90 backdrop-blur-sm border border-claude-border rounded-lg p-3 max-w-[220px]">
				<div className="text-[11px] font-medium text-claude-muted uppercase tracking-wider mb-2">
					Clusters
				</div>
				<div className="space-y-1.5">
					{clusterLabels.map((label) => {
						const name =
							points.find((p) => p.cluster_label === label)?.cluster_name ||
							`Cluster ${label}`;
						const count = points.filter(
							(p) => p.cluster_label === label,
						).length;
						return (
							<div key={label} className="flex items-center gap-2">
								<span
									className="w-2.5 h-2.5 rounded-full shrink-0"
									style={{ backgroundColor: getColor(label) }}
								/>
								<span className="text-xs text-claude-text truncate flex-1">
									{label < 0 ? "Unclustered" : name}
								</span>
								<span className="text-[10px] text-claude-muted">
									({count})
								</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Hovered point tooltip */}
			{hoveredPoint && (
				<div className="absolute top-4 left-4 bg-claude-surface/95 backdrop-blur-sm border border-claude-border rounded-lg px-3 py-2 max-w-[320px]">
					<div className="text-sm font-semibold text-claude-text break-words">
						{hoveredPoint.filename}
					</div>
					<div className="text-xs text-claude-muted mt-0.5">
						Cluster:{" "}
						{hoveredPoint.cluster_name ||
							`#${hoveredPoint.cluster_label}`}
					</div>
					{hoveredFileSummary && (
						<div className="text-xs text-claude-muted mt-2 pt-2 border-t border-claude-border leading-relaxed">
							{hoveredFileSummary}
						</div>
					)}
					<div className="mt-2 pt-2 border-t border-claude-border text-[10px] text-claude-muted">
						Click to open file
					</div>
				</div>
			)}

			{/* Refresh button */}
			<div className="absolute top-4 right-4">
				<button
					onClick={loadData}
					className="px-3 py-1.5 text-xs bg-claude-surface/90 backdrop-blur-sm border border-claude-border rounded-lg text-claude-muted hover:text-claude-text hover:border-claude-accent transition-colors">
					Refresh
				</button>
			</div>
		</div>
	);
}

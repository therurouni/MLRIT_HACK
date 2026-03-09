import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { Delaunay } from "d3-delaunay";
import { getGraphData, getFiles } from "../api";
import type { FileRecord } from "../types";
import { getThemeColors } from "../theme";

// ─── Color palette (matches app theme) ───────────────────────────────────────
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

function getClusterColor(clusterId: number): string {
	if (clusterId < 0) return "#4b5563";
	return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

function getFileIcon(fileType: string): string {
	const t = (fileType || "").toLowerCase().replace(".", "");
	if (t === "pdf") return "📄";
	if (["doc", "docx"].includes(t)) return "📝";
	if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(t)) return "🖼️";
	if (["mp4", "mov", "avi"].includes(t)) return "🎬";
	if (["mp3", "wav", "flac"].includes(t)) return "🎵";
	if (["zip", "tar", "gz", "7z"].includes(t)) return "🗜️";
	if (["js", "ts", "tsx", "jsx", "py", "java", "cs", "cpp", "c", "go", "rs", "swift", "kt", "dart", "scala", "rb"].includes(t)) return "💻";
	if (["html", "css", "scss", "vue"].includes(t)) return "🌐";
	if (["json", "yaml", "yml", "xml", "toml"].includes(t)) return "⚙️";
	if (["txt", "md"].includes(t)) return "📃";
	if (["csv", "xlsx", "xls"].includes(t)) return "📊";
	return "📁";
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SEFSFile {
	id: number;
	filename: string;
	cluster_id: number;
	file_type?: string;
	summary?: string;
}

interface PositionedFile {
	x: number;
	y: number;
	file: SEFSFile;
}

interface SpatialData {
	clusters: { id: number; label: number; name: string }[];
	files: SEFSFile[];
}

interface Props {
	onNodeClick: (fileId: number, clusterId: number) => void;
	searchQuery: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SpatialView({ onNodeClick, searchQuery }: Props) {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [tooltip, setTooltip] = useState<{
		x: number;
		y: number;
		file: SEFSFile;
	} | null>(null);
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState<SpatialData | null>(null);

	// ── Fetch graph + files data ──────────────────────────────────────────────
	useEffect(() => {
		setLoading(true);
		Promise.all([getGraphData(), getFiles()])
			.then(([graphData, filesData]) => {
				const files: SEFSFile[] = (filesData.files as FileRecord[])
					.filter((f) => f.cluster_id !== null && f.cluster_id >= 0)
					.map((f) => ({
						id: f.id,
						filename: f.filename,
						cluster_id: f.cluster_id as number,
						file_type: f.extension,
						summary: f.content_preview || undefined,
					}));
				setData({ clusters: graphData.clusters, files });
			})
			.catch(() => {/* silently fail, loading state handles UI */})
			.finally(() => setLoading(false));
	}, []);

	// ── D3 rendering ─────────────────────────────────────────────────────────
	useEffect(() => {
		if (!data || !svgRef.current || !containerRef.current) return;

		const container = containerRef.current;
		const width = container.clientWidth;
		const height = container.clientHeight;
		const svg = d3.select(svgRef.current);

		svg.selectAll("*").remove();
		svg.attr("width", width).attr("height", height);

		const theme = getThemeColors();
		const bg = theme.bg;
		const textColor = theme.text2;
		const borderColor = theme.border;

		// Single container group for zoom/pan
		const containerG = svg.append("g").attr("class", "zoom-container");

		// ── Position files in cluster grid cells ─────────────────────────────
		const clusters = data.clusters;
		const cols = Math.ceil(Math.sqrt(clusters.length));
		const rows = Math.ceil(clusters.length / cols);
		const cellW = width / cols;
		const cellH = height / rows;

		const positioned: PositionedFile[] = [];

		clusters.forEach((cluster, ci) => {
			const col = ci % cols;
			const row = Math.floor(ci / cols);
			const cx = col * cellW + cellW / 2;
			const cy = row * cellH + cellH / 2;

			const clusterFiles = data.files.filter((f) => f.cluster_id === cluster.label);
			const angleStep = (2 * Math.PI) / Math.max(clusterFiles.length, 1);
			const radius = Math.min(cellW, cellH) * 0.3;

			clusterFiles.forEach((file, fi) => {
				const angle = angleStep * fi - Math.PI / 2;
				const r = radius * (0.4 + 0.6 * Math.random());
				positioned.push({
					x: cx + Math.cos(angle) * r,
					y: cy + Math.sin(angle) * r,
					file,
				});
			});
		});

		// ── Voronoi background cells ─────────────────────────────────────────
		if (positioned.length > 2) {
			const delaunay = Delaunay.from(
				positioned,
				(d) => d.x,
				(d) => d.y,
			);
			const voronoi = delaunay.voronoi([0, 0, width, height]);
			const voronoiGroup = containerG.append("g").attr("class", "voronoi");

			positioned.forEach((p, i) => {
				const color = getClusterColor(p.file.cluster_id);
				const cellPath = voronoi.renderCell(i);
				voronoiGroup
					.append("path")
					.attr("d", cellPath)
					.attr("fill", color)
					.attr("fill-opacity", 0.06)
					.attr("stroke", borderColor)
					.attr("stroke-width", 0.8);
			});
		}

		// ── Cluster boundary guides (subtle dashed rect per cell) ────────────
		const guidesGroup = containerG.append("g").attr("class", "guides");
		clusters.forEach((_cluster, ci) => {
			const col = ci % cols;
			const row = Math.floor(ci / cols);
			guidesGroup
				.append("rect")
				.attr("x", col * cellW + 4)
				.attr("y", row * cellH + 4)
				.attr("width", cellW - 8)
				.attr("height", cellH - 8)
				.attr("rx", 12)
				.attr("fill", "none")
				.attr("stroke", borderColor)
				.attr("stroke-width", 1)
				.attr("stroke-dasharray", "4,6");
		});

		// ── Cluster labels ───────────────────────────────────────────────────
		const clusterLabelGroup = containerG
			.append("g")
			.attr("class", "cluster-labels");

		clusters.forEach((cluster, ci) => {
			const col = ci % cols;
			const row = Math.floor(ci / cols);
			const cx = col * cellW + cellW / 2;
			const cy = row * cellH + 28;

			const label = cluster.name.replace(/_/g, " ");

			// Measure text to size background rect
			const tempText = clusterLabelGroup
				.append("text")
				.attr("font-size", "13px")
				.attr("font-weight", "600")
				.attr("font-family", "JetBrains Mono, monospace")
				.text(label);
			const bbox = (tempText.node() as SVGTextElement).getBBox();
			tempText.remove();

			const padX = 12;
			const padY = 5;

			clusterLabelGroup
				.append("rect")
				.attr("x", cx - bbox.width / 2 - padX)
				.attr("y", cy - bbox.height / 2 - padY)
				.attr("width", bbox.width + padX * 2)
				.attr("height", bbox.height + padY * 2)
				.attr("rx", 7)
				.attr("fill", bg)
				.attr("fill-opacity", 0.95)
				.attr("stroke", getClusterColor(cluster.label))
				.attr("stroke-width", 1.5)
				.attr("stroke-opacity", 0.5);

			clusterLabelGroup
				.append("text")
				.attr("x", cx)
				.attr("y", cy + 1)
				.attr("text-anchor", "middle")
				.attr("dominant-baseline", "middle")
				.attr("font-size", "13px")
				.attr("font-weight", "600")
				.attr("font-family", "JetBrains Mono, monospace")
				.attr("fill", getClusterColor(cluster.label))
				.text(label);
		});

		// ── File nodes ───────────────────────────────────────────────────────
		const nodesGroup = containerG.append("g").attr("class", "nodes");

		const matchesSearch = (label: string) => {
			if (!searchQuery) return true;
			return label.toLowerCase().includes(searchQuery.toLowerCase());
		};

		positioned.forEach((p) => {
			const color = getClusterColor(p.file.cluster_id);
			const matches = matchesSearch(p.file.filename);
			const opacity = matches ? 1 : 0.12;

			const g = nodesGroup
				.append("g")
				.attr("transform", `translate(${p.x},${p.y})`)
				.attr("opacity", opacity)
				.style("cursor", "pointer")
				.on("click", () => onNodeClick(p.file.id, p.file.cluster_id))
				.on("mouseenter", (event: MouseEvent) => {
					setTooltip({ x: event.clientX, y: event.clientY, file: p.file });
					d3.select(event.currentTarget as SVGGElement)
						.select("circle")
						.attr("r", 7)
						.attr("filter", "url(#glow)");
				})
				.on("mouseleave", (event: MouseEvent) => {
					setTooltip(null);
					d3.select(event.currentTarget as SVGGElement)
						.select("circle")
						.attr("r", 5)
						.attr("filter", null);
				});

			// Circle dot
			g.append("circle")
				.attr("r", 5)
				.attr("fill", color)
				.attr("stroke", bg)
				.attr("stroke-width", 1.5);

			// Filename label with background pill
			const label = p.file.filename;
			const fontSize = 9;

			const tmpText = g
				.append("text")
				.attr("font-size", `${fontSize}px`)
				.attr("font-family", "JetBrains Mono, monospace")
				.text(label);
			const textBBox = (tmpText.node() as SVGTextElement).getBBox();
			tmpText.remove();

			const lPadX = 4;
			const lPadY = 2;

			g.append("rect")
				.attr("x", -textBBox.width / 2 - lPadX)
				.attr("y", 9 - lPadY)
				.attr("width", textBBox.width + lPadX * 2)
				.attr("height", textBBox.height + lPadY * 2)
				.attr("rx", 3)
				.attr("fill", bg)
				.attr("fill-opacity", 0.85);

			g.append("text")
				.attr("y", 9 + fontSize)
				.attr("text-anchor", "middle")
				.attr("font-size", `${fontSize}px`)
				.attr("font-family", "JetBrains Mono, monospace")
				.attr("fill", textColor)
				.text(label);
		});

		// ── Glow filter for hover ─────────────────────────────────────────────
		const defs = svg.append("defs");
		const filter = defs.append("filter").attr("id", "glow");
		filter
			.append("feGaussianBlur")
			.attr("stdDeviation", "3")
			.attr("result", "coloredBlur");
		const feMerge = filter.append("feMerge");
		feMerge.append("feMergeNode").attr("in", "coloredBlur");
		feMerge.append("feMergeNode").attr("in", "SourceGraphic");

		// ── Zoom / pan ────────────────────────────────────────────────────────
		const zoomBehavior = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.2, 10])
			.on("zoom", (event) => {
				containerG.attr("transform", event.transform.toString());
			});

		svg.call(zoomBehavior);
		svg.call(zoomBehavior.transform, d3.zoomIdentity);
	}, [data, searchQuery, onNodeClick]);

	// ─────────────────────────────────────────────────────────────────────────
	return (
		<div ref={containerRef} className="w-full h-full relative bg-claude-bg">
			<svg ref={svgRef} className="w-full h-full" />

			{/* Loading overlay */}
			{loading && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="text-claude-muted text-sm font-mono animate-pulse">
						Building spatial map…
					</div>
				</div>
			)}

			{/* Empty state */}
			{!loading && data && data.files.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="text-claude-muted text-sm font-mono">
						No clustered files found. Run a scan first.
					</div>
				</div>
			)}

			{/* Hover tooltip */}
			{tooltip && (
				<div
					className="fixed z-50 pointer-events-none bg-claude-panel border border-claude-border rounded-lg shadow-xl px-3 py-2 text-xs max-w-xs"
					style={{
						left: tooltip.x + 14,
						top: tooltip.y - 10,
					}}
				>
					<div className="font-semibold text-claude-text truncate max-w-[220px]">
						{tooltip.file.filename}
					</div>
					<div className="text-claude-muted mt-0.5 flex items-center gap-1">
						<span>{getFileIcon(tooltip.file.file_type || "")}</span>
						<span className="uppercase tracking-wider text-[10px]">
							{tooltip.file.file_type || "file"}
						</span>
					</div>
					{tooltip.file.summary && (
						<div className="text-claude-text-2 mt-1.5 leading-relaxed line-clamp-3">
							{tooltip.file.summary}
						</div>
					)}
				</div>
			)}

			{/* Zoom hint */}
			{!loading && data && data.files.length > 0 && (
				<div className="absolute bottom-3 right-3 text-[10px] text-claude-muted font-mono bg-claude-panel/80 px-2 py-1 rounded-md border border-claude-border/50 pointer-events-none">
					scroll to zoom · drag to pan · click node to open
				</div>
			)}
		</div>
	);
}

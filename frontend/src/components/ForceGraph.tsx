import { useEffect, useRef, useState, useCallback } from "react";
import { getGraphData, getFileById } from "../api";
import * as d3 from "d3";
import type { GraphNode, GraphLink, GraphData, FileRecord } from "../types";
import { getThemeColors } from "../theme";

// Warm color palette matching the reference image
const CLUSTER_COLORS = [
	"#D97757", // warm orange (primary/accent)
	"#3b82f6", // blue
	"#22c55e", // green
	"#a855f7", // purple
	"#ec4899", // pink
	"#eab308", // yellow
	"#06b6d4", // cyan
	"#ef4444", // red
	"#6366f1", // indigo
	"#14b8a6", // teal
	"#f43f5e", // rose
	"#84cc16", // lime
	"#8b5cf6", // violet
	"#0ea5e9", // sky
	"#d946ef", // fuchsia
];

const UNCLUSTERED_COLOR = "#4b5563";

function getColor(clusterId: number): string {
	if (clusterId < 0) return UNCLUSTERED_COLOR;
	return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

interface ForceGraphProps {
	onNodeClick?: (nodeId: number, clusterId: number) => void;
	onClusterClick?: (clusterId: number, clusterName: string, childNodes: { id: number; label: string }[]) => void;
	selectedNodeId?: number | null;
}

interface ClusterCenter {
	id: string;
	label: string;
	cluster_id: number;
	cluster_name: string;
	isCenter: true;
	fileCount: number;
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
}

type SimNode = (GraphNode & { isCenter?: false }) | ClusterCenter;

export default function ForceGraph({ onNodeClick, onClusterClick, selectedNodeId }: ForceGraphProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [loading, setLoading] = useState(false);
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [zoomLevel, setZoomLevel] = useState(1);
	const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	
	// Tooltip state
	const [tooltip, setTooltip] = useState<{
		visible: boolean;
		x: number;
		y: number;
		content: string;
		title: string;
		isCluster: boolean;
	}>({
		visible: false,
		x: 0,
		y: 0,
		content: "",
		title: "",
		isCluster: false,
	});
	const tooltipTimeoutRef = useRef<number | null>(null);

	const loadGraph = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getGraphData();
			setGraphData(data);
		} catch (e: any) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	};

	// Function to show tooltip
	const showTooltip = async (event: any, d: SimNode) => {
		// Clear any existing timeout
		if (tooltipTimeoutRef.current) {
			clearTimeout(tooltipTimeoutRef.current);
		}

		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return;

		if (d.isCenter) {
			// Show cluster summary
			const centerNode = d as ClusterCenter;
			setTooltip({
				visible: true,
				x: event.pageX - rect.left + 15,
				y: event.pageY - rect.top + 15,
				title: centerNode.cluster_name,
				content: `Cluster containing ${centerNode.fileCount} file${centerNode.fileCount !== 1 ? 's' : ''}`,
				isCluster: true,
			});
		} else {
			// Show file summary - fetch file details
			const fileNode = d as GraphNode;
			try {
				const fileData: FileRecord = await getFileById(fileNode.id);
				const summary = fileData.content_preview || "No preview available";
				const truncatedSummary = summary.length > 300 ? summary.substring(0, 300) + "..." : summary;
				
				setTooltip({
					visible: true,
					x: event.pageX - rect.left + 15,
					y: event.pageY - rect.top + 15,
					title: fileNode.label,
					content: truncatedSummary,
					isCluster: false,
				});
			} catch (error) {
				console.error("Failed to fetch file details:", error);
			}
		}
	};

	// Function to hide tooltip
	const hideTooltip = () => {
		// Delay hiding to prevent flickering
		tooltipTimeoutRef.current = window.setTimeout(() => {
			setTooltip((prev) => ({ ...prev, visible: false }));
		}, 100);
	};

	useEffect(() => {
		loadGraph();
	}, []);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (tooltipTimeoutRef.current) {
				clearTimeout(tooltipTimeoutRef.current);
			}
		};
	}, []);

	const handleZoomIn = useCallback(() => {
		if (svgRef.current && zoomBehaviorRef.current) {
			d3.select(svgRef.current)
				.transition()
				.duration(300)
				.call(zoomBehaviorRef.current.scaleBy, 1.3);
		}
	}, []);

	const handleZoomOut = useCallback(() => {
		if (svgRef.current && zoomBehaviorRef.current) {
			d3.select(svgRef.current)
				.transition()
				.duration(300)
				.call(zoomBehaviorRef.current.scaleBy, 0.7);
		}
	}, []);

	const handleFitView = useCallback(() => {
		if (!svgRef.current || !zoomBehaviorRef.current) return;

		const svgEl = svgRef.current;
		const g = svgEl.querySelector("g");
		if (!g) return;

		const bbox = (g as SVGGElement).getBBox();
		if (bbox.width === 0 || bbox.height === 0) return;

		const fullWidth = svgEl.clientWidth;
		const fullHeight = svgEl.clientHeight;
		const padding = 40;

		const scale = Math.min(
			(fullWidth - padding * 2) / bbox.width,
			(fullHeight - padding * 2) / bbox.height,
			1.5,
		);

		const tx = fullWidth / 2 - (bbox.x + bbox.width / 2) * scale;
		const ty = fullHeight / 2 - (bbox.y + bbox.height / 2) * scale;

		d3.select(svgEl)
			.transition()
			.duration(500)
			.call(
				zoomBehaviorRef.current.transform,
				d3.zoomIdentity.translate(tx, ty).scale(scale),
			);
	}, []);

	useEffect(() => {
		if (!graphData || !svgRef.current) return;
		if (graphData.nodes.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const width = svgRef.current.clientWidth;
		const height = svgRef.current.clientHeight;

		// Build cluster centers
		const clusterFileCounts: Record<number, number> = {};
		for (const n of graphData.nodes) {
			const cid = n.cluster_id;
			if (cid >= 0) {
				clusterFileCounts[cid] = (clusterFileCounts[cid] || 0) + 1;
			}
		}

		const centerNodes: ClusterCenter[] = graphData.clusters.map((c) => ({
			id: `center-${c.label}`,
			label: c.name,
			cluster_id: c.label,
			cluster_name: c.name,
			isCenter: true as const,
			fileCount: clusterFileCounts[c.label] || 0,
		}));

		const fileNodes: (GraphNode & { isCenter?: false })[] = graphData.nodes.map((d) => ({
			...d,
			isCenter: false as const,
		}));

		const allNodes: SimNode[] = [...centerNodes, ...fileNodes];

		// Build links: files connect to their cluster center (skip null/undefined/negative cluster_ids)
		const centerLabelSet = new Set(graphData.clusters.map((c) => c.label));
		const allLinks: { source: string | number; target: string | number; cluster_id: number }[] =
			[];
		for (const n of graphData.nodes) {
			if (n.cluster_id != null && n.cluster_id >= 0 && centerLabelSet.has(n.cluster_id)) {
				allLinks.push({
					source: `center-${n.cluster_id}`,
					target: n.id,
					cluster_id: n.cluster_id,
				});
			}
		}

		// Zoom
		const g = svg.append("g");
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 6])
			.on("zoom", (event) => {
				g.attr("transform", event.transform);
				setZoomLevel(event.transform.k);
			});
		svg.call(zoom);
		zoomBehaviorRef.current = zoom;

		// Force simulation
		const simulation = d3
			.forceSimulation(allNodes as any)
			.force(
				"link",
				d3
					.forceLink(allLinks as any)
					.id((d: any) => d.id ?? d)
					.distance((d: any) => {
						return 100;
					})
					.strength(0.6),
			)
			.force("charge", d3.forceManyBody().strength((d: any) => {
				return d.isCenter ? -600 : -120;
			}))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide().radius((d: any) => {
				return d.isCenter ? 40 : 14;
			}));

		// Links
		const link = g
			.append("g")
			.selectAll("line")
			.data(allLinks)
			.join("line")
			.attr("stroke", (d) => getColor(d.cluster_id))
			.attr("stroke-opacity", 0.35)
			.attr("stroke-width", 2.5);

		// Node groups
		const node = g
			.append("g")
			.selectAll<SVGGElement, SimNode>("g")
			.data(allNodes)
			.join("g")
			.style("cursor", "pointer")
			.call(
				d3
					.drag<SVGGElement, SimNode>()
					.on("start", (event, d: any) => {
						if (!event.active) simulation.alphaTarget(0.3).restart();
						d.fx = d.x;
						d.fy = d.y;
					})
					.on("drag", (event, d: any) => {
						d.fx = event.x;
						d.fy = event.y;
					})
					.on("end", (event, d: any) => {
						if (!event.active) simulation.alphaTarget(0);
						d.fx = null;
						d.fy = null;
					}) as any,
			);

		const nodeRadius = (d: SimNode) => {
			if (d.isCenter) return 24 + Math.min((d as ClusterCenter).fileCount * 2, 20);
			return 8;
		};

		// Circles for each node
		node
			.append("circle")
			.attr("r", nodeRadius)
			.attr("fill", (d) => {
				const color = getColor(d.cluster_id);
				return d.isCenter ? color : color;
			})
			.attr("fill-opacity", (d) => (d.isCenter ? 0.85 : 0.9))
			.attr("stroke", (d) => {
				if (!d.isCenter && selectedNodeId !== undefined && selectedNodeId === (d as GraphNode).id) {
					return "#fff";
				}
				return "none";
			})
			.attr("stroke-width", 2);

		// Labels for cluster centers
		node
			.filter((d): d is ClusterCenter => d.isCenter === true)
			.append("text")
			.text((d) => d.cluster_name)
			.attr("text-anchor", "middle")
			.attr("dy", (d) => -(28 + Math.min((d as ClusterCenter).fileCount * 2, 20)))
			.attr("font-size", 13)
			.attr("font-weight", "600")
			.attr("fill", (d) => getColor(d.cluster_id))
			.attr("paint-order", "stroke")
			.attr("stroke", getThemeColors().bg)
			.attr("stroke-width", 3);

		// Labels for file nodes
		node
			.filter((d) => !d.isCenter)
			.append("text")
			.text((d) => d.label)
			.attr("dx", 12)
			.attr("dy", 4)
			.attr("font-size", 10)
			.attr("fill", getThemeColors().text2)
			.attr("paint-order", "stroke")
			.attr("stroke", getThemeColors().bg)
			.attr("stroke-width", 2);

		// Hover effects
		node
			.on("mouseover", function (event, d) {
				d3.select(this)
					.select("circle")
					.transition()
					.duration(150)
					.attr("r", d.isCenter ? nodeRadius(d) + 4 : 12)
					.attr("fill-opacity", 1);
				d3.select(this)
					.select("text")
					.transition()
					.duration(150)
					.attr("fill", getThemeColors().text)
					.attr("font-weight", "bold");
				
				// Show tooltip
				showTooltip(event, d);
			})
			.on("mouseout", function (event, d) {
				d3.select(this)
					.select("circle")
					.transition()
					.duration(150)
					.attr("r", nodeRadius(d))
					.attr("fill-opacity", d.isCenter ? 0.85 : 0.9);
				d3.select(this)
					.select("text")
					.transition()
					.duration(150)
					.attr("fill", d.isCenter ? getColor(d.cluster_id) : getThemeColors().text2)
					.attr("font-weight", d.isCenter ? "600" : "normal");
				
				// Hide tooltip
				hideTooltip();
			})
			.on("click", (event, d) => {
				if (d.isCenter && onClusterClick) {
					// Collect all children of this cluster
					const children = graphData.nodes
						.filter((n) => n.cluster_id === d.cluster_id)
						.map((n) => ({ id: n.id, label: n.label }));
					onClusterClick(d.cluster_id, d.cluster_name, children);
				} else if (!d.isCenter && onNodeClick) {
					onNodeClick((d as GraphNode).id, d.cluster_id);
				}
			});

		// Tick
		simulation.on("tick", () => {
			link
				.attr("x1", (d: any) => d.source.x)
				.attr("y1", (d: any) => d.source.y)
				.attr("x2", (d: any) => d.target.x)
				.attr("y2", (d: any) => d.target.y);

			node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
		});

		return () => {
			simulation.stop();
		};
	}, [graphData, selectedNodeId, onNodeClick, onClusterClick]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-claude-muted">
				<div className="text-center">
					<div className="text-4xl mb-2 animate-spin text-claude-accent">*</div>
					<p>Loading graph...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-claude-error">
				<div className="text-center">
					<p className="text-xl mb-2">Graph Error</p>
					<p className="text-sm">{error}</p>
					<button
						onClick={loadGraph}
						className="mt-4 px-4 py-2 bg-claude-accent text-white rounded hover:bg-claude-accentHover">
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!graphData || graphData.nodes.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-claude-muted">
				<div className="text-4xl mb-4 text-claude-muted font-bold">--</div>
				<h2 className="text-xl font-semibold mb-2">No graph data</h2>
				<p className="text-sm">
					Scan files and run clustering to see the force-directed graph.
				</p>
				<button
					onClick={loadGraph}
					className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover">
					Refresh
				</button>
			</div>
		);
	}

	// Build cluster legend
	const clusterInfo = graphData.clusters.map((c) => ({
		label: c.label,
		name: c.name,
		count: graphData.nodes.filter((n) => n.cluster_id === c.label).length,
	}));

	return (
		<div className="h-full relative">
			{/* SVG canvas */}
			<svg
				ref={svgRef}
				width="100%"
				height="100%"
				className="bg-claude-bg"
			/>

			{/* Tooltip */}
			{tooltip.visible && (
				<div
					className="absolute z-50 pointer-events-none"
					style={{
						left: `${tooltip.x}px`,
						top: `${tooltip.y}px`,
						transform: "translate(0, -100%)",
						maxWidth: "320px",
					}}
				>
					<div className="bg-claude-surface/95 backdrop-blur-sm border border-claude-border rounded-lg shadow-lg p-3">
						<div className="text-sm font-semibold text-claude-text mb-1 break-words">
							{tooltip.title}
						</div>
						<div className="text-xs text-claude-muted leading-relaxed break-words">
							{tooltip.content}
						</div>
						{!tooltip.isCluster && (
							<div className="mt-2 pt-2 border-t border-claude-border text-[10px] text-claude-muted">
								Click to open file
							</div>
						)}
					</div>
				</div>
			)}

			{/* Zoom controls - right side */}
			<div className="absolute top-4 right-4 flex flex-col gap-1 bg-claude-surface/90 backdrop-blur-sm border border-claude-border rounded-lg p-1">
				<button
					onClick={handleZoomIn}
					className="w-8 h-8 flex items-center justify-center text-claude-muted hover:text-claude-text hover:bg-claude-bg rounded transition-colors text-sm">
					+
				</button>
				<button
					onClick={handleZoomOut}
					className="w-8 h-8 flex items-center justify-center text-claude-muted hover:text-claude-text hover:bg-claude-bg rounded transition-colors text-sm">
					−
				</button>
				<div className="border-t border-claude-border my-0.5" />
				<button
					onClick={handleFitView}
					className="w-8 h-8 flex items-center justify-center text-claude-muted hover:text-claude-text hover:bg-claude-bg rounded transition-colors text-xs"
					title="Focus Clusters">
					⤢
				</button>
			</div>

			{/* Cluster legend - bottom left */}
			<div className="absolute bottom-4 left-4 bg-claude-surface/90 backdrop-blur-sm border border-claude-border rounded-lg p-3 max-w-[220px]">
				<div className="text-[11px] font-medium text-claude-muted uppercase tracking-wider mb-2">
					Clusters
				</div>
				<div className="space-y-1.5">
					{clusterInfo.map((c) => (
						<div key={c.label} className="flex items-center gap-2">
							<span
								className="w-2.5 h-2.5 rounded-full shrink-0"
								style={{ backgroundColor: getColor(c.label) }}
							/>
							<span className="text-xs text-claude-text truncate flex-1">
								{c.name}
							</span>
							<span className="text-[10px] text-claude-muted">({c.count})</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

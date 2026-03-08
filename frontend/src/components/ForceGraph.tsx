import { useEffect, useRef, useState } from "react";
import { getGraphData } from "../api";
import * as d3 from "d3";
import type { GraphNode, GraphLink, GraphData } from "../types";

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

function getColor(clusterId: number): string {
	if (clusterId < 0) return UNCLUSTERED_COLOR;
	return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

export default function ForceGraph() {
	const svgRef = useRef<SVGSVGElement>(null);
	const [loading, setLoading] = useState(false);
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [error, setError] = useState<string | null>(null);

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

	useEffect(() => {
		loadGraph();
	}, []);

	useEffect(() => {
		if (!graphData || !svgRef.current) return;
		if (graphData.nodes.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const width = svgRef.current.clientWidth;
		const height = svgRef.current.clientHeight;

		// Zoom behavior
		const g = svg.append("g");
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on("zoom", (event) => {
				g.attr("transform", event.transform);
			});
		svg.call(zoom);

		// Create nodes and links with proper typing
		const nodes: GraphNode[] = graphData.nodes.map((d) => ({ ...d }));
		const links: GraphLink[] = graphData.links.map((d) => ({ ...d }));

		// Simulation
		const simulation = d3
			.forceSimulation(nodes as any)
			.force(
				"link",
				d3
					.forceLink(links as any)
					.id((d: any) => d.id)
					.distance(80),
			)
			.force("charge", d3.forceManyBody().strength(-200))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide().radius(30));

		// Links
		const link = g
			.append("g")
			.selectAll("line")
			.data(links)
			.join("line")
			.attr("stroke", (d) => getColor(d.cluster_id))
			.attr("stroke-opacity", 0.3)
			.attr("stroke-width", 1.5);

		// Nodes
		const node = g
			.append("g")
			.selectAll("circle")
			.data(nodes)
			.join("circle")
			.attr("r", 8)
			.attr("fill", (d) => getColor(d.cluster_id))
			.attr("stroke", "#1e293b")
			.attr("stroke-width", 2)
			.style("cursor", "pointer")
			.call(
				d3
					.drag<SVGCircleElement, GraphNode>()
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

		// Labels
		const labels = g
			.append("g")
			.selectAll("text")
			.data(nodes)
			.join("text")
			.text((d) => d.label)
			.attr("font-size", 10)
			.attr("fill", "#94a3b8")
			.attr("dx", 12)
			.attr("dy", 4);

		// Tooltip
		node
			.on("mouseover", function (event, d) {
				d3.select(this).attr("r", 12).attr("stroke", "#f8fafc");
				labels
					.filter((l) => l.id === d.id)
					.attr("fill", "#f8fafc")
					.attr("font-weight", "bold");
			})
			.on("mouseout", function (event, d) {
				d3.select(this).attr("r", 8).attr("stroke", "#1e293b");
				labels
					.filter((l) => l.id === d.id)
					.attr("fill", "#94a3b8")
					.attr("font-weight", "normal");
			});

		// Tick
		simulation.on("tick", () => {
			link
				.attr("x1", (d: any) => d.source.x)
				.attr("y1", (d: any) => d.source.y)
				.attr("x2", (d: any) => d.target.x)
				.attr("y2", (d: any) => d.target.y);

			node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
			labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
		});

		return () => {
			simulation.stop();
		};
	}, [graphData]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-sefs-muted">
				<div className="text-center">
					<div className="text-4xl mb-2 animate-spin text-sefs-accent">*</div>
					<p>Loading graph...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-sefs-error">
				<div className="text-center">
					<p className="text-xl mb-2">Graph Error</p>
					<p className="text-sm">{error}</p>
					<button
						onClick={loadGraph}
						className="mt-4 px-4 py-2 bg-sefs-accent text-white rounded hover:bg-sefs-accentHover">
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!graphData || graphData.nodes.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-sefs-muted">
				<div className="text-4xl mb-4 text-sefs-muted font-bold">--</div>
				<h2 className="text-xl font-semibold mb-2">No graph data</h2>
				<p className="text-sm">
					Scan files and run clustering to see the force-directed graph.
				</p>
				<button
					onClick={loadGraph}
					className="mt-4 px-4 py-2 bg-sefs-accent text-white rounded-lg hover:bg-sefs-accentHover">
					Refresh
				</button>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-2">
				<h2 className="text-lg font-semibold">Force-Directed Graph</h2>
				<div className="flex items-center gap-2">
					{graphData.clusters.map((c) => (
						<span
							key={c.label}
							className="flex items-center gap-1 text-xs text-sefs-muted">
							<span
								className="w-3 h-3 rounded-full inline-block"
								style={{ backgroundColor: getColor(c.label) }}
							/>
							{c.name}
						</span>
					))}
					<button
						onClick={loadGraph}
						className="ml-2 px-3 py-1 text-xs bg-sefs-surface border border-sefs-border rounded hover:border-sefs-accent">
						Refresh
					</button>
				</div>
			</div>
			<div className="flex-1 bg-sefs-bg rounded-lg border border-sefs-border overflow-hidden">
				<svg ref={svgRef} width="100%" height="100%" />
			</div>
		</div>
	);
}

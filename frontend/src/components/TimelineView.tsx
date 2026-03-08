import { useEffect, useState } from "react";
import { getTimelineData } from "../api";
import type { TimelineData, TimelineEntry } from "../types";

// ─── Color palette (matches app theme) ───────────────────────────────────────
const CLUSTER_COLORS = [
	"#D97757", "#3b82f6", "#22c55e", "#a855f7", "#ec4899",
	"#eab308", "#06b6d4", "#ef4444", "#6366f1", "#14b8a6",
	"#f43f5e", "#84cc16", "#8b5cf6", "#0ea5e9", "#d946ef",
];

function getClusterColor(clusterId: number): string {
	if (clusterId < 0) return "#4b5563";
	return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

function getFileIcon(ext: string): string {
	const t = (ext || "").toLowerCase().replace(".", "");
	if (t === "pdf") return "📄";
	if (["doc", "docx"].includes(t)) return "📝";
	if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(t)) return "🖼️";
	if (["mp4", "mov", "avi"].includes(t)) return "🎬";
	if (["mp3", "wav", "flac"].includes(t)) return "🎵";
	if (["zip", "tar", "gz", "7z"].includes(t)) return "🗜️";
	if (["js", "ts", "tsx", "jsx", "py", "java", "cs", "cpp", "c", "go", "rs"].includes(t)) return "💻";
	if (["html", "css", "scss", "vue"].includes(t)) return "🌐";
	if (["json", "yaml", "yml", "xml", "toml"].includes(t)) return "⚙️";
	if (["txt", "md"].includes(t)) return "📃";
	if (["csv", "xlsx", "xls"].includes(t)) return "📊";
	return "📁";
}

// ─── Event icons & formatting ─────────────────────────────────────────────────
const EVENT_ICONS: Record<string, string> = {
	scan_started: "🔍",
	scan_complete: "✅",
	clustering_started: "⚙️",
	clustering_complete: "📁",
	naming_started: "✏️",
	naming_complete: "🏷️",
	organizing_started: "📦",
	organizing_complete: "🚀",
	files_organized: "🚀",
	basic_organize_complete: "📂",
	file_processed: "📄",
	file_deleted: "🗑️",
	scan_error: "❌",
	clustering_error: "❌",
};

function formatEventDescription(entry: TimelineEntry): string {
	if (!entry.event_type) return "Unknown event";
	const d = entry.data || {};
	switch (entry.event_type) {
		case "scan_started": return `Scan started on ${d.root || "root folder"}`;
		case "scan_complete": return `Scan complete — ${d.file_count || 0} files found`;
		case "clustering_started": return "Clustering started";
		case "clustering_complete": return `Organized into ${d.total_clusters || 0} clusters (${d.total_files || 0} files)`;
		case "naming_started": return "AI naming clusters…";
		case "naming_complete": return `Clusters named (${d.total_named || d.total || "all"})`;
		case "organizing_started": return `Organizing files${d.semantic ? " (semantic)" : ""}…`;
		case "organizing_complete": return "File organization complete";
		case "files_organized": return `Files moved into cluster folders`;
		case "basic_organize_complete": return `Sorted by type — ${d.moves || 0} files moved into ${d.categories || 0} categories`;
		case "file_processed": return `Processed ${d.filename || "file"}`;
		case "file_deleted": return `Deleted ${d.path || "file"}`;
		case "scan_error": return `Scan error: ${d.error || "unknown"}`;
		case "clustering_error": return `Clustering error: ${d.error || "unknown"}`;
		default: return entry.event_type.replace(/_/g, " ");
	}
}

// ─── Time formatting ──────────────────────────────────────────────────────────
function formatTimestamp(ts: number): string {
	const d = new Date(ts * 1000);
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function formatDate(ts: number): string {
	const d = new Date(ts * 1000);
	return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
	const groups = new Map<string, TimelineEntry[]>();
	for (const e of entries) {
		const key = formatDate(e.timestamp);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(e);
	}
	return groups;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface TimelineViewProps {
	onNodeClick: (fileId: number, clusterId: number) => void;
}

// ─── Entry rendering ──────────────────────────────────────────────────────────
function TimelineEntryRow({ entry, onNodeClick }: { entry: TimelineEntry; onNodeClick: (fid: number, cid: number) => void }) {
	const isFile = entry.kind === "file_added" || entry.kind === "file_updated";
	const isCluster = entry.kind === "cluster_created";
	const isEvent = entry.kind === "event";

	const color = isFile
		? getClusterColor(entry.cluster_id ?? -1)
		: isCluster
			? getClusterColor(entry.cluster_id ?? -1)
			: "#6b7280";

	const clickable = isFile && entry.file_id != null;

	return (
		<div
			className={`group flex items-start gap-3 py-2.5 px-4 transition-colors ${
				clickable ? "hover:bg-claude-surface/60 cursor-pointer" : ""
			}`}
			onClick={() => {
				if (clickable) onNodeClick(entry.file_id!, entry.cluster_id ?? -1);
			}}
		>
			{/* Timeline dot + connector line */}
			<div className="flex flex-col items-center pt-0.5 shrink-0 w-5">
				<div
					className="w-2.5 h-2.5 rounded-full ring-2 ring-claude-bg shrink-0"
					style={{ backgroundColor: color }}
				/>
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				{isFile && (
					<>
						<div className="flex items-center gap-2">
							<span className="text-sm">{getFileIcon(entry.extension || "")}</span>
							<span className="text-xs font-medium text-claude-text truncate">
								{entry.filename}
							</span>
							<span
								className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
								style={{ backgroundColor: color + "20", color }}
							>
								{entry.cluster_name}
							</span>
						</div>
						<div className="text-[11px] text-claude-muted mt-0.5">
							{entry.kind === "file_added" ? "File tracked" : "File updated"}
							{entry.extension ? ` · .${entry.extension.replace(".", "")}` : ""}
						</div>
					</>
				)}
				{isCluster && (
					<>
						<div className="flex items-center gap-2">
							<span className="text-sm">📁</span>
							<span className="text-xs font-medium text-claude-text">
								Cluster created: <span style={{ color }}>{entry.cluster_name}</span>
							</span>
						</div>
						<div className="text-[11px] text-claude-muted mt-0.5">
							{entry.file_count || 0} files assigned
						</div>
					</>
				)}
				{isEvent && (
					<>
						<div className="flex items-center gap-2">
							<span className="text-sm">{EVENT_ICONS[entry.event_type || ""] || "•"}</span>
							<span className="text-xs text-claude-text/90">
								{formatEventDescription(entry)}
							</span>
						</div>
					</>
				)}
			</div>

			{/* Timestamp */}
			<div className="text-[10px] text-claude-muted/60 shrink-0 pt-0.5 tabular-nums">
				{formatTimestamp(entry.timestamp)}
			</div>
		</div>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TimelineView({ onNodeClick }: TimelineViewProps) {
	const [data, setData] = useState<TimelineData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<"all" | "files" | "events" | "clusters">("all");

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		getTimelineData()
			.then((d) => { if (!cancelled) { setData(d); setError(null); } })
			.catch((e) => { if (!cancelled) setError(e.message || "Failed to load timeline"); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, []);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-claude-muted text-sm">
				<svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
					<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
					<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
				Loading timeline…
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
		);
	}

	if (!data || !data.entries.length) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-claude-muted gap-2">
				<span className="text-3xl">⏤</span>
				<span className="text-sm">No activity yet</span>
				<span className="text-xs text-claude-muted/60">Scan and cluster files to see the timeline</span>
			</div>
		);
	}

	// Filter entries
	const filtered = data.entries.filter((e) => {
		if (filter === "all") return true;
		if (filter === "files") return e.kind === "file_added" || e.kind === "file_updated";
		if (filter === "clusters") return e.kind === "cluster_created";
		if (filter === "events") return e.kind === "event";
		return true;
	});

	const grouped = groupByDate(filtered);

	// Stats
	const fileCount = data.entries.filter((e) => e.kind === "file_added").length;
	const eventCount = data.entries.filter((e) => e.kind === "event").length;
	const clusterCount = data.entries.filter((e) => e.kind === "cluster_created").length;

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-5 py-3 border-b border-claude-border bg-claude-surface/50 shrink-0">
				<div className="flex items-center gap-3">
					<h2 className="text-sm font-semibold text-claude-text">Activity Timeline</h2>
					<span className="text-[11px] text-claude-muted">{filtered.length} entries</span>
				</div>
				{/* Filter pills */}
				<div className="flex gap-1">
					{([
						{ key: "all", label: "All" },
						{ key: "files", label: `Files (${fileCount})` },
						{ key: "clusters", label: `Clusters (${clusterCount})` },
						{ key: "events", label: `Events (${eventCount})` },
					] as const).map((f) => (
						<button
							key={f.key}
							onClick={() => setFilter(f.key)}
							className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
								filter === f.key
									? "bg-claude-accent text-white"
									: "text-claude-muted hover:text-claude-text hover:bg-claude-surface"
							}`}
						>
							{f.label}
						</button>
					))}
				</div>
			</div>

			{/* Timeline feed */}
			<div className="flex-1 overflow-y-auto">
				{Array.from(grouped.entries()).map(([dateLabel, entries]) => (
					<div key={dateLabel}>
						{/* Date separator */}
						<div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2 bg-claude-bg/95 backdrop-blur-sm border-b border-claude-border/50">
							<div className="w-5 flex justify-center">
								<div className="w-1.5 h-1.5 rounded-full bg-claude-muted/40" />
							</div>
							<span className="text-[11px] font-semibold text-claude-muted uppercase tracking-wider">
								{dateLabel}
							</span>
							<div className="flex-1 h-px bg-claude-border/30" />
							<span className="text-[10px] text-claude-muted/50">{entries.length}</span>
						</div>

						{/* Entries for this date */}
						<div className="relative">
							{/* Vertical connector line */}
							<div
								className="absolute left-[29px] top-0 bottom-0 w-px bg-claude-border/30"
								aria-hidden
							/>
							{entries.map((entry, i) => (
								<TimelineEntryRow key={`${entry.kind}-${entry.timestamp}-${i}`} entry={entry} onNodeClick={onNodeClick} />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

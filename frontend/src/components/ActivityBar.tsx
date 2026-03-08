import { useState } from "react";
import type { WSEvent } from "../types";

interface ActivityBarProps {
	events: WSEvent[];
	connected: boolean;
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	});
}

const eventIcons: Record<string, string> = {
	scan_complete: "✅",
	clustering_complete: "📁",
	naming_complete: "🏷",
	organizing_complete: "🚀",
	files_organized: "🚀",
	file_processed: "📄",
	scan_started: "🔍",
	clustering_started: "⚙",
	naming_started: "✏",
	organizing_started: "📦",
	basic_organize_complete: "📂",
	scan_error: "❌",
	clustering_error: "❌",
};

function formatEvent(event: WSEvent): string {
	const data = event.data;
	switch (event.type) {
		case "scan_complete":
			return `Scan complete (${data?.file_count || 0} files)`;
		case "clustering_complete":
			return `Organized into ${data?.total_clusters || 0} groups (${data?.total_files || 0} files moved)`;
		case "naming_complete":
			return "Clusters named";
		case "file_processed":
			return `Processed: ${data?.filename || "file"}`;
		case "organizing_complete":
		case "files_organized":
			return `Organizing files...`;
		default:
			return event.type.replace(/_/g, " ");
	}
}

export default function ActivityBar({ events, connected }: ActivityBarProps) {
	const [expanded, setExpanded] = useState(false);

	// Get recent meaningful events (skip pongs)
	const meaningful = events.filter((e) => e.type !== "pong" && e.type !== "connected");
	const recentEvents = meaningful.slice(0, expanded ? 20 : 3);
	const now = new Date();

	return (
		<div
			className={`bg-claude-surface border-t border-claude-border transition-all ${
				expanded ? "max-h-48" : "max-h-10"
			}`}>
			{/* Main bar */}
			<div
				className="flex items-center justify-between px-4 h-10 cursor-pointer"
				onClick={() => setExpanded(!expanded)}>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5">
						<span
							className={`w-2 h-2 rounded-full ${
								connected
									? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]"
									: "bg-red-400"
							}`}
						/>
						<span className="text-xs font-medium text-claude-muted">
							Activity ({meaningful.length})
						</span>
					</div>

					{/* Latest events inline */}
					{!expanded && recentEvents.length > 0 && (
						<div className="flex items-center gap-4 ml-2">
							{recentEvents.slice(0, 3).map((ev, i) => (
								<span
									key={i}
									className="flex items-center gap-1.5 text-[11px] text-claude-muted">
									<span>{eventIcons[ev.type] || "•"}</span>
									<span>{formatEvent(ev)}</span>
									<span className="text-claude-muted/50">
										{formatTime(now)}
									</span>
								</span>
							))}
						</div>
					)}
				</div>

				<span className="text-xs text-claude-muted">{expanded ? "▾" : "▴"}</span>
			</div>

			{/* Expanded event list */}
			{expanded && (
				<div className="overflow-auto max-h-36 px-4 pb-2">
					{recentEvents.map((ev, i) => (
						<div
							key={i}
							className="flex items-center gap-2 py-1 text-[11px]">
							<span className="text-sm">
								{eventIcons[ev.type] || "•"}
							</span>
							<span className="text-claude-text/80 flex-1">
								{formatEvent(ev)}
							</span>
							<span className="text-claude-muted/50 shrink-0">
								{formatTime(now)}
							</span>
						</div>
					))}
					{meaningful.length === 0 && (
						<div className="text-xs text-claude-muted py-2">
							No activity yet
						</div>
					)}
				</div>
			)}
		</div>
	);
}

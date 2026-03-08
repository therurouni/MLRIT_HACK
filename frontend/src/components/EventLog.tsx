import type { WSEvent } from "../types";

interface EventLogProps {
	events: WSEvent[];
	connected: boolean;
}

const eventIcons: Record<string, string> = {
	connected: "[+]",
	file_processed: "[F]",
	file_deleted: "[X]",
	scan_started: "[>]",
	scan_complete: "[OK]",
	scan_error: "[!]",
	clustering_started: "[C]",
	clustering_complete: "[OK]",
	clustering_error: "[!]",
	naming_started: "[N]",
	naming_complete: "[OK]",
	organizing_started: "[O]",
	organizing_complete: "[OK]",
	files_organized: "[O]",
	pong: "[.]",
};

function formatEvent(event: WSEvent): string {
	const data = event.data;
	switch (event.type) {
		case "connected":
			return "Connected to SEFS";
		case "file_processed":
			return `Processed: ${data?.filename || "file"}`;
		case "file_deleted":
			return `Deleted: ${data?.path || "file"}`;
		case "scan_started":
			return `Scanning ${data?.root || "..."} `;
		case "scan_complete":
			return `Scan complete: ${data?.file_count || 0} files`;
		case "clustering_started":
			return "Clustering started...";
		case "clustering_complete":
			return `Clustered: ${data?.total_clusters || 0} clusters, ${data?.total_files || 0} files`;
		case "naming_started":
			return "Naming clusters with LLM...";
		case "naming_complete":
			return "Clusters named";
		case "organizing_started":
			return "Organizing files on disk...";
		case "organizing_complete":
		case "files_organized":
			return `Organized: ${data?.moves || 0} files moved`;
		default:
			return event.type;
	}
}

export default function EventLog({ events, connected }: EventLogProps) {
	return (
		<div className="h-48 bg-claude-surface border-t border-claude-border">
			<div className="flex items-center justify-between px-4 py-1.5 border-b border-claude-border/50">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium text-claude-muted">Event Log</span>
					<span
						className={`w-1.5 h-1.5 rounded-full ${
							connected ? "bg-claude-success" : "bg-claude-error"
						}`}
					/>
				</div>
				<span className="text-xs text-claude-muted">{events.length} events</span>
			</div>
			<div className="overflow-auto h-[calc(100%-28px)] px-4 py-1">
				{events.length === 0 && (
					<div className="text-xs text-claude-muted py-2">
						Waiting for events...
					</div>
				)}
				{events.slice(0, 50).map((event, i) => (
					<div key={i} className="flex items-center gap-2 py-0.5 text-xs">
						<span>{eventIcons[event.type] || "[*]"}</span>
						<span className="text-claude-muted">{formatEvent(event)}</span>
					</div>
				))}
			</div>
		</div>
	);
}

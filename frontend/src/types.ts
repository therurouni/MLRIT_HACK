// ─── Shared TypeScript types for SEFS ─────────────────────────────────────────

export interface FileRecord {
	id: number;
	path: string;
	filename: string;
	extension: string;
	size_bytes: number;
	content_hash: string;
	content_preview: string;
	faiss_id: number | null;
	cluster_id: number | null;
	cluster_name: string | null;
	embedded_at: number | null;
	created_at: number;
	updated_at: number;
}

export interface Cluster {
	id: number;
	label: number;
	name: string;
	file_count: number;
	folder_path: string;
	created_at: number;
	updated_at: number;
}

export interface GraphNode {
	id: number;
	label: string;
	cluster_id: number;
	cluster_name: string;
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
}

export interface GraphLink {
	source: number | GraphNode;
	target: number | GraphNode;
	cluster_id: number;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
	clusters: { id: number; label: number; name: string }[];
}

export interface UmapPoint {
	file_id: number;
	filename: string;
	x: number;
	y: number;
	cluster_label: number;
	cluster_name?: string;
}

export interface TimelineEntry {
	kind: "file_added" | "file_updated" | "cluster_created" | "event";
	timestamp: number;
	// file entries
	file_id?: number;
	filename?: string;
	extension?: string;
	cluster_id?: number;
	cluster_name?: string;
	// cluster entries
	file_count?: number;
	// system event entries
	event_type?: string;
	data?: Record<string, unknown>;
}

export interface TimelineData {
	entries: TimelineEntry[];
}

export interface SearchResult {
	file_id: number;
	filename: string;
	path: string;
	extension: string;
	content_preview: string;
	cluster_name: string;
	cluster_id: number | null;
	score: number;
}

export interface ChatMessage {
	id: number;
	role: "user" | "assistant";
	content: string;
	context_files: string[] | null;
	created_at: number;
}

export interface WSEvent {
	type: string;
	data: Record<string, unknown>;
}

export interface EventRecord {
	id: number;
	event_type: string;
	data: Record<string, unknown> | null;
	created_at: number;
}

export type ViewTab = "files" | "graph" | "umap" | "timeline" | "search" | "chat" | "gaps";

export interface GapTopic {
	topic: string;
	reason: string;
}

export interface GapAnalysisResult {
	existing: { name: string; file_count: number }[];
	gaps: GapTopic[];
	summary: string;
}

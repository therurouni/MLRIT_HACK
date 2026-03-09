// ─── API helpers for SEFS frontend ────────────────────────────────────────────

const BASE = "";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${url}`, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`API error ${res.status}: ${text}`);
	}
	return res.json();
}

// ─── Files ───────────────────────────────────────────────────────────────────

export async function getFiles() {
	return fetchJSON<{ files: any[]; total: number }>("/api/files");
}

export async function getFileById(id: number) {
	return fetchJSON<any>(`/api/files/${id}`);
}

export async function getRoot() {
	return fetchJSON<{ root: string }>("/api/files/root");
}

export async function setRoot(root: string) {
	return fetchJSON<{ root: string; status: string }>("/api/files/root", {
		method: "POST",
		body: JSON.stringify({ root }),
	});
}

export async function scanFiles(
	root?: string,
	semanticOrganize: boolean = false,
) {
	return fetchJSON<{ status: string; root: string }>("/api/files/scan", {
		method: "POST",
		body: JSON.stringify({
			root: root || null,
			semantic_organize: semanticOrganize,
		}),
	});
}

export async function basicOrganize(root?: string) {
	return fetchJSON<{ status: string }>("/api/files/basic-organize", {
		method: "POST",
		body: JSON.stringify({ root: root || null }),
	});
}

export async function getFileStats() {
	return fetchJSON<{
		total_files: number;
		embedded_files: number;
		clustered_files: number;
		root: string;
	}>("/api/files/stats/summary");
}

// ─── Clusters ────────────────────────────────────────────────────────────────

export async function getClusters() {
	return fetchJSON<{ clusters: any[]; total: number }>("/api/clusters");
}

export async function getGapAnalysis() {
	return fetchJSON<import('./types').GapAnalysisResult>("/api/clusters/gap-analysis");
}

export async function recluster(
	organize: boolean = false,
	semanticOrganize: boolean = false,
) {
	return fetchJSON<{ status: string }>("/api/clusters/recluster", {
		method: "POST",
		body: JSON.stringify({ organize, semantic_organize: semanticOrganize }),
	});
}

export async function getGraphData() {
	return fetchJSON<any>("/api/clusters/graph");
}

export async function getUmapData() {
	return fetchJSON<{ points: any[] }>("/api/clusters/umap");
}

export async function getTimelineData(limit: number = 500) {
	return fetchJSON<import('./types').TimelineData>(`/api/clusters/timeline?limit=${limit}`);
}

export async function organizeFiles() {
	return fetchJSON<{ status: string }>("/api/clusters/organize", {
		method: "POST",
	});
}

export async function moveNode(fileId: number, targetClusterLabel: number) {
	return fetchJSON<{
		status: string;
		file_id: number;
		filename: string;
		from_cluster: number | null;
		to_cluster: number;
		to_cluster_name: string;
		source_cluster_removed: boolean;
		moved_on_disk: boolean;
	}>("/api/clusters/move-node", {
		method: "POST",
		body: JSON.stringify({
			file_id: fileId,
			target_cluster_label: targetClusterLabel,
		}),
	});
}

export async function getSimilarFiles(fileId: number, k: number = 5) {
	return fetchJSON<{ similar: any[]; file_id: number }>(
		`/api/files/${fileId}/similar?k=${k}`,
	);
}

export async function openFile(fileId: number) {
	return fetchJSON<{ status: string; file_id: number; path: string }>(
		`/api/files/${fileId}/open`,
		{
			method: "POST",
		},
	);
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function semanticSearch(query: string, k: number = 10) {
	return fetchJSON<{ results: any[]; query: string; total: number }>(
		"/api/search",
		{
			method: "POST",
			body: JSON.stringify({ query, k }),
		},
	);
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function sendChat(message: string, k: number = 5) {
	return fetchJSON<{ response: string; context_files: any[] }>("/api/chat", {
		method: "POST",
		body: JSON.stringify({ message, k }),
	});
}

export async function getChatHistory(limit: number = 50) {
	return fetchJSON<{ messages: any[]; total: number }>(
		`/api/chat/history?limit=${limit}`,
	);
}

export async function clearChatHistory() {
	return fetchJSON<{ status: string }>("/api/chat/history", {
		method: "DELETE",
	});
}

// ─── Health & Events ─────────────────────────────────────────────────────────

export async function getHealth() {
	return fetchJSON<{
		status: string;
		ollama: boolean;
		vectors: number;
		root: string;
	}>("/api/health");
}

export async function getEvents(limit: number = 50) {
	return fetchJSON<{ events: any[] }>(`/api/events?limit=${limit}`);
}

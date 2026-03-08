import { useState } from "react";
import { semanticSearch } from "../api";
import type { SearchResult } from "../types";

export default function SearchBar() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [searched, setSearched] = useState(false);

	const handleSearch = async () => {
		if (!query.trim()) return;
		setLoading(true);
		setSearched(true);
		try {
			const res = await semanticSearch(query);
			setResults(res.results);
		} catch (e: any) {
			alert("Search failed: " + e.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="h-full flex flex-col">
			<h2 className="text-lg font-semibold mb-4">Semantic Search</h2>

			{/* Search input */}
			<div className="flex gap-2 mb-4">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					placeholder="Search your files semantically..."
					className="flex-1 px-4 py-2.5 bg-claude-bg border border-claude-border rounded-lg text-claude-text placeholder-claude-muted focus:outline-none focus:border-claude-accent"
				/>
				<button
					onClick={handleSearch}
					disabled={loading || !query.trim()}
					className="px-6 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
					{loading ? "..." : "Search"}
				</button>
			</div>

			{/* Results */}
			<div className="flex-1 overflow-auto">
				{!searched && (
					<div className="flex flex-col items-center justify-center h-full text-claude-muted">
						<div className="text-4xl mb-4 text-claude-muted font-bold">?</div>
						<p className="text-sm">
							Enter a query to search your files by meaning, not just keywords.
						</p>
					</div>
				)}

				{searched && results.length === 0 && !loading && (
					<div className="text-center text-claude-muted py-8">
						<p>No results found for "{query}"</p>
					</div>
				)}

				{results.map((r, i) => (
					<div
						key={r.file_id}
						className="mb-3 p-4 bg-claude-surface border border-claude-border rounded-lg hover:border-claude-accent/50 transition-colors">
						<div className="flex items-center justify-between mb-1">
							<div className="flex items-center gap-2">
								<span className="text-claude-accent font-mono text-xs">
									#{i + 1}
								</span>
								<span className="font-medium">{r.filename}</span>
								{r.cluster_name && (
									<span className="px-2 py-0.5 text-xs rounded-full bg-claude-accent/10 text-claude-accent">
										{r.cluster_name}
									</span>
								)}
							</div>
							<span className="text-xs text-claude-muted">
								Score: {(r.score * 100).toFixed(1)}%
							</span>
						</div>
						<p className="text-xs text-claude-muted truncate" title={r.path}>
							{r.path}
						</p>
						{r.content_preview && (
							<p className="mt-2 text-sm text-claude-muted/80 line-clamp-2">
								{r.content_preview}
							</p>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

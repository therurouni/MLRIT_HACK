import { useState, useEffect, useRef, useCallback } from "react";
import { semanticSearch } from "../api";
import type { SearchResult } from "../types";

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
];

function getDotColor(result: SearchResult, index: number): string {
	if (result.cluster_name) {
		return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
	}
	return "#3b82f6";
}

function getExtLabel(ext: string): string {
	return ext.replace(".", "").toUpperCase();
}

interface SearchModalProps {
	open: boolean;
	onClose: () => void;
	onFileSelect?: (fileId: number, clusterId: number) => void;
}

export default function SearchModal({ open, onClose, onFileSelect }: SearchModalProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [searched, setSearched] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Focus input when modal opens
	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 50);
			setQuery("");
			setResults([]);
			setSearched(false);
		}
	}, [open]);

	// Close on Escape
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open, onClose]);

	// Global Cmd+K / Ctrl+K to open
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				if (!open) {
					// Parent handles opening — this is just for awareness
				} else {
					inputRef.current?.focus();
				}
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open]);

	const doSearch = useCallback(async (q: string) => {
		if (!q.trim()) {
			setResults([]);
			setSearched(false);
			return;
		}
		setLoading(true);
		setSearched(true);
		try {
			const res = await semanticSearch(q, 8);
			setResults(res.results);
		} catch {
			setResults([]);
		} finally {
			setLoading(false);
		}
	}, []);

	const handleInputChange = (val: string) => {
		setQuery(val);
		// Debounce search — triggers 400ms after user stops typing
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			doSearch(val);
		}, 400);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			doSearch(query);
		}
	};

	if (!open) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
				onClick={onClose}
			/>

			{/* Modal */}
			<div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50">
				<div className="bg-white rounded-xl shadow-2xl overflow-hidden">
					{/* Search input row */}
					<div className="flex items-center px-4 py-3 border-b border-gray-200">
						{/* Sparkle icon */}
						<svg
							className="w-5 h-5 text-gray-400 mr-3 shrink-0"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2">
							<path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z" />
						</svg>
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => handleInputChange(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Search your files..."
							className="flex-1 text-base text-gray-900 placeholder-gray-400 bg-transparent outline-none"
						/>
						{/* Close X */}
						<button
							onClick={onClose}
							className="ml-2 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
							<svg
								className="w-4 h-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</div>

					{/* Results */}
					<div className="max-h-[400px] overflow-y-auto">
						{loading && (
							<div className="flex items-center justify-center py-8 text-gray-400 text-sm">
								<svg
									className="animate-spin h-4 w-4 mr-2"
									viewBox="0 0 24 24">
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
										fill="none"
									/>
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									/>
								</svg>
								Searching...
							</div>
						)}

						{!loading && searched && results.length === 0 && (
							<div className="py-8 text-center text-gray-400 text-sm">
								No results found for "{query}"
							</div>
						)}

						{!loading &&
							results.map((r, i) => (
								<div
									key={r.file_id}
									onClick={() => {
										if (onFileSelect) {
											onFileSelect(r.file_id, r.cluster_id ?? 0);
										}
										onClose();
									}}
									className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0">
									{/* Cluster dot */}
									<span
										className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
										style={{
											backgroundColor: getDotColor(r, i),
										}}
									/>

									{/* Content */}
									<div className="flex-1 min-w-0">
										{/* Top row: filename + score */}
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm text-gray-900 truncate">
												{r.filename}
											</span>
											<span className="shrink-0 px-1.5 py-0.5 text-[11px] font-semibold rounded bg-orange-100 text-orange-600">
												{Math.round(r.score * 100)}%
											</span>
										</div>
										{/* Preview */}
										{r.content_preview && (
											<p className="mt-0.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
												{r.content_preview}
											</p>
										)}
									</div>

									{/* Extension badge */}
									{r.extension && (
										<span className="shrink-0 mt-0.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
											{getExtLabel(r.extension)}
										</span>
									)}
								</div>
							))}

						{!searched && !loading && (
							<div className="py-8 text-center text-gray-400 text-sm">
								Type to search your files by meaning or keywords
							</div>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

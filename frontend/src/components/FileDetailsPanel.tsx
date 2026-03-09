
import { useEffect, useState } from "react";
import { getFileById, getSimilarFiles, openFile, getClusters, moveNode } from "../api";
import type { FileRecord } from "../types";

interface SimilarFile {
	file_id: number;
	filename: string;
	path: string;
	extension: string;
	cluster_id: number | null;
	cluster_name: string;
	score: number;
}

export interface ClusterSelection {
	clusterId: number;
	clusterName: string;
	children: { id: number; label: string }[];
}

interface FileDetailsPanelProps {
	fileId: number | null;
	clusterSelection: ClusterSelection | null;
	clusterColor: string;
	onClose: () => void;
	onFileSelect?: (fileId: number, clusterId: number) => void;
	onGapAnalysis?: () => void;
	onNodeMoved?: () => void;
}

const EXT_ICONS: Record<string, { label: string; bg: string }> = {
	".pdf": { label: "PDF", bg: "bg-red-600" },
	".csv": { label: "CSV", bg: "bg-green-600" },
	".txt": { label: "TXT", bg: "bg-blue-600" },
	".py": { label: "PY", bg: "bg-yellow-600" },
	".js": { label: "JS", bg: "bg-yellow-500" },
	".ts": { label: "TS", bg: "bg-blue-500" },
	".md": { label: "MD", bg: "bg-gray-500" },
	".json": { label: "JSON", bg: "bg-orange-500" },
	".html": { label: "HTML", bg: "bg-orange-600" },
	".docx": { label: "DOC", bg: "bg-blue-700" },
	".pptx": { label: "PPT", bg: "bg-red-500" },
	".xlsx": { label: "XLS", bg: "bg-green-700" },
	".png": { label: "IMG", bg: "bg-purple-600" },
	".jpg": { label: "IMG", bg: "bg-purple-600" },
	".jpeg": { label: "IMG", bg: "bg-purple-600" },
};

function getExtIcon(ext: string) {
	return EXT_ICONS[ext?.toLowerCase()] || { label: "FILE", bg: "bg-claude-muted" };
}

function getExtFromFilename(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot >= 0 ? filename.substring(dot).toLowerCase() : "";
}

export default function FileDetailsPanel({
	fileId,
	clusterSelection,
	clusterColor,
	onClose,
	onFileSelect,
	onGapAnalysis,
	onNodeMoved,
}: FileDetailsPanelProps) {
	const [file, setFile] = useState<FileRecord | null>(null);
	const [similar, setSimilar] = useState<SimilarFile[]>([]);
	const [loading, setLoading] = useState(false);
	const [allClusters, setAllClusters] = useState<{ id: number; label: number; name: string }[]>([]);
	const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);
	const [moving, setMoving] = useState(false);
	const [moveMessage, setMoveMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

	const handleOpenFile = async (fileId: number) => {
		try {
			await openFile(fileId);
		} catch (error) {
			console.error("Failed to open file:", error);
		}
	};

	useEffect(() => {
		if (fileId === null) {
			setFile(null);
			setSimilar([]);
			return;
		}
		setLoading(true);
		Promise.all([
			getFileById(fileId),
			getSimilarFiles(fileId, 5),
		])
			.then(([fileData, simData]) => {
				setFile(fileData);
				setSimilar(simData.similar || []);
			})
			.catch(() => {
				setFile(null);
				setSimilar([]);
			})
			.finally(() => setLoading(false));
	}, [fileId]);

	// Load all clusters for the move dropdown
	useEffect(() => {
		getClusters()
			.then((res) =>
				setAllClusters(
					(res.clusters || []).map((c: any) => ({
						id: c.id,
						label: c.label,
						name: c.name,
					})),
				),
			)
			.catch(() => setAllClusters([]));
	}, [fileId]);

	const handleMoveToCluster = async (targetLabel: number) => {
		if (!file) return;
		setMoving(true);
		setMoveMessage(null);
		try {
			const result = await moveNode(file.id, targetLabel);
			setMoveMessage({
				text: `Moved to "${result.to_cluster_name}"${result.source_cluster_removed ? " (old cluster removed)" : ""}`,
				type: "success",
			});
			setMoveDropdownOpen(false);
			// Refresh file data
			const updatedFile = await getFileById(file.id);
			setFile(updatedFile);
			// Refresh clusters list
			const res = await getClusters();
			setAllClusters(
				(res.clusters || []).map((c: any) => ({
					id: c.id,
					label: c.label,
					name: c.name,
				})),
			);
			// Notify parent to refresh graph
			if (onNodeMoved) onNodeMoved();
			// Clear message after 3 seconds
			setTimeout(() => setMoveMessage(null), 3000);
		} catch (err: any) {
			setMoveMessage({
				text: err.message || "Failed to move file",
				type: "error",
			});
		} finally {
			setMoving(false);
		}
	};

	// Nothing selected at all
	if (fileId === null && clusterSelection === null) return null;

	// ─── Cluster children mode ─────────────────────────────────────────
	if (clusterSelection !== null && fileId === null) {
		return (
			<div className="w-80 bg-claude-surface border-l border-claude-border flex flex-col h-full overflow-hidden shrink-0">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-claude-border">
					<span className="text-sm font-semibold text-claude-text">
						Cluster Details
					</span>
					<button
						onClick={onClose}
						className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-bg transition-colors text-xs">
						✕
					</button>
				</div>

				{/* Cluster identity */}
				<div className="px-4 py-4 border-b border-claude-border">
					<div className="flex items-center gap-3">
						<div
							className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
							style={{ backgroundColor: clusterColor }}>
							<span className="text-white text-sm font-bold">
								{clusterSelection.children.length}
							</span>
						</div>
						<div className="min-w-0">
							<h3 className="text-sm font-semibold text-claude-text">
								{clusterSelection.clusterName}
							</h3>
							<p className="text-[11px] text-claude-muted mt-0.5">
								{clusterSelection.children.length} file{clusterSelection.children.length !== 1 ? "s" : ""} in this cluster
							</p>
						</div>
					</div>
				</div>

				{/* Children list */}
				<div className="flex-1 overflow-auto">
					<div className="px-4 py-3">
						<div className="text-[11px] text-claude-muted font-medium uppercase tracking-wider mb-2">
							FILES IN CLUSTER
						</div>
						<div className="space-y-0.5">
							{clusterSelection.children.map((child) => {
								const ext = getExtFromFilename(child.label);
								const extInfo = getExtIcon(ext);
								return (
									<button
										key={child.id}
										onClick={() => {
											if (onFileSelect) {
												onFileSelect(child.id, clusterSelection.clusterId);
											}
										}}
										className="w-full flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-claude-bg/50 transition-colors text-left group">
										<div
											className={`w-7 h-7 ${extInfo.bg} rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>
											{extInfo.label}
										</div>
										<div className="min-w-0 flex-1">
											<span className="text-xs text-claude-text group-hover:text-white truncate block">
												{child.label}
											</span>
											<span className="text-[10px] text-claude-muted">
												ID: {child.id}
											</span>
										</div>
										<span
											className="w-2 h-2 rounded-full shrink-0"
											style={{ backgroundColor: clusterColor }}
										/>
									</button>
								);
							})}
						</div>
					</div>
				</div>

				{/* Gap Analysis button */}
				{onGapAnalysis && (
				<div className="px-4 pb-4 pt-3 border-t border-claude-border">
					<button
						onClick={onGapAnalysis}
						className="group w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-400/50 text-violet-300 hover:text-violet-200">
						<span className="flex items-center gap-2">
							<svg className="w-4 h-4 text-violet-400 group-hover:text-violet-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<circle cx="12" cy="12" r="3"/>
								<path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
							</svg>
							Analyze Knowledge Gaps
						</span>
						<svg className="w-3.5 h-3.5 text-violet-500 group-hover:text-violet-300 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M5 12h14M12 5l7 7-7 7"/>
						</svg>
						</button>
					</div>
				)}
			</div>
		);
	}

	// ─── Single file details mode ──────────────────────────────────────
	const extInfo = file ? getExtIcon(file.extension) : { label: "...", bg: "bg-claude-muted" };

	return (
		<div className="w-80 bg-claude-surface border-l border-claude-border flex flex-col h-full overflow-hidden shrink-0">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-claude-border">
				<span className="text-sm font-semibold text-claude-text">File Details</span>
				<button
					onClick={onClose}
					className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-bg transition-colors text-xs">
					✕
				</button>
			</div>

			{loading ? (
				<div className="flex-1 flex items-center justify-center">
					<div className="text-claude-muted text-sm animate-pulse">Loading...</div>
				</div>
			) : file ? (
				<div className="flex-1 overflow-auto">
					{/* File identity */}
					<div className="px-4 py-4 border-b border-claude-border">
						<div className="flex items-start gap-3">
							<div
								className={`w-10 h-10 ${extInfo.bg} rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0`}>
								{extInfo.label}
							</div>
							<div className="min-w-0 flex-1">
								<button
									onClick={() => handleOpenFile(file.id)}
									className="text-sm font-semibold text-claude-text hover:text-claude-accent truncate block w-full text-left transition-colors"
									title="Click to open file">
									{file.filename}
								</button>
								<p className="text-[11px] text-claude-muted mt-0.5">
									{file.extension?.toUpperCase().replace(".", "") || "FILE"} • ID: {file.id}
								</p>
							</div>
						</div>

						{/* Cluster tag */}
						{file.cluster_name && (
							<div className="mt-3 flex items-center gap-2">
								<span className="text-[11px] text-claude-muted">🏷</span>
								<span
									className="text-xs font-medium px-2 py-0.5 rounded-full"
									style={{
										backgroundColor: clusterColor + "22",
										color: clusterColor,
									}}>
									{file.cluster_name}
								</span>
							</div>
						)}
					</div>

					{/* Summary */}
					{file.content_preview && (
						<div className="px-4 py-3 border-b border-claude-border">
							<div className="text-[11px] text-claude-muted font-medium uppercase tracking-wider mb-1.5">
								Summary
							</div>
							<p className="text-xs text-claude-text/80 leading-relaxed line-clamp-6">
								{file.content_preview}
							</p>
						</div>
					)}

					{/* Path */}
					<div className="px-4 py-3 border-b border-claude-border">
						<div className="text-[11px] text-claude-muted font-medium uppercase tracking-wider mb-1.5">
							Path
						</div>
						<div className="text-[11px] text-claude-text/70 font-mono bg-claude-bg rounded px-2 py-1.5 break-all">
							{file.path}
						</div>
					</div>

					{/* Related Files */}
					{similar.length > 0 && (
						<div className="px-4 py-3">
							<div className="text-[11px] text-claude-muted font-medium uppercase tracking-wider mb-2">
								🔗 Related Files
							</div>
							<div className="space-y-1.5">
								{similar.map((s) => (
									<button
										key={s.file_id}
										onClick={() => {
											if (onFileSelect) {
												onFileSelect(s.file_id, s.cluster_id ?? 0);
											}
										}}
										className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-claude-bg/50 transition-colors cursor-pointer text-left">
										<span
											className="w-2 h-2 rounded-full shrink-0"
											style={{ backgroundColor: clusterColor }}
										/>
										<span className="text-xs text-claude-text hover:text-claude-accent truncate flex-1 transition-colors">
											{s.filename}
										</span>
										<span
											className="text-[11px] font-medium shrink-0"
											style={{ color: clusterColor }}>
											{Math.round(s.score * 100)}%
										</span>
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="flex-1 flex items-center justify-center text-claude-muted text-sm">
					File not found
				</div>
			)}

			{/* Action buttons */}
			{file && (
				<div className="p-4 border-t border-claude-border space-y-2">
					<button
						className="w-full py-2 text-sm font-medium rounded-lg transition-colors"
						style={{
							backgroundColor: clusterColor + "cc",
							color: "white",
						}}
						onClick={() => handleOpenFile(file.id)}>
						📂 Open File
					</button>
					<button
						className="w-full py-2 text-sm font-medium rounded-lg transition-colors bg-claude-bg hover:bg-claude-border text-claude-text"
						onClick={() => {
							navigator.clipboard.writeText(file.path);
						}}>
						📋 Copy Path
					</button>

					{/* Move to Cluster */}
					<div className="relative">
						<button
							className="w-full py-2 text-sm font-medium rounded-lg transition-colors bg-claude-bg hover:bg-claude-border text-claude-text flex items-center justify-center gap-2"
							onClick={() => setMoveDropdownOpen(!moveDropdownOpen)}
							disabled={moving}>
							{moving ? (
								<span className="animate-pulse">Moving...</span>
							) : (
								<>
									<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
									</svg>
									Move to Cluster
								</>
							)}
						</button>

						{moveDropdownOpen && (
							<div className="absolute bottom-full left-0 right-0 mb-1 bg-claude-surface border border-claude-border rounded-lg shadow-xl z-50 max-h-48 overflow-auto">
								<div className="py-1">
									{allClusters
										.filter((c) => c.label !== file.cluster_id)
										.map((c) => (
											<button
												key={c.label}
												onClick={() => handleMoveToCluster(c.label)}
												className="w-full text-left px-3 py-2 text-xs text-claude-text hover:bg-claude-bg/70 transition-colors flex items-center gap-2">
												<span
													className="w-2.5 h-2.5 rounded-full shrink-0"
													style={{
														backgroundColor:
															["#D97757","#3b82f6","#22c55e","#a855f7","#ec4899","#eab308","#06b6d4","#ef4444","#6366f1","#14b8a6","#f43f5e","#84cc16","#8b5cf6","#0ea5e9","#d946ef"][c.label % 15],
													}}
												/>
												<span className="truncate">{c.name}</span>
												<span className="text-claude-muted ml-auto shrink-0 text-[10px]">
													#{c.label}
												</span>
											</button>
										))}
									{allClusters.filter((c) => c.label !== file.cluster_id).length === 0 && (
										<div className="px-3 py-2 text-xs text-claude-muted">
											No other clusters available
										</div>
									)}
								</div>
							</div>
						)}
					</div>

					{/* Move feedback message */}
					{moveMessage && (
						<div
							className={`text-xs px-3 py-2 rounded-lg ${
								moveMessage.type === "success"
									? "bg-green-500/15 text-green-400 border border-green-500/30"
									: "bg-red-500/15 text-red-400 border border-red-500/30"
							}`}>
							{moveMessage.text}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

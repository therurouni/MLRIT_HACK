import { useEffect, useState } from "react";
import { getFileById, getSimilarFiles } from "../api";
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
}: FileDetailsPanelProps) {
	const [file, setFile] = useState<FileRecord | null>(null);
	const [similar, setSimilar] = useState<SimilarFile[]>([]);
	const [loading, setLoading] = useState(false);

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
							Files in Cluster
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
							<div className="min-w-0">
								<h3 className="text-sm font-semibold text-claude-text truncate">
									{file.filename}
								</h3>
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
									<div
										key={s.file_id}
										className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-claude-bg/50 transition-colors">
										<span
											className="w-2 h-2 rounded-full shrink-0"
											style={{ backgroundColor: clusterColor }}
										/>
										<span className="text-xs text-claude-text truncate flex-1">
											{s.filename}
										</span>
										<span
											className="text-[11px] font-medium shrink-0"
											style={{ color: clusterColor }}>
											{Math.round(s.score * 100)}%
										</span>
									</div>
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

			{/* Copy Path button */}
			{file && (
				<div className="p-4 border-t border-claude-border">
					<button
						className="w-full py-2 text-sm font-medium rounded-lg transition-colors"
						style={{
							backgroundColor: clusterColor + "cc",
							color: "white",
						}}
						onClick={() => {
							navigator.clipboard.writeText(file.path);
						}}>
						📋 Copy Path
					</button>
				</div>
			)}
		</div>
	);
}

import type { FileRecord } from "../types";
import { openFile } from "../api";

interface FileListProps {
	files: FileRecord[];
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function timeAgo(timestamp: number): string {
	const seconds = Math.floor(Date.now() / 1000 - timestamp);
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

const clusterColors = [
	"bg-blue-500/20 text-blue-300",
	"bg-green-500/20 text-green-300",
	"bg-purple-500/20 text-purple-300",
	"bg-orange-500/20 text-orange-300",
	"bg-pink-500/20 text-pink-300",
	"bg-cyan-500/20 text-cyan-300",
	"bg-yellow-500/20 text-yellow-300",
	"bg-red-500/20 text-red-300",
	"bg-indigo-500/20 text-indigo-300",
	"bg-teal-500/20 text-teal-300",
];

function getClusterColor(clusterId: number | null): string {
	if (clusterId === null || clusterId < 0)
		return "bg-gray-500/20 text-gray-400";
	return clusterColors[clusterId % clusterColors.length];
}

export default function FileList({ files }: FileListProps) {
	const handleFileClick = async (fileId: number) => {
		try {
			await openFile(fileId);
		} catch (error) {
			console.error("Failed to open file:", error);
		}
	};

	if (files.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-claude-muted">
				<div className="text-4xl mb-4 text-claude-accent font-bold">--</div>
				<h2 className="text-xl font-semibold mb-2">No files yet</h2>
				<p className="text-sm">
					Drop files into your root folder or click "Scan Files" to start.
				</p>
			</div>
		);
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-semibold">Files ({files.length})</h2>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-claude-border text-claude-muted text-left">
							<th className="pb-2 pr-4 font-medium">Name</th>
							<th className="pb-2 pr-4 font-medium">Ext</th>
							<th className="pb-2 pr-4 font-medium">Size</th>
							<th className="pb-2 pr-4 font-medium">Cluster</th>
							<th className="pb-2 pr-4 font-medium">Embedded</th>
							<th className="pb-2 font-medium">Updated</th>
						</tr>
					</thead>
					<tbody>
						{files.map((file) => (
							<tr
								key={file.id}
								className="border-b border-claude-border/50 hover:bg-claude-bg/50 transition-colors">
								<td className="py-2 pr-4">
									<div className="flex items-center gap-2">
										<span className="text-base text-claude-muted">
											{file.faiss_id !== null ? "*" : "~"}
										</span>
										<button
											onClick={() => handleFileClick(file.id)}
											className="truncate max-w-xs text-left hover:text-claude-accent hover:underline cursor-pointer transition-colors"
											title={`${file.path} (click to open)`}>
											{file.filename}
										</button>
									</div>
								</td>
								<td className="py-2 pr-4 text-claude-muted">
									{file.extension || "—"}
								</td>
								<td className="py-2 pr-4 text-claude-muted">
									{formatBytes(file.size_bytes)}
								</td>
								<td className="py-2 pr-4">
									{file.cluster_name ? (
										<span
											className={`inline-block px-2 py-0.5 rounded-full text-xs ${getClusterColor(
												file.cluster_id,
											)}`}>
											{file.cluster_name}
										</span>
									) : (
										<span className="text-claude-muted text-xs">—</span>
									)}
								</td>
								<td className="py-2 pr-4">
									{file.faiss_id !== null ? (
										<span className="text-claude-success text-xs">✓</span>
									) : (
										<span className="text-claude-muted text-xs">—</span>
									)}
								</td>
								<td className="py-2 text-claude-muted text-xs">
									{timeAgo(file.updated_at)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

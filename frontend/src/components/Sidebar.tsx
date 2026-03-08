import { useState } from "react";
import { setRoot as apiSetRoot } from "../api";
import type { ViewTab } from "../types";

interface SidebarProps {
	activeTab: ViewTab;
	onTabChange: (tab: ViewTab) => void;
	root: string;
	ollamaOk: boolean;
	vectorCount: number;
	fileCount: number;
	wsConnected: boolean;
	onScanAndCluster: (organize: boolean) => void;
	processing: boolean;
	processingStatus: string;
	onRootChange: (root: string) => void;
}

const tabs: { id: ViewTab; label: string; icon: string }[] = [
	{ id: "files", label: "Files", icon: "" },
	{ id: "graph", label: "Graph", icon: "" },
	{ id: "umap", label: "UMAP", icon: "" },
	{ id: "search", label: "Search", icon: "" },
	{ id: "chat", label: "Chat", icon: "" },
];

export default function Sidebar({
	activeTab,
	onTabChange,
	root,
	ollamaOk,
	vectorCount,
	fileCount,
	wsConnected,
	onScanAndCluster,
	processing,
	processingStatus,
	onRootChange,
}: SidebarProps) {
	const [rootInput, setRootInput] = useState("");
	const [changingRoot, setChangingRoot] = useState(false);

	const handleSetRoot = async () => {
		if (!rootInput.trim()) return;
		try {
			const res = await apiSetRoot(rootInput.trim());
			onRootChange(res.root);
			setRootInput("");
			setChangingRoot(false);
		} catch (e: any) {
			alert("Failed to set root: " + e.message);
		}
	};

	return (
		<aside className="w-64 bg-sefs-surface border-r border-sefs-border flex flex-col h-full">
			{/* Header */}
			<div className="p-4 border-b border-sefs-border">
				<h1 className="text-xl font-bold text-sefs-accent">SEFS</h1>
				<p className="text-xs text-sefs-muted mt-1">
					Semantic Entropy File System
				</p>
			</div>

			{/* Status indicators */}
			<div className="px-4 py-3 border-b border-sefs-border space-y-1.5">
				<div className="flex items-center gap-2 text-xs">
					<span
						className={`w-2 h-2 rounded-full ${ollamaOk ? "bg-sefs-success" : "bg-sefs-error"}`}
					/>
					<span className="text-sefs-muted">
						Ollama {ollamaOk ? "Connected" : "Offline"}
					</span>
				</div>
				<div className="flex items-center gap-2 text-xs">
					<span
						className={`w-2 h-2 rounded-full ${wsConnected ? "bg-sefs-success" : "bg-sefs-error"}`}
					/>
					<span className="text-sefs-muted">
						WebSocket {wsConnected ? "Live" : "Disconnected"}
					</span>
				</div>
				<div className="text-xs text-sefs-muted">
					{fileCount} files · {vectorCount} vectors
				</div>
			</div>

			{/* Root folder */}
			<div className="px-4 py-3 border-b border-sefs-border">
				<div className="text-xs text-sefs-muted mb-1">Root Folder</div>
				<div className="text-xs text-sefs-text truncate" title={root}>
					{root || "Not set"}
				</div>
				{changingRoot ? (
					<div className="mt-2 space-y-1">
						<input
							type="text"
							value={rootInput}
							onChange={(e) => setRootInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleSetRoot()}
							placeholder="/path/to/folder"
							className="w-full px-2 py-1 text-xs bg-sefs-bg border border-sefs-border rounded text-sefs-text focus:outline-none focus:border-sefs-accent"
						/>
						<div className="flex gap-1">
							<button
								onClick={handleSetRoot}
								className="flex-1 px-2 py-1 text-xs bg-sefs-accent text-white rounded hover:bg-sefs-accentHover">
								Set
							</button>
							<button
								onClick={() => setChangingRoot(false)}
								className="flex-1 px-2 py-1 text-xs bg-sefs-bg text-sefs-muted rounded hover:text-sefs-text">
								Cancel
							</button>
						</div>
					</div>
				) : (
					<button
						onClick={() => setChangingRoot(true)}
						className="mt-1 text-xs text-sefs-accent hover:text-sefs-accentHover">
						Change
					</button>
				)}
			</div>

			{/* Navigation tabs */}
			<nav className="flex-1 py-2">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
							activeTab === tab.id
								? "bg-sefs-accent/10 text-sefs-accent border-r-2 border-sefs-accent"
								: "text-sefs-muted hover:text-sefs-text hover:bg-sefs-bg/50"
						}`}>
						<span>{tab.icon}</span>
						<span>{tab.label}</span>
					</button>
				))}
			</nav>

			{/* Actions */}
			<div className="p-4 border-t border-sefs-border space-y-2">
				{processing ? (
					<div className="w-full px-3 py-2 text-sm text-center text-sefs-muted bg-sefs-surface border border-sefs-border rounded-lg">
						<div className="flex items-center justify-center gap-2">
							<svg
								className="animate-spin h-4 w-4 text-sefs-accent"
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
							<span className="text-xs">{processingStatus}</span>
						</div>
					</div>
				) : (
					<>
						<button
							onClick={() => onScanAndCluster(false)}
							className="w-full px-3 py-2 text-sm bg-sefs-accent text-white rounded-lg hover:bg-sefs-accentHover transition-colors">
							Scan & Cluster
						</button>
						<button
							onClick={() => onScanAndCluster(true)}
							className="w-full px-3 py-2 text-sm bg-sefs-warning/10 text-sefs-warning border border-sefs-warning/30 rounded-lg hover:bg-sefs-warning/20 transition-colors">
							Scan, Cluster & Organize
						</button>
					</>
				)}
			</div>
		</aside>
	);
}

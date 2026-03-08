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
	onScanAndCluster: (basicOrganize: boolean, semanticOrganize: boolean) => void;
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
	const [basicOrganize, setBasicOrganize] = useState(false);
	const [semanticOrganize, setSemanticOrganize] = useState(false);

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
		<aside className="w-64 bg-claude-surface border-r border-claude-border flex flex-col h-full">
			{/* Header */}
			<div className="p-4 border-b border-claude-border">
				<h1 className="text-xl font-bold text-claude-accent">SEFS</h1>
				<p className="text-xs text-claude-muted mt-1">
					Semantic Entropy File System
				</p>
			</div>

			{/* Status indicators */}
			<div className="px-4 py-3 border-b border-claude-border space-y-1.5">
				<div className="flex items-center gap-2 text-xs">
					<span
						className={`w-2 h-2 rounded-full ${ollamaOk ? "bg-claude-success" : "bg-claude-error"}`}
					/>
					<span className="text-claude-muted">
						Ollama {ollamaOk ? "Connected" : "Offline"}
					</span>
				</div>
				<div className="flex items-center gap-2 text-xs">
					<span
						className={`w-2 h-2 rounded-full ${wsConnected ? "bg-claude-success" : "bg-claude-error"}`}
					/>
					<span className="text-claude-muted">
						WebSocket {wsConnected ? "Live" : "Disconnected"}
					</span>
				</div>
				<div className="text-xs text-claude-muted">
					{fileCount} files · {vectorCount} vectors
				</div>
			</div>

			{/* Root folder */}
			<div className="px-4 py-3 border-b border-claude-border">
				<div className="text-xs text-claude-muted mb-1">Root Folder</div>
				<div className="text-xs text-claude-text truncate" title={root}>
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
							className="w-full px-2 py-1 text-xs bg-claude-bg border border-claude-border rounded text-claude-text focus:outline-none focus:border-claude-accent"
						/>
						<div className="flex gap-1">
							<button
								onClick={handleSetRoot}
								className="flex-1 px-2 py-1 text-xs bg-claude-accent text-white rounded hover:bg-claude-accentHover">
								Set
							</button>
							<button
								onClick={() => setChangingRoot(false)}
								className="flex-1 px-2 py-1 text-xs bg-claude-bg text-claude-muted rounded hover:text-claude-text">
								Cancel
							</button>
						</div>
					</div>
				) : (
					<button
						onClick={() => setChangingRoot(true)}
						className="mt-1 text-xs text-claude-accent hover:text-claude-accentHover">
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
								? "bg-claude-accent/10 text-claude-accent border-r-2 border-claude-accent"
								: "text-claude-muted hover:text-claude-text hover:bg-claude-bg/50"
						}`}>
						<span>{tab.icon}</span>
						<span>{tab.label}</span>
					</button>
				))}
			</nav>

			{/* Actions */}
			<div className="p-4 border-t border-claude-border space-y-2">
				{processing ? (
					<div className="w-full px-3 py-2 text-sm text-center text-claude-muted bg-claude-surface border border-claude-border rounded-lg">
						<div className="flex items-center justify-center gap-2">
							<svg
								className="animate-spin h-4 w-4 text-claude-accent"
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
						{/* Organization mode checkboxes */}
						<div className="space-y-2">
							<div className="text-xs text-sefs-muted font-medium mb-1">
								Organization Options
							</div>
							<label className="flex items-start gap-2 cursor-pointer group">
								<input
									type="checkbox"
									checked={basicOrganize}
									onChange={(e) => setBasicOrganize(e.target.checked)}
									className="mt-0.5 w-3.5 h-3.5 rounded border-sefs-border text-sefs-accent focus:ring-sefs-accent bg-sefs-bg"
								/>
								<div>
									<span className="text-xs text-sefs-text group-hover:text-sefs-accent transition-colors">
										Basic Organize
									</span>
									<p className="text-[10px] text-sefs-muted leading-tight mt-0.5">
										Sort files by type (Images, Documents, Code, etc.) in the
										original folder
									</p>
								</div>
							</label>
							<label className="flex items-start gap-2 cursor-pointer group">
								<input
									type="checkbox"
									checked={semanticOrganize}
									onChange={(e) => setSemanticOrganize(e.target.checked)}
									className="mt-0.5 w-3.5 h-3.5 rounded border-sefs-border text-sefs-accent focus:ring-sefs-accent bg-sefs-bg"
								/>
								<div>
									<span className="text-xs text-sefs-text group-hover:text-sefs-accent transition-colors">
										Semantic Organize
									</span>
									<p className="text-[10px] text-sefs-muted leading-tight mt-0.5">
										Cluster by content and organize into a <em>-semantic</em>{" "}
										replica folder
									</p>
								</div>
							</label>
						</div>

						<button
							onClick={() => onScanAndCluster(basicOrganize, semanticOrganize)}
							className="w-full px-3 py-2 text-sm bg-sefs-accent text-white rounded-lg hover:bg-sefs-accentHover transition-colors">
							{basicOrganize && !semanticOrganize
								? "Organize by Type"
								: semanticOrganize
									? "Scan, Cluster & Organize"
									: "Scan & Cluster"}
						</button>
					</>
				)}
			</div>
		</aside>
	);
}

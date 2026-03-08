import { useState } from "react";
import { setRoot as apiSetRoot } from "../api";

interface SettingsDrawerProps {
	open: boolean;
	onClose: () => void;
	root: string;
	ollamaOk: boolean;
	vectorCount: number;
	fileCount: number;
	wsConnected: boolean;
	onRootChange: (root: string) => void;
	onScanAndCluster: (basicOrganize: boolean, semanticOrganize: boolean) => void;
	processing: boolean;
	processingStatus: string;
}

export default function SettingsDrawer({
	open,
	onClose,
	root,
	ollamaOk,
	vectorCount,
	fileCount,
	wsConnected,
	onRootChange,
	onScanAndCluster,
	processing,
	processingStatus,
}: SettingsDrawerProps) {
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

	if (!open) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/40 z-40"
				onClick={onClose}
			/>

			{/* Drawer */}
			<div className="fixed right-0 top-0 bottom-0 w-80 bg-claude-surface border-l border-claude-border z-50 flex flex-col shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-claude-border">
					<h2 className="text-sm font-semibold">Settings</h2>
					<button
						onClick={onClose}
						className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text text-xs">
						✕
					</button>
				</div>

				<div className="flex-1 overflow-auto">
					{/* Status */}
					<div className="px-4 py-3 border-b border-claude-border space-y-2">
						<div className="text-[11px] font-medium text-claude-muted uppercase tracking-wider">
							Status
						</div>
						<div className="space-y-1.5">
							<div className="flex items-center gap-2 text-xs">
								<span
									className={`w-2 h-2 rounded-full ${
										ollamaOk ? "bg-green-400" : "bg-red-400"
									}`}
								/>
								<span className="text-claude-text/80">
									Ollama {ollamaOk ? "Connected" : "Offline"}
								</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<span
									className={`w-2 h-2 rounded-full ${
										wsConnected ? "bg-green-400" : "bg-red-400"
									}`}
								/>
								<span className="text-claude-text/80">
									WebSocket {wsConnected ? "Live" : "Disconnected"}
								</span>
							</div>
							<div className="text-xs text-claude-muted mt-1">
								{fileCount} files · {vectorCount} vectors
							</div>
						</div>
					</div>

					{/* Root folder */}
					<div className="px-4 py-3 border-b border-claude-border">
						<div className="text-[11px] font-medium text-claude-muted uppercase tracking-wider mb-2">
							Root Folder
						</div>
						<div
							className="text-xs text-claude-text/80 font-mono bg-claude-bg rounded px-2 py-1.5 truncate mb-2"
							title={root}>
							{root || "Not set"}
						</div>
						{changingRoot ? (
							<div className="space-y-2">
								<input
									type="text"
									value={rootInput}
									onChange={(e) => setRootInput(e.target.value)}
									onKeyDown={(e) =>
										e.key === "Enter" && handleSetRoot()
									}
									placeholder="/path/to/folder"
									className="w-full px-2 py-1.5 text-xs bg-claude-bg border border-claude-border rounded text-claude-text focus:outline-none focus:border-claude-accent"
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
								className="text-xs text-claude-accent hover:text-claude-accentHover">
								Change
							</button>
						)}
					</div>

					{/* Organize options */}
					<div className="px-4 py-3">
						<div className="text-[11px] font-medium text-claude-muted uppercase tracking-wider mb-2">
							Organization Options
						</div>
						<div className="space-y-2">
							<label className="flex items-start gap-2 cursor-pointer group">
								<input
									type="checkbox"
									checked={basicOrganize}
									onChange={(e) =>
										setBasicOrganize(e.target.checked)
									}
									className="mt-0.5 w-3.5 h-3.5 rounded border-claude-border text-claude-accent focus:ring-claude-accent bg-claude-bg"
								/>
								<div>
									<span className="text-xs text-claude-text group-hover:text-claude-accent transition-colors">
										Basic Organize
									</span>
									<p className="text-[10px] text-claude-muted leading-tight mt-0.5">
										Sort files by type
									</p>
								</div>
							</label>
							<label className="flex items-start gap-2 cursor-pointer group">
								<input
									type="checkbox"
									checked={semanticOrganize}
									onChange={(e) =>
										setSemanticOrganize(e.target.checked)
									}
									className="mt-0.5 w-3.5 h-3.5 rounded border-claude-border text-claude-accent focus:ring-claude-accent bg-claude-bg"
								/>
								<div>
									<span className="text-xs text-claude-text group-hover:text-claude-accent transition-colors">
										Semantic Organize
									</span>
									<p className="text-[10px] text-claude-muted leading-tight mt-0.5">
										Cluster by content into semantic folder
									</p>
								</div>
							</label>
						</div>

						<button
							onClick={() => {
								onScanAndCluster(basicOrganize, semanticOrganize);
								onClose();
							}}
							disabled={processing}
							className="w-full mt-3 px-3 py-2 text-xs bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover transition-colors disabled:opacity-50">
							{processing
								? processingStatus || "Processing..."
								: basicOrganize && !semanticOrganize
									? "Organize by Type"
									: semanticOrganize
										? "Scan, Cluster & Organize"
										: "Scan & Cluster"}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

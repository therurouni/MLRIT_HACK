import type { ViewTab } from "../types";

interface TopNavProps {
	activeTab: ViewTab;
	onTabChange: (tab: ViewTab) => void;
	fileCount: number;
	clusterCount: number;
	wsConnected: boolean;
	processing: boolean;
	processingStatus: string;
	onRescan: () => void;
	searchQuery: string;
	onSearchChange: (q: string) => void;
	onSearchSubmit: () => void;
	onSettingsClick: () => void;
}

export default function TopNav({
	activeTab,
	onTabChange,
	fileCount,
	clusterCount,
	wsConnected,
	processing,
	processingStatus,
	onRescan,
	searchQuery,
	onSearchChange,
	onSettingsClick,
	onSearchSubmit,
}: TopNavProps) {

	return (
		<header className="h-14 bg-claude-surface border-b border-claude-border flex items-center px-4 gap-4 shrink-0">
			{/* Logo */}
			<div className="flex items-center gap-2 mr-2">
				<span className="text-claude-accent font-bold text-lg tracking-tight font-serif italic">
					SEFS
				</span>
			</div>

			{/* View tabs */}
			<div className="flex bg-claude-bg rounded-lg p-0.5 gap-0.5">
				{(
					[
						{ id: "graph" as ViewTab, label: "Graph", icon: "◎" },
						{ id: "umap" as ViewTab, label: "Spatial", icon: "◫" },
					] as const
				).map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
							activeTab === tab.id
								? "bg-claude-accent text-white shadow-sm"
								: "text-claude-muted hover:text-claude-text"
						}`}>
						<span className="mr-1">{tab.icon}</span>
						{tab.label}
					</button>
				))}
			</div>

			{/* More tabs */}
			<div className="flex gap-1">
				{(
					[
						{ id: "files" as ViewTab, label: "Files" },
						{ id: "search" as ViewTab, label: "Search" },
						{ id: "chat" as ViewTab, label: "Chat" },
					] as const
				).map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={`px-2.5 py-1.5 text-xs rounded-md transition-all ${
							activeTab === tab.id
								? "text-claude-accent bg-claude-accent/10"
								: "text-claude-muted hover:text-claude-text"
						}`}>
						{tab.label}
					</button>
				))}
			</div>

			{/* Search bar */}
			<div className="flex-1 max-w-md mx-4">
				<div className="relative">
					<span className="absolute left-3 top-1/2 -translate-y-1/2 text-claude-muted text-xs">
						Q
					</span>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") onSearchSubmit();
						}}
						placeholder="Search files semantically..."
						className="w-full pl-8 pr-10 py-1.5 text-xs bg-claude-bg border border-claude-border rounded-lg text-claude-text placeholder-claude-muted focus:outline-none focus:border-claude-accent"
					/>
					<span className="absolute right-3 top-1/2 -translate-y-1/2 text-claude-muted text-[10px] border border-claude-border rounded px-1">
						⌘K
					</span>
				</div>
			</div>

			{/* Stats */}
			<div className="flex items-center gap-3 text-xs text-claude-muted">
				<span>📄 {fileCount} files</span>
				<span>📁 {clusterCount} clusters</span>
			</div>

			{/* Rescan button */}
			<button
				onClick={onRescan}
				disabled={processing}
				className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
					processing
						? "bg-claude-accent/50 text-white/70 cursor-wait"
						: "bg-claude-accent text-white hover:bg-claude-accentHover"
				}`}>
				{processing ? (
					<span className="flex items-center gap-1.5">
						<svg
							className="animate-spin h-3 w-3"
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
						{processingStatus || "Processing..."}
					</span>
				) : (
					"Rescan"
				)}
			</button>

			{/* Right icons */}
			<div className="flex items-center gap-2 ml-2">
				{/* Settings */}
				<button
					onClick={onSettingsClick}
					className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-bg transition-colors text-sm">
					⚙
				</button>

				{/* Live indicator */}
				<div className="flex items-center gap-1.5 pl-2 border-l border-claude-border">
					<span
						className={`w-2 h-2 rounded-full ${
							wsConnected
								? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]"
								: "bg-red-400"
						}`}
					/>
					<span
						className={`text-xs font-medium ${
							wsConnected ? "text-green-400" : "text-red-400"
						}`}>
						{wsConnected ? "Live" : "Offline"}
					</span>
				</div>
			</div>
		</header>
	);
}

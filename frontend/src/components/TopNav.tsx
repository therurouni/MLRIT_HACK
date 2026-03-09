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
	theme: "dark" | "light";
	onThemeToggle: () => void;
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
	theme,
	onThemeToggle,
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
						{ id: "timeline" as ViewTab, label: "Timeline", icon: "⏤" },
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

			{/* Search bar — clickable to open modal */}
			<div className="flex-1 max-w-md mx-4">
				<button
					onClick={onSearchSubmit}
					className="w-full flex items-center px-3 py-1.5 text-xs bg-claude-bg border border-claude-border rounded-lg text-claude-muted hover:border-claude-accent/50 transition-colors text-left">
					<span className="mr-2">Q</span>
					<span className="flex-1">Search files semantically...</span>
					<span className="text-[10px] border border-claude-border rounded px-1 ml-2">
						Ctrl+K
					</span>
				</button>
			</div>

			{/* Stats */}
			<div className="flex items-center gap-3 text-xs text-claude-muted">
				<span className="flex items-center gap-1">
					<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
						<path d="M14 2v4a2 2 0 0 0 2 2h4"/>
						<path d="M10 12h4M10 16h4"/>
					</svg>
					{fileCount} files
				</span>
				<span className="flex items-center gap-1">
					<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M3 2h7v7H3zM14 2h7v7h-7zM14 15h7v7h-7zM3 15h7v7H3z"/>
					</svg>
					{clusterCount} clusters
				</span>
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
				{/* Theme toggle */}
				<button
					onClick={onThemeToggle}
					className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-bg transition-colors"
					title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
					{theme === "dark" ? (
						<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					) : (
						<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="5"/>
							<line x1="12" y1="1" x2="12" y2="3"/>
							<line x1="12" y1="21" x2="12" y2="23"/>
							<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
							<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
							<line x1="1" y1="12" x2="3" y2="12"/>
							<line x1="21" y1="12" x2="23" y2="12"/>
							<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
							<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
						</svg>
					)}
				</button>

				{/* Settings */}
				<button
					onClick={onSettingsClick}
					className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-bg transition-colors">
					<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
						<circle cx="12" cy="12" r="3"/>
					</svg>
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

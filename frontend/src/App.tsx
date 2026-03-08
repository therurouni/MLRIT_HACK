import { useState, useEffect, useCallback, useRef } from "react";
import type { ViewTab, FileRecord, WSEvent } from "./types";
import {
	getFiles,
	getHealth,
	scanFiles,
	recluster,
	basicOrganize,
	getClusters,
} from "./api";
import { useWebSocket } from "./hooks/useWebSocket";
import TopNav from "./components/TopNav";
import FileList from "./components/FileList";
import ForceGraph from "./components/ForceGraph";
import UmapView from "./components/UmapView";
import SearchBar from "./components/SearchBar";
import ChatPanel from "./components/ChatPanel";
import ActivityBar from "./components/ActivityBar";
import FileDetailsPanel, { type ClusterSelection } from "./components/FileDetailsPanel";
import SettingsDrawer from "./components/SettingsDrawer";

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
	"#f43f5e",
	"#84cc16",
	"#8b5cf6",
	"#0ea5e9",
	"#d946ef",
];

function getClusterColor(clusterId: number): string {
	if (clusterId < 0) return "#4b5563";
	return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

export default function App() {
	const [activeTab, setActiveTab] = useState<ViewTab>("graph");
	const [files, setFiles] = useState<FileRecord[]>([]);
	const [root, setRoot] = useState<string>("");
	const [ollamaOk, setOllamaOk] = useState(false);
	const [vectorCount, setVectorCount] = useState(0);
	const [clusterCount, setClusterCount] = useState(0);
	const [processing, setProcessing] = useState(false);
	const [processingStatus, setProcessingStatus] = useState("");
	const pendingOrganize = useRef(false);
	const pendingSemanticOrganize = useRef(false);
	const pendingBasicThenSemantic = useRef(false);
	const graphKeyRef = useRef(0);
	const umapKeyRef = useRef(0);
	const [graphKey, setGraphKey] = useState(0);
	const [umapKey, setUmapKey] = useState(0);
	const { connected, events, lastEvent } = useWebSocket();

	// File details panel state
	const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
	const [selectedClusterId, setSelectedClusterId] = useState<number>(0);
	const [clusterSelection, setClusterSelection] = useState<ClusterSelection | null>(null);

	// Settings drawer
	const [settingsOpen, setSettingsOpen] = useState(false);

	// Search
	const [searchQuery, setSearchQuery] = useState("");

	const loadFiles = useCallback(async () => {
		try {
			const res = await getFiles();
			setFiles(res.files);
		} catch {}
	}, []);

	const loadHealth = useCallback(async () => {
		try {
			const h = await getHealth();
			setRoot(h.root);
			setOllamaOk(h.ollama);
			setVectorCount(h.vectors);
		} catch {}
	}, []);

	const loadClusters = useCallback(async () => {
		try {
			const res = await getClusters();
			setClusterCount(res.total);
		} catch {}
	}, []);

	useEffect(() => {
		loadHealth();
		loadFiles();
		loadClusters();
	}, [loadHealth, loadFiles, loadClusters]);

	// State machine: react to WS events
	useEffect(() => {
		if (!lastEvent) return;
		const t = lastEvent.type;

		const refreshEvents = [
			"file_processed",
			"file_deleted",
			"scan_complete",
			"clustering_complete",
			"naming_complete",
			"files_organized",
			"basic_organize_complete",
			"organizing_complete",
		];
		if (refreshEvents.includes(t)) {
			loadFiles();
			loadHealth();
			loadClusters();
		}

		if (!processing) return;

		if (t === "basic_organize_complete") {
			if (pendingBasicThenSemantic.current) {
				pendingBasicThenSemantic.current = false;
				setProcessingStatus("Scanning files...");
				scanFiles(root, true).catch((e) => {
					setProcessing(false);
					setProcessingStatus("");
				});
			} else {
				setProcessing(false);
				setProcessingStatus("");
			}
		} else if (t === "scan_complete") {
			setProcessingStatus("Clustering files...");
			recluster(
				pendingOrganize.current,
				pendingSemanticOrganize.current,
			).catch(() => {
				setProcessing(false);
				setProcessingStatus("");
			});
		} else if (t === "clustering_complete") {
			setProcessingStatus("Naming clusters with LLM...");
		} else if (t === "naming_complete") {
			if (pendingOrganize.current || pendingSemanticOrganize.current) {
				setProcessingStatus("Organizing files...");
			} else {
				setProcessing(false);
				setProcessingStatus("");
				graphKeyRef.current += 1;
				umapKeyRef.current += 1;
				setGraphKey(graphKeyRef.current);
				setUmapKey(umapKeyRef.current);
			}
		} else if (t === "files_organized" || t === "organizing_complete") {
			setProcessing(false);
			setProcessingStatus("");
			graphKeyRef.current += 1;
			umapKeyRef.current += 1;
			setGraphKey(graphKeyRef.current);
			setUmapKey(umapKeyRef.current);
		} else if (t === "scan_error" || t === "clustering_error") {
			setProcessing(false);
			setProcessingStatus("");
		}
	}, [lastEvent, processing, loadFiles, loadHealth, loadClusters, root]);

	const handleScanAndCluster = async (
		doBasicOrganize: boolean,
		semanticOrganize: boolean,
	) => {
		pendingOrganize.current = semanticOrganize;
		pendingSemanticOrganize.current = semanticOrganize;
		pendingBasicThenSemantic.current = doBasicOrganize && semanticOrganize;
		setProcessing(true);

		try {
			if (doBasicOrganize) {
				setProcessingStatus("Organizing by file type...");
				await basicOrganize(root);
				return;
			}
			setProcessingStatus("Scanning files...");
			await scanFiles(root, semanticOrganize);
		} catch (e: any) {
			setProcessing(false);
			setProcessingStatus("");
		}
	};

	const handleRescan = () => {
		handleScanAndCluster(false, false);
	};

	const handleNodeClick = (nodeId: number, clusterId: number) => {
		setSelectedFileId(nodeId);
		setSelectedClusterId(clusterId);
		setClusterSelection(null); // switch to file mode
	};

	const handleClusterClick = (
		clusterId: number,
		clusterName: string,
		children: { id: number; label: string }[],
	) => {
		setClusterSelection({ clusterId, clusterName, children });
		setSelectedClusterId(clusterId);
		setSelectedFileId(null); // switch to cluster mode
	};

	const handleSearchSubmit = () => {
		if (searchQuery.trim()) {
			setActiveTab("search");
		}
	};

	return (
		<div className="flex flex-col h-screen overflow-hidden bg-claude-bg">
			{/* Top Navigation */}
			<TopNav
				activeTab={activeTab}
				onTabChange={setActiveTab}
				fileCount={files.length}
				clusterCount={clusterCount}
				wsConnected={connected}
				processing={processing}
				processingStatus={processingStatus}
				onRescan={handleRescan}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				onSearchSubmit={handleSearchSubmit}
				onSettingsClick={() => setSettingsOpen(true)}
			/>

			{/* Main content area */}
			<div className="flex-1 flex overflow-hidden">
				{/* Main panel */}
				<div className="flex-1 overflow-hidden">
					{activeTab === "graph" && (
						<ForceGraph
							key={graphKey}
							onNodeClick={handleNodeClick}
							onClusterClick={handleClusterClick}
							selectedNodeId={selectedFileId}
						/>
					)}
					{activeTab === "umap" && <UmapView key={umapKey} />}
					{activeTab === "files" && (
						<div className="p-4 h-full overflow-auto">
							<FileList files={files} />
						</div>
					)}
					{activeTab === "search" && (
						<div className="p-4 h-full overflow-auto">
							<SearchBar />
						</div>
					)}
					{activeTab === "chat" && (
						<div className="p-4 h-full overflow-hidden">
							<ChatPanel />
						</div>
					)}
				</div>

				{/* File Details Panel */}
				{(selectedFileId !== null || clusterSelection !== null) && (
					<FileDetailsPanel
						fileId={selectedFileId}
						clusterSelection={clusterSelection}
						clusterColor={getClusterColor(selectedClusterId)}
						onClose={() => {
							setSelectedFileId(null);
							setClusterSelection(null);
						}}
						onFileSelect={(fid, cid) => {
							setSelectedFileId(fid);
							setSelectedClusterId(cid);
							setClusterSelection(null);
						}}
					/>
				)}
			</div>

			{/* Activity Bar */}
			<ActivityBar events={events} connected={connected} />

			{/* Settings Drawer */}
			<SettingsDrawer
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				root={root}
				ollamaOk={ollamaOk}
				vectorCount={vectorCount}
				fileCount={files.length}
				wsConnected={connected}
				onRootChange={(newRoot: string) => {
					setRoot(newRoot);
					loadFiles();
					loadHealth();
					loadClusters();
				}}
				onScanAndCluster={handleScanAndCluster}
				processing={processing}
				processingStatus={processingStatus}
			/>
		</div>
	);
}

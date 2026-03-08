import { useState, useEffect, useCallback, useRef } from "react";
import type { ViewTab, FileRecord, WSEvent } from "./types";
import { getFiles, getHealth, scanFiles, recluster } from "./api";
import { useWebSocket } from "./hooks/useWebSocket";
import Sidebar from "./components/Sidebar";
import FileList from "./components/FileList";
import ForceGraph from "./components/ForceGraph";
import UmapView from "./components/UmapView";
import SearchBar from "./components/SearchBar";
import ChatPanel from "./components/ChatPanel";
import EventLog from "./components/EventLog";

export default function App() {
	const [activeTab, setActiveTab] = useState<ViewTab>("files");
	const [files, setFiles] = useState<FileRecord[]>([]);
	const [root, setRoot] = useState<string>("");
	const [ollamaOk, setOllamaOk] = useState(false);
	const [vectorCount, setVectorCount] = useState(0);
	const [processing, setProcessing] = useState(false);
	const [processingStatus, setProcessingStatus] = useState("");
	const pendingOrganize = useRef(false);
	const graphKeyRef = useRef(0);
	const umapKeyRef = useRef(0);
	const [graphKey, setGraphKey] = useState(0);
	const [umapKey, setUmapKey] = useState(0);
	const { connected, events, lastEvent } = useWebSocket();

	const loadFiles = useCallback(async () => {
		try {
			const res = await getFiles();
			setFiles(res.files);
		} catch {
			// silently fail
		}
	}, []);

	const loadHealth = useCallback(async () => {
		try {
			const h = await getHealth();
			setRoot(h.root);
			setOllamaOk(h.ollama);
			setVectorCount(h.vectors);
		} catch {
			// silently fail
		}
	}, []);

	useEffect(() => {
		loadHealth();
		loadFiles();
	}, [loadHealth, loadFiles]);

	// State machine: react to WS events for the scan→cluster→name pipeline
	useEffect(() => {
		if (!lastEvent) return;
		const t = lastEvent.type;

		// Always refresh file list on relevant events
		const refreshEvents = [
			"file_processed",
			"file_deleted",
			"scan_complete",
			"clustering_complete",
			"naming_complete",
			"files_organized",
		];
		if (refreshEvents.includes(t)) {
			loadFiles();
			loadHealth();
		}

		if (!processing) return;

		// Pipeline state machine
		if (t === "scan_complete") {
			setProcessingStatus("Clustering files...");
			recluster(pendingOrganize.current).catch((e) => {
				setProcessing(false);
				setProcessingStatus("");
				alert("Clustering failed: " + e.message);
			});
		} else if (t === "clustering_complete") {
			setProcessingStatus("Naming clusters with LLM...");
		} else if (t === "naming_complete") {
			if (pendingOrganize.current) {
				setProcessingStatus("Organizing files on disk...");
			} else {
				// Done! Refresh graphs
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
	}, [lastEvent, processing, loadFiles, loadHealth]);

	const handleScanAndCluster = async (organize: boolean) => {
		pendingOrganize.current = organize;
		setProcessing(true);
		setProcessingStatus("Scanning files...");
		try {
			await scanFiles(root);
		} catch (e: any) {
			setProcessing(false);
			setProcessingStatus("");
			alert("Scan failed: " + e.message);
		}
	};

	return (
		<div className="flex h-screen overflow-hidden">
			{/* Sidebar */}
			<Sidebar
				activeTab={activeTab}
				onTabChange={setActiveTab}
				root={root}
				ollamaOk={ollamaOk}
				vectorCount={vectorCount}
				fileCount={files.length}
				wsConnected={connected}
				onScanAndCluster={handleScanAndCluster}
				processing={processing}
				processingStatus={processingStatus}
				onRootChange={(newRoot: string) => {
					setRoot(newRoot);
					loadFiles();
					loadHealth();
				}}
			/>

			{/* Main Content */}
			<main className="flex-1 flex flex-col overflow-hidden">
				{/* Tab content */}
				<div className="flex-1 overflow-auto p-4">
					{activeTab === "files" && <FileList files={files} />}
					{activeTab === "graph" && <ForceGraph key={graphKey} />}
					{activeTab === "umap" && <UmapView key={umapKey} />}
					{activeTab === "search" && <SearchBar />}
					{activeTab === "chat" && <ChatPanel />}
				</div>

				{/* Event Log — always visible at bottom */}
				<EventLog events={events} connected={connected} />
			</main>
		</div>
	);
}

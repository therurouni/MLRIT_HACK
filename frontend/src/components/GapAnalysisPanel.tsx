import { useEffect, useRef, useState, useCallback } from "react";
import { getGapAnalysis } from "../api";
import type { GapAnalysisResult } from "../types";

// ── Radar Chart ───────────────────────────────────────────────────────────────

function RadarChart({
	existing,
	gaps,
}: {
	existing: { name: string; file_count: number }[];
	gaps: { topic: string; reason: string }[];
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const SIZE = 340;
		canvas.width = SIZE * dpr;
		canvas.height = SIZE * dpr;
		canvas.style.width = `${SIZE}px`;
		canvas.style.height = `${SIZE}px`;

		const ctx = canvas.getContext("2d")!;
		ctx.scale(dpr, dpr);

		const cx = SIZE / 2;
		const cy = SIZE / 2;
		const radius = 130;

		// All spokes = existing (green) + gaps (red), max 12 for readability
		const allTopics = [
			...existing.slice(0, 7).map((e) => ({ label: e.name, isGap: false, value: Math.min(1, e.file_count / 20) })),
			...gaps.slice(0, 5).map((g) => ({ label: g.topic, isGap: true, value: 0 })),
		];

		if (allTopics.length < 3) return;
		const n = allTopics.length;
		const angleStep = (Math.PI * 2) / n;

		// Draw grid rings
		ctx.strokeStyle = "rgba(255,255,255,0.08)";
		ctx.lineWidth = 1;
		for (let ring = 1; ring <= 4; ring++) {
			const r = (radius * ring) / 4;
			ctx.beginPath();
			for (let i = 0; i < n; i++) {
				const angle = i * angleStep - Math.PI / 2;
				const x = cx + Math.cos(angle) * r;
				const y = cy + Math.sin(angle) * r;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();
		}

		// Draw spokes
		for (let i = 0; i < n; i++) {
			const angle = i * angleStep - Math.PI / 2;
			ctx.strokeStyle = "rgba(255,255,255,0.12)";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
			ctx.stroke();
		}

		// Draw existing knowledge filled polygon
		const existingTopics = allTopics.filter((t) => !t.isGap);
		if (existingTopics.length >= 3) {
			const existingIndices = allTopics
				.map((t, i) => (!t.isGap ? i : -1))
				.filter((i) => i >= 0);

			ctx.beginPath();
			existingIndices.forEach((i, idx) => {
				const angle = i * angleStep - Math.PI / 2;
				const r = allTopics[i].value * radius;
				const x = cx + Math.cos(angle) * r;
				const y = cy + Math.sin(angle) * r;
				if (idx === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.closePath();
			ctx.fillStyle = "rgba(34, 197, 94, 0.18)";
			ctx.fill();
			ctx.strokeStyle = "rgba(34, 197, 94, 0.7)";
			ctx.lineWidth = 2;
			ctx.stroke();
		}

		// Draw dots + labels
		allTopics.forEach((topic, i) => {
			const angle = i * angleStep - Math.PI / 2;
			const r = topic.isGap ? 0 : topic.value * radius;
			const dotX = cx + Math.cos(angle) * (topic.isGap ? radius * 0.15 : r);
			const dotY = cy + Math.sin(angle) * (topic.isGap ? radius * 0.15 : r);

			// Dot
			ctx.beginPath();
			ctx.arc(dotX, dotY, topic.isGap ? 5 : 4, 0, Math.PI * 2);
			ctx.fillStyle = topic.isGap ? "rgba(239, 68, 68, 0.9)" : "rgba(34, 197, 94, 0.9)";
			ctx.fill();

			// Gap topic: draw dashed spoke to edge
			if (topic.isGap) {
				ctx.setLineDash([3, 4]);
				ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
				ctx.stroke();
				ctx.setLineDash([]);
			}

			// Label
			const labelR = radius + 22;
			const lx = cx + Math.cos(angle) * labelR;
			const ly = cy + Math.sin(angle) * labelR;

			ctx.font = "9px sans-serif";
			ctx.fillStyle = topic.isGap ? "rgba(239, 68, 68, 0.85)" : "rgba(134, 239, 172, 0.9)";
			ctx.textAlign = lx > cx + 5 ? "left" : lx < cx - 5 ? "right" : "center";
			ctx.textBaseline = ly < cy ? "bottom" : "top";

			// Truncate long labels
			const maxChars = 14;
			const label =
				topic.label.length > maxChars
					? topic.label.slice(0, maxChars - 1) + "…"
					: topic.label;
			ctx.fillText(label, lx, ly);
		});
	}, [existing, gaps]);

	return (
		<canvas
			ref={canvasRef}
			className="mx-auto block"
			style={{ width: 340, height: 340 }}
		/>
	);
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function GapAnalysisPanel() {
	const [result, setResult] = useState<GapAnalysisResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const runAnalysis = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getGapAnalysis();
			setResult(data);
		} catch (e: any) {
			setError(e.message ?? "Analysis failed");
		} finally {
			setLoading(false);
		}
	}, []);

	const maxFiles =
		result?.existing.reduce((m, e) => Math.max(m, e.file_count), 1) ?? 1;

	return (
		<div className="h-full overflow-auto p-6 max-w-5xl mx-auto">
			{/* Header */}
			<div className="flex items-start justify-between mb-6">
				<div>
					<h2 className="text-xl font-semibold text-claude-text flex items-center gap-2">
					<svg className="w-5 h-5 text-claude-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M3 3h7v7H3z"/>
						<path d="M14 3h7v7h-7z"/>
						<path d="M14 14h7v7h-7z"/>
						<path d="M3 14h7v7H3z"/>
					</svg>
					Knowledge Gap Analyzer
					</h2>
					<p className="text-sm text-claude-muted mt-1">
						AI-powered analysis of what's missing from your knowledge base
					</p>
				</div>
				<button
					onClick={runAnalysis}
					disabled={loading}
					className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
						loading
							? "bg-claude-accent/40 text-white/60 cursor-wait"
							: "bg-claude-accent text-white hover:bg-claude-accentHover"
					}`}>
					{loading ? (
						<span className="flex items-center gap-2">
							<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
							Analyzing with AI...
						</span>
					) : (
						result ? "Re-analyze" : "Analyze My Knowledge"
					)}
				</button>
			</div>

			{/* Error */}
			{error && (
				<div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
					{error}
				</div>
			)}

			{/* Empty state */}
			{!result && !loading && !error && (
				<div className="flex flex-col items-center justify-center h-80 text-claude-muted gap-4">
				<div className="opacity-20">
					<svg className="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
						<ellipse cx="12" cy="5" rx="9" ry="3"/>
						<path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
						<path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
					</svg>
				</div>
					<p className="text-center text-sm max-w-sm">
						Click <strong className="text-claude-text">Analyze My Knowledge</strong> to let the AI examine your clusters and identify what important topics you're missing.
					</p>
					<p className="text-xs opacity-60">Requires Ollama to be running with clusters already computed</p>
				</div>
			)}

			{/* Loading shimmer */}
			{loading && (
				<div className="flex flex-col items-center justify-center h-80 gap-4">
				<div className="animate-pulse text-claude-accent">
					<svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<rect x="2" y="9" width="4" height="12" rx="1"/>
						<rect x="9" y="5" width="4" height="16" rx="1"/>
						<rect x="16" y="1" width="4" height="20" rx="1"/>
						<path d="M2 21h20" strokeDasharray="2 2"/>
					</svg>
				</div>
					<p className="text-sm text-claude-muted animate-pulse">
						Reading your {result?.existing.length ?? "…"} clusters and reasoning about gaps...
					</p>
				</div>
			)}

			{/* Results */}
			{result && !loading && (
				<div className="space-y-6">
					{/* Summary banner */}
					<div className="px-4 py-3 rounded-xl bg-claude-accent/10 border border-claude-accent/25 text-sm text-claude-text">
						<span className="font-semibold text-claude-accent mr-2">AI Assessment:</span>
						{result.summary}
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* Left: Radar */}
						<div className="bg-claude-surface border border-claude-border rounded-xl p-4 flex flex-col items-center">
							<h3 className="text-sm font-semibold text-claude-text mb-3 self-start">
								Knowledge Map
							</h3>
							<RadarChart existing={result.existing} gaps={result.gaps} />
							<div className="flex gap-5 mt-3 text-xs">
								<span className="flex items-center gap-1.5">
									<span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
									<span className="text-claude-muted">You have this</span>
								</span>
								<span className="flex items-center gap-1.5">
									<span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
									<span className="text-claude-muted">Gap detected</span>
								</span>
							</div>
						</div>

						{/* Right: Details */}
						<div className="flex flex-col gap-4">
							{/* Existing clusters */}
							<div className="bg-claude-surface border border-claude-border rounded-xl p-4">
								<h3 className="text-sm font-semibold text-claude-text mb-3 flex items-center gap-2">
								<svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M20 6 9 17l-5-5"/>
								</svg>
								What You Have ({result.existing.length} clusters)
								</h3>
								<div className="space-y-2 max-h-52 overflow-y-auto pr-1">
									{result.existing.map((e) => (
										<div key={e.name} className="flex items-center gap-2">
											<div
												className="h-1.5 rounded-full bg-green-500/70 flex-shrink-0"
												style={{ width: `${Math.max(8, (e.file_count / maxFiles) * 100)}%`, maxWidth: "55%" }}
											/>
											<span className="text-xs text-claude-text truncate">{e.name}</span>
											<span className="text-xs text-claude-muted ml-auto flex-shrink-0">
												{e.file_count} {e.file_count === 1 ? "file" : "files"}
											</span>
										</div>
									))}
								</div>
							</div>

							{/* Gaps */}
							<div className="bg-claude-surface border border-claude-border rounded-xl p-4">
								<h3 className="text-sm font-semibold text-claude-text mb-3 flex items-center gap-2">
								<svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
									<line x1="12" y1="9" x2="12" y2="13"/>
									<line x1="12" y1="17" x2="12.01" y2="17"/>
								</svg>
								Gaps Detected ({result.gaps.length})
								</h3>
								<div className="space-y-3 max-h-52 overflow-y-auto pr-1">
									{result.gaps.map((g) => (
										<div
											key={g.topic}
											className="group flex gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/15 hover:border-red-500/35 transition-colors cursor-pointer"
											onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(g.topic)}`, "_blank")}>
										<div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
											<svg className="w-3 h-3 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
												<line x1="12" y1="5" x2="12" y2="19"/>
												<line x1="5" y1="12" x2="19" y2="12"/>
											</svg>
										</div>
											<div>
												<p className="text-xs font-semibold text-red-300 group-hover:text-red-200 transition-colors">
													{g.topic}
												<span className="ml-2 text-red-500/60 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">
													<svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
														<polyline points="15 3 21 3 21 9"/>
														<line x1="10" y1="14" x2="21" y2="3"/>
													</svg>
													Search
												</span>
												</p>
												<p className="text-xs text-claude-muted mt-0.5 leading-relaxed">
													{g.reason}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

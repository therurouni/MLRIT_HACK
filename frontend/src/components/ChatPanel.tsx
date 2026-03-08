import { useState, useEffect, useRef } from "react";
import { sendChat, getChatHistory, clearChatHistory } from "../api";
import type { ChatMessage } from "../types";

export default function ChatPanel() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		loadHistory();
	}, []);

	useEffect(() => {
		scrollRef.current?.scrollTo({
			top: scrollRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [messages]);

	const loadHistory = async () => {
		try {
			const res = await getChatHistory();
			setMessages(res.messages);
		} catch {
			// silently fail
		}
	};

	const handleSend = async () => {
		if (!input.trim() || loading) return;
		const userMsg = input.trim();
		setInput("");
		setLoading(true);

		// Optimistic add user message
		const tempMsg: ChatMessage = {
			id: Date.now(),
			role: "user",
			content: userMsg,
			context_files: null,
			created_at: Date.now() / 1000,
		};
		setMessages((prev) => [...prev, tempMsg]);

		try {
			const res = await sendChat(userMsg);
			const assistantMsg: ChatMessage = {
				id: Date.now() + 1,
				role: "assistant",
				content: res.response,
				context_files: res.context_files.map((f: any) => f.filename),
				created_at: Date.now() / 1000,
			};
			setMessages((prev) => [...prev, assistantMsg]);
		} catch (e: any) {
			const errMsg: ChatMessage = {
				id: Date.now() + 1,
				role: "assistant",
				content: `Error: ${e.message}`,
				context_files: null,
				created_at: Date.now() / 1000,
			};
			setMessages((prev) => [...prev, errMsg]);
		} finally {
			setLoading(false);
		}
	};

	const handleClear = async () => {
		try {
			await clearChatHistory();
			setMessages([]);
		} catch {
			// silently fail
		}
	};

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-semibold">RAG Chat</h2>
				<button
					onClick={handleClear}
					className="px-3 py-1 text-xs text-claude-muted border border-claude-border rounded hover:text-claude-error hover:border-claude-error transition-colors">
					Clear History
				</button>
			</div>

			{/* Messages */}
			<div ref={scrollRef} className="flex-1 overflow-auto space-y-3 pb-4">
				{messages.length === 0 && (
					<div className="flex flex-col items-center justify-center h-full text-claude-muted">
						<div className="text-4xl mb-4 text-claude-accent font-bold">
							&gt;_
						</div>
						<h3 className="text-lg font-semibold mb-2">SEFS Assistant</h3>
						<p className="text-sm text-center max-w-md">
							Ask questions about your files. I'll find relevant documents and
							answer based on their content.
						</p>
					</div>
				)}

				{messages.map((msg) => (
					<div
						key={msg.id}
						className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
						<div
							className={`max-w-[80%] rounded-lg px-4 py-3 ${
								msg.role === "user"
									? "bg-claude-accent text-white"
									: "bg-claude-surface border border-claude-border"
							}`}>
							<p className="text-sm whitespace-pre-wrap">{msg.content}</p>
							{msg.context_files && msg.context_files.length > 0 && (
								<div className="mt-2 pt-2 border-t border-claude-border/50">
									<p className="text-xs text-claude-muted mb-1">Sources:</p>
									<div className="flex flex-wrap gap-1">
										{msg.context_files.map((f, i) => (
											<span
												key={i}
												className="px-2 py-0.5 text-xs bg-claude-bg rounded-full text-claude-muted">
												{f}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				))}

				{loading && (
					<div className="flex justify-start">
						<div className="bg-claude-surface border border-claude-border rounded-lg px-4 py-3">
							<div className="flex items-center gap-2 text-sm text-claude-muted">
								<span className="animate-pulse">●</span>
								<span className="animate-pulse animation-delay-200">●</span>
								<span className="animate-pulse animation-delay-400">●</span>
								<span className="ml-2">Thinking...</span>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Input */}
			<div className="flex gap-2 pt-4 border-t border-claude-border">
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSend()}
					placeholder="Ask about your files..."
					disabled={loading}
					className="flex-1 px-4 py-2.5 bg-claude-bg border border-claude-border rounded-lg text-claude-text placeholder-claude-muted focus:outline-none focus:border-claude-accent disabled:opacity-50"
				/>
				<button
					onClick={handleSend}
					disabled={loading || !input.trim()}
					className="px-6 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
					Send
				</button>
			</div>
		</div>
	);
}

/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				claude: {
					bg: "var(--claude-bg)",
					panel: "var(--claude-panel)",
					surface: "var(--claude-surface)",
					text: "var(--claude-text)",
					"text-2": "var(--claude-text-2)",
					muted: "var(--claude-muted)",
					brand: "var(--claude-brand)",
					"brand-hover": "var(--claude-brand-hover)",
					highlight: "var(--claude-highlight)",
					border: "var(--claude-border)",
					input: "var(--claude-input)",
					accent: "var(--claude-accent)",
					accentHover: "var(--claude-accentHover)",
					success: "#22c55e",
					warning: "#f59e0b",
					error: "#ef4444",
				},
			},
			fontFamily: {
				serif: ["'Playfair Display'", "Georgia", "serif"],
				mono: ["'JetBrains Mono'", "'Courier New'", "monospace"],
			},
		},
	},
	plugins: [],
};

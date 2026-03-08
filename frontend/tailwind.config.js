/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				claude: {
					bg: "#1C1917",
					panel: "#292524",
					surface: "#3D3936",
					text: "#F5F0EB",
					"text-2": "#A8A29E",
					muted: "#78716C",
					brand: "#D97757",
					"brand-hover": "#C96644",
					highlight: "#E8C9A0",
					border: "#44403C",
					input: "#57534E",
					accent: "#D97757",
					accentHover: "#C96644",
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

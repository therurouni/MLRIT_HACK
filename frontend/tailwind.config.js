/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				sefs: {
					bg: "#0f172a",
					surface: "#1e293b",
					border: "#334155",
					accent: "#3b82f6",
					accentHover: "#2563eb",
					text: "#f8fafc",
					muted: "#94a3b8",
					success: "#22c55e",
					warning: "#f59e0b",
					error: "#ef4444",
				},
			},
		},
	},
	plugins: [],
};

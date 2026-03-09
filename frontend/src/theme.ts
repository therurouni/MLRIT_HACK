/** Read current theme CSS variable values for use in D3/canvas rendering */
export function getThemeColors() {
	const style = getComputedStyle(document.documentElement);
	return {
		bg: style.getPropertyValue("--claude-bg").trim(),
		panel: style.getPropertyValue("--claude-panel").trim(),
		surface: style.getPropertyValue("--claude-surface").trim(),
		text: style.getPropertyValue("--claude-text").trim(),
		text2: style.getPropertyValue("--claude-text-2").trim(),
		muted: style.getPropertyValue("--claude-muted").trim(),
		border: style.getPropertyValue("--claude-border").trim(),
		accent: style.getPropertyValue("--claude-accent").trim(),
	};
}

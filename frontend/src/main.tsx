import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import CinematicIntro from "./components/CinematicIntro.tsx";
import "./index.css";

function Root() {
	const [showIntro, setShowIntro] = useState(true);

	if (showIntro) {
		return <CinematicIntro onComplete={() => setShowIntro(false)} />;
	}

	return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Root />
	</React.StrictMode>,
);

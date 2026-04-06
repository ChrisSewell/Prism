import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { applyStoredTheme } from "./hooks/useTheme";
import "./index.css";

applyStoredTheme();
createRoot(document.getElementById("root")!).render(<App />);

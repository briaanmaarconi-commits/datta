import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyPaperWidth } from "./lib/printSetup";

// Ancho de ticket elegido en esta PC (Configurar impresión).
applyPaperWidth();

createRoot(document.getElementById("root")!).render(<App />);

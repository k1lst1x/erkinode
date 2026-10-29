import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import "./files.css";
createRoot(document.getElementById("root")!).render(<App />);

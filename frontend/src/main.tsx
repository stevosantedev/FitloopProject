import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

// Register the app-shell worker only in secure contexts that support installation.
// API requests are deliberately excluded from its cache so private workout data
// is never persisted by this offline shell layer.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      console.error("FitLoop offline support could not be registered.", error);
    });
  });
}

// Strict mode catches unsafe React effects during development before they reach users.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);

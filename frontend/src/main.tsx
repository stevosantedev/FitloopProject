import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

// Strict mode catches unsafe React effects during development before they reach users.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);

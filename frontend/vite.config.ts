import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite handles the React transform while keeping the development server configuration small.
export default defineConfig({ plugins: [react()] });

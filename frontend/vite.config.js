import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    // Production build goes into backend/static/ so FastAPI can serve it
    outDir: "../backend/static",
    emptyOutDir: true,
  },
});

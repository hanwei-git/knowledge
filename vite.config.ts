import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4317"
    }
  },
  build: {
    outDir: "dist/client"
  }
});

import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const NORMA_SERVE = process.env.NORMA_SERVE_URL ?? "http://localhost:4680";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 4681,
    proxy: { "/api": NORMA_SERVE },
  },
});

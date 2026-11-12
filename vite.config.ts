import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],

  base: "./",

  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "./client/src"),
      "@shared": path.resolve(projectRoot, "./shared"),
      "@core": path.resolve(projectRoot, "./core"),
    },
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },

  clearScreen: false,
});

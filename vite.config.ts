import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],

  // Renderer assets live beside the client source. Serve and package that
  // existing asset tree rather than falling back to the SPA HTML document.
  publicDir: path.resolve(projectRoot, "./client/public"),

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
    port: 5174,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },

  clearScreen: false,
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],

  base: "./",

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@core": path.resolve(__dirname, "./core"),
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

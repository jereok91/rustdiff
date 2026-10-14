import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/* Construye el paquete de la guía visual: dist-ds/bundle.js + bundle.css */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist-ds",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "ds/entry.tsx"),
      name: "RustDiffUI",
      formats: ["iife"],
      fileName: () => "bundle.js",
      cssFileName: "bundle",
    },
  },
})

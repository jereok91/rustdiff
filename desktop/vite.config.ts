import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri abre la ventana apuntando a una URL fija en desarrollo: el puerto no
// puede cambiar solo, y los cambios dentro de src-tauri no deben recargar el
// frontend.
export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_"],
    server: {
        port: 1420,
        strictPort: true,
        watch: { ignored: ["**/src-tauri/**"] },
    },
    build: {
        target: "es2022",
        outDir: "dist",
        emptyOutDir: true,
    },
});

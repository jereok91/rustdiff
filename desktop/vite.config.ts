import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Alias `@/` -> `src/` (convención de shadcn/ui). Se resuelve con `import.meta.url`
// para no depender de los tipos de Node en la config.
const SRC = decodeURIComponent(new URL("./src", import.meta.url).pathname);

// Tauri abre la ventana apuntando a una URL fija en desarrollo: el puerto no
// puede cambiar solo, y los cambios dentro de src-tauri no deben recargar el
// frontend.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: { "@": SRC },
    },
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
        // El bundle se sirve embebido desde el binario (sin red): CodeMirror con
        // tres lenguajes pesa ~1 MB sin comprimir y partirlo no gana nada.
        chunkSizeWarningLimit: 1200,
    },
    // Tests de la lógica pura del frontend: headless con jsdom, todos bajo src/.
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
        restoreMocks: true,
    },
});

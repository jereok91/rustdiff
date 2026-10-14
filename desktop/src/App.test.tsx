/*
 * Cableado del shell con el backend simulado: bienvenida, arranque con dos
 * archivos, resumen en la barra de estado, click-to-jump y búsqueda Ctrl+F.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    startupFiles: vi.fn(),
    diffDocuments: vi.fn(),
    inlineCharRanges: vi.fn(),
    detectFormat: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands: mocks }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import App from "@/App";
import "@/i18n";

beforeAll(() => {
    // jsdom no trae ResizeObserver (react-resizable-panels lo usa).
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
    // jsdom no mide rangos de texto; CodeMirror los pide al hacer scroll.
    const emptyRects = () => [] as unknown as DOMRectList;
    Range.prototype.getClientRects ??= emptyRects;
    Range.prototype.getBoundingClientRect ??= () => new DOMRect();
});

afterEach(cleanup);

beforeEach(() => {
    mocks.inlineCharRanges.mockResolvedValue({ left: [], right: [] });
    mocks.detectFormat.mockResolvedValue("Json");
});

describe("App", () => {
    it("sin archivos de arranque muestra la bienvenida", async () => {
        mocks.startupFiles.mockResolvedValue([]);
        render(<App />);
        expect(await screen.findByTestId("welcome")).toBeTruthy();
        expect(screen.getByText("Open document")).toBeTruthy();
        expect(screen.getByTestId("status").textContent).toContain("Ready");
    });

    it("con dos archivos de arranque compara y muestra el resumen", async () => {
        mocks.startupFiles.mockResolvedValue([
            { path: "/a.json", name: "a.json", content: '{"a":1}' },
            { path: "/b.json", name: "b.json", content: '{"a":2}' },
        ]);
        mocks.diffDocuments.mockResolvedValue({
            format: "Json",
            result: { added: [], removed: [], changed: [{ path: "$.a", kind: "Changed", left: "1", right: "2" }] },
        });
        render(<App />);
        await waitFor(
            () =>
                expect(screen.getByTestId("status").textContent).toBe(
                    "1 difference(s): 0 added, 0 removed, 1 changed | JSON",
                ),
            { timeout: 2000 },
        );
        expect(mocks.diffDocuments).toHaveBeenCalledWith('{"a":1}', '{"a":2}', null);
        expect(screen.getByTestId("diff-table").textContent).toContain("$.a");
        expect(screen.getAllByTestId("code-editor")).toHaveLength(2);
    });

    it("con un archivo entra en modo documento único", async () => {
        mocks.startupFiles.mockResolvedValue([{ path: "/a.json", name: "a.json", content: "{}" }]);
        render(<App />);
        expect(await screen.findByText("Enable comparison")).toBeTruthy();
        expect(screen.getAllByTestId("code-editor")).toHaveLength(1);
        expect(screen.getByTestId("status").textContent).toContain("Loaded a.json");
    });
    /** Arranca con dos documentos y espera a que la tabla tenga filas. */
    async function startWithTwoDocs() {
        mocks.startupFiles.mockResolvedValue([
            { path: "/a.json", name: "a.json", content: '{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}' },
            { path: "/b.json", name: "b.json", content: '{"usuario":{"nombre":"ana","edad":31},"tags":["a","c"]}' },
        ]);
        mocks.diffDocuments.mockResolvedValue({
            format: "Json",
            result: {
                added: [],
                removed: [],
                changed: [{ path: "$.tags[1]", kind: "Changed", left: '"b"', right: '"c"' }],
            },
        });
        render(<App />);
        await waitFor(() => expect(screen.getByTestId("diff-table").textContent).toContain("$.tags[1]"), {
            timeout: 2000,
        });
    }

    it("click en una fila selecciona el valor en los dos editores", async () => {
        await startWithTwoDocs();
        fireEvent.click(screen.getByText("$.tags[1]"));
        // El destello marca el token correcto en cada editor (no la `b` de "nombre").
        const flashes = document.querySelectorAll(".cm-diff-flash");
        expect([...flashes].map((f) => f.textContent)).toEqual(["b", "c"]);
    });

    it("Ctrl+F abre la búsqueda: contador, siguiente/anterior con wrap y Escape", async () => {
        await startWithTwoDocs();
        fireEvent.keyDown(window, { key: "f", ctrlKey: true });
        const input = await screen.findByPlaceholderText("Find in document");
        fireEvent.change(input, { target: { value: "a" } });
        const counter = screen.getByTestId("search-counter");
        // `a` aparece 6 veces en el izquierdo: usu-a-rio, "ana" (2), "edad", "tags", "a".
        await waitFor(() => expect(counter.textContent).toBe("1 of 6"));
        fireEvent.keyDown(input, { key: "Enter" });
        expect(counter.textContent).toBe("2 of 6");
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
        expect(counter.textContent).toBe("6 of 6");
        fireEvent.keyDown(window, { key: "F3" });
        expect(counter.textContent).toBe("1 of 6");
        fireEvent.change(input, { target: { value: "zzz" } });
        await waitFor(() => expect(counter.textContent).toBe("No results"));
        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.queryByTestId("search-bar")).toBeNull();
    });
});

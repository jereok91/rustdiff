/*
 * Cableado del shell con el backend simulado: bienvenida, arranque con dos
 * archivos, resumen en la barra de estado, click-to-jump, búsqueda Ctrl+F y
 * lo de F5 (historial, export, escala de texto, diálogo de salida).
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    startupFiles: vi.fn(),
    diffDocuments: vi.fn(),
    inlineCharRanges: vi.fn(),
    detectFormat: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    historyList: vi.fn(),
    historySearch: vi.fn(),
    historyGet: vi.fn(),
    historySave: vi.fn(),
    historyDelete: vi.fn(),
    historyClear: vi.fn(),
    historyCount: vi.fn(),
    exportTxt: vi.fn(),
    exportHtml: vi.fn(),
    writeTextFile: vi.fn(),
    buildGraph: vi.fn(),
}));
const dialog = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
// La ventana de Tauri: se captura el handler de `onCloseRequested`.
const tauriWindow = vi.hoisted(() => ({
    closeHandler: null as null | ((event: { preventDefault: () => void }) => void),
    destroy: vi.fn(async () => undefined),
}));

vi.mock("@/bindings", () => ({ commands: mocks }));
vi.mock("@tauri-apps/plugin-dialog", () => dialog);
vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: () => ({
        onCloseRequested: async (handler: (event: { preventDefault: () => void }) => void) => {
            tauriWindow.closeHandler = handler;
            return () => undefined;
        },
        destroy: tauriWindow.destroy,
    }),
}));

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
    mocks.settingsGet.mockResolvedValue({ language: "en", ui_scale: 1 });
    mocks.settingsSave.mockImplementation(async (settings: unknown) => settings);
    mocks.historyList.mockResolvedValue([]);
    mocks.historySearch.mockResolvedValue([]);
    mocks.historyCount.mockResolvedValue(0);
    tauriWindow.closeHandler = null;
    document.documentElement.style.fontSize = "";
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

    it("el anillo de foco del editor lo dibuja el contenedor, que incluye la gutter", async () => {
        // La gutter de CodeMirror es `sticky` con `z-index: 200`, así que un
        // `outline` sobre `.cm-editor` queda tapado de ese lado (el de los
        // números de línea) y el anillo se ve abierto. Lo dibuja el contenedor
        // del editor, que incluye la gutter y pinta por encima.
        mocks.startupFiles.mockResolvedValue([
            { path: "/a.json", name: "a.json", content: "{}" },
            { path: "/b.json", name: "b.json", content: "{}" },
        ]);
        render(<App />);
        const host = (await screen.findAllByTestId("code-editor"))[0];
        expect(host.className).toContain("focus-within:after:outline-ring");
        expect(host.className).toContain("focus-within:after:z-[250]");
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

    it("Ctrl+G abre el grafo del izquierdo en lugar del derecho y cerrarlo restaura el panel", async () => {
        // jsdom no implementa canvas: sin contexto el grafo no pinta, pero se cablea igual.
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        mocks.buildGraph.mockResolvedValue({
            format: "Json",
            graph: { nodes: [], edges: [], truncated: false },
            bounds: { min_x: 0, min_y: 0, max_x: 0, max_y: 0 },
            truncated: false,
        });
        await startWithTwoDocs();

        fireEvent.keyDown(window, { key: "g", ctrlKey: true });
        expect(await screen.findByTestId("graph-view")).toBeTruthy();
        // Grafo y comparación se excluyen; el panel de diferencias se oculta.
        expect(screen.queryByTestId("diff-table")).toBeNull();
        expect(screen.getAllByTestId("code-editor")).toHaveLength(1);
        expect(screen.getByText("Enable comparison")).toBeTruthy();
        await waitFor(() =>
            expect(mocks.buildGraph).toHaveBeenCalledWith(
                '{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}',
                null,
                expect.any(Number),
                expect.any(Number),
            ),
        );
        expect(screen.getByRole("button", { name: "Graph" }).getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyDown(window, { key: "g", ctrlKey: true });
        await waitFor(() => expect(screen.queryByTestId("graph-view")).toBeNull());
        expect(screen.getByTestId("diff-table")).toBeTruthy();

        // "Enable comparison" con el grafo abierto lo cierra y vuelve el derecho.
        fireEvent.keyDown(window, { key: "g", ctrlKey: true });
        await screen.findByTestId("graph-view");
        fireEvent.click(screen.getByText("Enable comparison"));
        await waitFor(() => expect(screen.queryByTestId("graph-view")).toBeNull());
        expect(screen.getAllByTestId("code-editor")).toHaveLength(2);
        expect(screen.getByTestId("diff-table")).toBeTruthy();
    });

    it("el aviso de truncado sale una sola vez mientras el grafo siga truncado", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        mocks.startupFiles.mockResolvedValue([{ path: "/a.json", name: "a.json", content: '{"a":1}' }]);
        mocks.buildGraph.mockResolvedValue({
            format: "Json",
            graph: { nodes: [], edges: [], truncated: true },
            bounds: { min_x: 0, min_y: 0, max_x: 0, max_y: 0 },
            truncated: true,
        });
        render(<App />);
        await screen.findByText("Enable comparison");
        fireEvent.keyDown(window, { key: "g", ctrlKey: true });
        await waitFor(() =>
            expect(screen.getByTestId("toaster").textContent).toContain(
                "Large document: graph truncated to 3000 nodes",
            ),
        );
        // Cerrar y reabrir con el mismo documento no repite el aviso.
        fireEvent.keyDown(window, { key: "g", ctrlKey: true });
        fireEvent.keyDown(window, { key: "g", ctrlKey: true });
        await waitFor(() => expect(mocks.buildGraph).toHaveBeenCalledTimes(2));
        expect(screen.getAllByText("Large document: graph truncated to 3000 nodes")).toHaveLength(1);
    });

    const SESSION = {
        id: 7,
        created_at: "2026-07-27 10:00:00",
        format: "Json",
        left_content: '{"x":1}',
        right_content: '{"x":2}',
        diff_summary: { added: 0, removed: 0, changed: 1, total: 1 },
    };

    it("Ctrl+S sin comparación avisa y no guarda", async () => {
        mocks.startupFiles.mockResolvedValue([{ path: "/a.json", name: "a.json", content: "{}" }]);
        render(<App />);
        await screen.findByText("Enable comparison");
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("No comparison to save. Compare first."),
        );
        expect(mocks.historySave).not.toHaveBeenCalled();
    });

    it("Ctrl+S guarda, abre el historial y una sesión se restaura en los dos editores", async () => {
        await startWithTwoDocs();
        mocks.historySave.mockResolvedValue(7);
        mocks.historyList.mockResolvedValue([SESSION]);
        mocks.historyGet.mockResolvedValue(SESSION);
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
        await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("Session #7 saved to history"));
        expect(mocks.historySave).toHaveBeenCalledWith(
            '{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}',
            '{"usuario":{"nombre":"ana","edad":31},"tags":["a","c"]}',
            "Json",
        );
        const sidebar = await screen.findByTestId("history-sidebar");
        await waitFor(() => expect(sidebar.textContent).toContain("#7 JSON +0 −0 ~1"));

        fireEvent.click(screen.getByText("#7 JSON +0 −0 ~1"));
        await waitFor(() =>
            expect(screen.getByTestId("status").textContent).toBe("Session #7 restored — +0 −0 ~1"),
        );
        const editors = screen.getAllByTestId("code-editor");
        expect(editors[0].textContent).toContain('{"x":1}');
        expect(editors[1].textContent).toContain('{"x":2}');
    });

    it("Clear all pide confirmación y vacía el historial", async () => {
        mocks.startupFiles.mockResolvedValue([]);
        mocks.historyList.mockResolvedValue([SESSION]);
        mocks.historyCount.mockResolvedValue(1);
        mocks.historyClear.mockResolvedValue(1);
        render(<App />);
        fireEvent.click(await screen.findByText("View History"));
        await screen.findByText("#7 JSON +0 −0 ~1");
        fireEvent.click(screen.getByLabelText("Clear all history"));
        fireEvent.click(await screen.findByText("Clear all"));
        await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("History cleared (1 sessions)"));
        expect(mocks.historyClear).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+E exporta el .txt por el diálogo de guardado y el backend", async () => {
        await startWithTwoDocs();
        dialog.save.mockResolvedValue("/tmp/r.txt");
        mocks.exportTxt.mockResolvedValue("REPORT");
        mocks.writeTextFile.mockResolvedValue(null);
        fireEvent.keyDown(window, { key: "e", ctrlKey: true });
        await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("Exported to /tmp/r.txt"));
        expect(mocks.writeTextFile).toHaveBeenCalledWith("/tmp/r.txt", "REPORT");
        expect(dialog.save.mock.calls[0][0]).toMatchObject({
            defaultPath: "rustdiff-report.txt",
            filters: [{ extensions: ["txt"] }],
        });
    });

    it("Ctrl++ escala la raíz y persiste ui_scale; Ctrl+0 vuelve al 100%", async () => {
        mocks.startupFiles.mockResolvedValue([]);
        render(<App />);
        await screen.findByTestId("welcome");
        await waitFor(() => expect(mocks.settingsGet).toHaveBeenCalled());
        fireEvent.keyDown(window, { key: "+", ctrlKey: true, shiftKey: true });
        expect(document.documentElement.style.fontSize).toBe("110%");
        await waitFor(() => expect(mocks.settingsSave).toHaveBeenLastCalledWith({ language: "en", ui_scale: 1.1 }));
        fireEvent.keyDown(window, { key: "0", ctrlKey: true });
        expect(document.documentElement.style.fontSize).toBe("");
    });

    it("cerrar con contenido sin guardar muestra el diálogo y 'Close without saving' cierra", async () => {
        await startWithTwoDocs();
        expect(tauriWindow.closeHandler).not.toBeNull();
        const preventDefault = vi.fn();
        act(() => tauriWindow.closeHandler?.({ preventDefault }));
        expect(preventDefault).toHaveBeenCalled();
        fireEvent.click(await screen.findByText("Close without saving"));
        await waitFor(() => expect(tauriWindow.destroy).toHaveBeenCalled());
    });

    it("sin contenido (o ya guardado) cierra sin preguntar", async () => {
        mocks.startupFiles.mockResolvedValue([]);
        render(<App />);
        await screen.findByTestId("welcome");
        await waitFor(() => expect(tauriWindow.closeHandler).not.toBeNull());
        const preventDefault = vi.fn();
        tauriWindow.closeHandler?.({ preventDefault });
        expect(preventDefault).not.toHaveBeenCalled();
        expect(screen.queryByTestId("exit-dialog")).toBeNull();
    });
});

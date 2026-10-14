/*
 * Cableado del shell con el backend simulado: bienvenida, arranque con dos
 * archivos y resumen en la barra de estado.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
});

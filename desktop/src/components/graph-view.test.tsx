/*
 * Cableado de la vista de grafo con el backend simulado y un contexto 2D
 * falso: estados vacíos, reconstrucción con debounce, último grafo bueno ante
 * errores de parseo, selección con detalle y búsqueda.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GraphNode, GraphResponse } from "@/bindings";

const mocks = vi.hoisted(() => ({ buildGraph: vi.fn() }));
vi.mock("@/bindings", () => ({ commands: mocks }));

import { GraphView } from "@/components/graph-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";
import { DEBOUNCE_MS } from "@/hooks/use-debounced-callback";
import { LIGHT_PALETTE } from "@/lib/graph-view";

const strokes: unknown[] = [];

function fakeContext() {
    const ctx: Record<string, unknown> = {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        textBaseline: "alphabetic",
        measureText: () => ({ width: 7, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
        stroke: () => strokes.push(ctx.strokeStyle),
    };
    for (const name of [
        "setTransform",
        "fillRect",
        "beginPath",
        "moveTo",
        "lineTo",
        "arcTo",
        "bezierCurveTo",
        "closePath",
        "fill",
        "save",
        "restore",
        "clip",
        "fillText",
    ]) {
        ctx[name] = () => undefined;
    }
    return ctx;
}

const node = (id: number, y: number, label: string, key: string): GraphNode => ({
    id,
    label,
    rows: [{ key, value: "1", kind: "Number" }],
    depth: 0,
    x: 0,
    y,
    width: 100,
    height: 40,
});

const response = (nodes: GraphNode[], truncated = false): GraphResponse => ({
    format: "Json",
    graph: { nodes, edges: [], truncated },
    bounds: { min_x: 0, min_y: 0, max_x: 100, max_y: 200 },
    truncated,
});

function renderView(props: Partial<Parameters<typeof GraphView>[0]> = {}) {
    const onTruncatedChange = vi.fn();
    const all = { text: '{"a":1}', format: null, uiScale: 1, scheme: "light" as const, onTruncatedChange, ...props };
    const utils = render(
        <TooltipProvider>
            <GraphView {...all} />
        </TooltipProvider>,
    );
    const rerender = (next: Partial<typeof all>) =>
        utils.rerender(
            <TooltipProvider>
                <GraphView {...all} {...next} />
            </TooltipProvider>,
        );
    return { ...utils, rerender, onTruncatedChange };
}

beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as unknown as HTMLCanvasElement["getContext"];
});

beforeEach(() => {
    strokes.length = 0;
    mocks.buildGraph.mockReset();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("GraphView", () => {
    it("con el editor vacío muestra el estado vacío sin llamar al backend", () => {
        renderView({ text: "   " });
        expect(screen.getByText("Nothing to visualize")).toBeTruthy();
        expect(mocks.buildGraph).not.toHaveBeenCalled();
    });

    it("construye con las métricas medidas y muestra el canvas", async () => {
        mocks.buildGraph.mockResolvedValue(response([node(0, 0, "", "a")]));
        const { onTruncatedChange } = renderView({ format: "Json" });
        await waitFor(() => expect(screen.queryByTestId("graph-placeholder")).toBeNull());
        expect(mocks.buildGraph).toHaveBeenCalledWith('{"a":1}', "Json", 7, 13 + 6);
        expect(onTruncatedChange).toHaveBeenCalledWith(false);
    });

    it("SQL o texto muestran el estado de formato no soportado", async () => {
        mocks.buildGraph.mockRejectedValue({ code: "UnsupportedFormat", message: "no" });
        renderView({ text: "SELECT 1;" });
        expect(await screen.findByText("Format not supported")).toBeTruthy();
    });

    it("informa el truncado de cada grafo", async () => {
        mocks.buildGraph.mockResolvedValue(response([node(0, 0, "", "a")], true));
        const { onTruncatedChange } = renderView();
        await waitFor(() => expect(onTruncatedChange).toHaveBeenCalledWith(true));
    });

    it("al editar reconstruye con debounce y un error de parseo conserva el último grafo", async () => {
        vi.useFakeTimers();
        mocks.buildGraph.mockResolvedValueOnce(response([node(0, 0, "", "a")]));
        const { rerender } = renderView();
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByTestId("graph-placeholder")).toBeNull();

        mocks.buildGraph.mockRejectedValueOnce({ code: "InvalidDocument", message: "bad" });
        rerender({ text: '{"a":' });
        expect(mocks.buildGraph).toHaveBeenCalledTimes(1);
        await act(async () => {
            vi.advanceTimersByTime(DEBOUNCE_MS);
            await Promise.resolve();
        });
        expect(mocks.buildGraph).toHaveBeenCalledTimes(2);
        expect(mocks.buildGraph).toHaveBeenLastCalledWith('{"a":', null, 7, 19);
        // Sigue el canvas, no el estado vacío.
        expect(screen.queryByTestId("graph-placeholder")).toBeNull();

        // Vaciar el editor sí vuelve al estado vacío.
        rerender({ text: "" });
        await act(async () => {
            vi.advanceTimersByTime(DEBOUNCE_MS);
            await Promise.resolve();
        });
        expect(screen.getByText("Nothing to visualize")).toBeTruthy();
    });

    it("un click sobre un nodo muestra su detalle; en el vacío lo cierra", async () => {
        mocks.buildGraph.mockResolvedValue(response([node(0, 0, "usuario", "edad"), node(1, 100, "", "b")]));
        renderView();
        await waitFor(() => expect(screen.queryByTestId("graph-placeholder")).toBeNull());
        const canvas = screen.getByRole("img");

        // Sin tamaño (jsdom) el encuadre deja la identidad: mundo = pantalla.
        fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
        expect(screen.getByTestId("graph-detail").textContent).toBe("usuario\nedad: 1");
        await waitFor(() => expect(strokes).toContain(LIGHT_PALETTE.nodeSelected));

        fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 500, clientY: 500 });
        fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 500, clientY: 500 });
        expect(screen.queryByTestId("graph-detail")).toBeNull();
    });

    it("arrastrar hace pan y no selecciona", async () => {
        mocks.buildGraph.mockResolvedValue(response([node(0, 0, "", "a")]));
        renderView();
        await waitFor(() => expect(screen.queryByTestId("graph-placeholder")).toBeNull());
        const canvas = screen.getByRole("img");
        fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: 10 });
        fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 60, clientY: 10 });
        expect(screen.queryByTestId("graph-detail")).toBeNull();
    });

    it("la búsqueda resalta las coincidencias", async () => {
        mocks.buildGraph.mockResolvedValue(response([node(0, 0, "usuario", "edad"), node(1, 100, "", "b")]));
        renderView();
        await waitFor(() => expect(screen.queryByTestId("graph-placeholder")).toBeNull());
        strokes.length = 0;
        fireEvent.change(screen.getByPlaceholderText("Search node"), { target: { value: "EDAD" } });
        await waitFor(() => expect(strokes).toContain(LIGHT_PALETTE.nodeMatch));
    });
});

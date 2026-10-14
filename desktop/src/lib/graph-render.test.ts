import { describe, expect, it, vi } from "vitest";

import type { Graph, GraphNode } from "@/bindings";
import { type Ctx2D, drawGraph, type DrawState } from "@/lib/graph-render";
import { LIGHT_PALETTE } from "@/lib/graph-view";

/** Contexto 2D falso que registra las llamadas que importan. */
function mockContext() {
    const calls = {
        setTransform: [] as number[][],
        fillText: [] as { text: string; x: number; y: number; style: unknown }[],
        strokes: [] as { style: unknown; width: number }[],
        bezier: 0,
        clip: 0,
    };
    const ctx = {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        textBaseline: "alphabetic",
        setTransform: vi.fn((...args: number[]) => calls.setTransform.push(args)),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arcTo: vi.fn(),
        bezierCurveTo: vi.fn(() => calls.bezier++),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(() => calls.strokes.push({ style: ctx.strokeStyle, width: ctx.lineWidth })),
        save: vi.fn(),
        restore: vi.fn(),
        clip: vi.fn(() => calls.clip++),
        fillText: vi.fn((text: string, x: number, y: number) => calls.fillText.push({ text, x, y, style: ctx.fillStyle })),
        measureText: vi.fn(() => ({ width: 0 }) as TextMetrics),
    };
    return { ctx: ctx as unknown as Ctx2D, calls };
}

const node = (id: number, x: number, y: number, extra: Partial<GraphNode> = {}): GraphNode => ({
    id,
    label: "",
    rows: [{ key: "k", value: "1", kind: "Number" }],
    depth: 0,
    x,
    y,
    width: 100,
    height: 36,
    ...extra,
});

const state = (graph: Graph | null, extra: Partial<DrawState> = {}): DrawState => ({
    graph,
    view: { zoom: 1, panX: 0, panY: 0 },
    selected: null,
    matches: new Set(),
    palette: LIGHT_PALETTE,
    metrics: { fontSize: 12, charWidth: 8, rowHeight: 20 },
    ...extra,
});

describe("drawGraph", () => {
    it("sin grafo solo pinta el fondo", () => {
        const { ctx, calls } = mockContext();
        const stats = drawGraph(ctx, state(null), 200, 100, 2);
        expect(stats).toEqual({ nodes: 0, edges: 0 });
        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
        expect(calls.setTransform[0]).toEqual([2, 0, 0, 2, 0, 0]);
    });

    it("aplica cámara y devicePixelRatio en una sola transformación", () => {
        const { ctx, calls } = mockContext();
        const graph: Graph = { nodes: [node(0, 0, 0)], edges: [], truncated: false };
        drawGraph(ctx, state(graph, { view: { zoom: 1.5, panX: 10, panY: 20 } }), 400, 300, 2);
        expect(calls.setTransform).toContainEqual([3, 0, 0, 3, 20, 40]);
    });

    it("dibuja solo los nodos y aristas visibles (3000 nodos)", () => {
        const nodes: GraphNode[] = [];
        const edges: Graph["edges"] = [];
        for (let i = 0; i < 3000; i++) {
            nodes.push(node(i, (i % 2) * 200, i * 50));
            if (i > 0) {
                edges.push({ from: i - 1, from_row: 0, to: i, label: String(i) });
            }
        }
        const { ctx, calls } = mockContext();
        const stats = drawGraph(ctx, state({ nodes, edges, truncated: true }), 400, 300, 1);
        // 300 px de alto / 50 px por nodo ≈ 7 nodos, no 3000.
        expect(stats.nodes).toBeLessThan(10);
        expect(stats.nodes).toBeGreaterThan(0);
        expect(stats.edges).toBeLessThan(10);
        expect(calls.bezier).toBe(stats.edges);
        // Una fila por nodo visible => clave + valor.
        expect(calls.fillText.filter((c) => c.text === "k:")).toHaveLength(stats.nodes);
    });

    it("pinta la clave con su color y el valor con el color de su tipo", () => {
        const { ctx, calls } = mockContext();
        const graph: Graph = {
            // 13 caracteres de 8 px + 2 rellenos de 8 = 120: el layout lo dimensionó justo.
            nodes: [node(0, 0, 0, { width: 120, rows: [{ key: "nombre", value: '"Ana"', kind: "String" }] })],
            edges: [],
            truncated: false,
        };
        drawGraph(ctx, state(graph), 400, 300, 1);
        const key = calls.fillText.find((c) => c.text === "nombre:");
        const value = calls.fillText.find((c) => c.text === '"Ana"');
        expect(key?.style).toBe(LIGHT_PALETTE.key);
        expect(value?.style).toBe(LIGHT_PALETTE.string);
        // El valor arranca después de "nombre: " (8 caracteres de 8 px).
        expect(value!.x - key!.x).toBe(8 * 8);
        // El texto entra en el nodo: sin clip.
        expect(calls.clip).toBe(0);
    });

    it("recorta solo los nodos cuyo texto no entra", () => {
        const { ctx, calls } = mockContext();
        const long = "x".repeat(80);
        const graph: Graph = {
            nodes: [node(0, 0, 0, { rows: [{ key: "", value: long, kind: "String" }] })],
            edges: [],
            truncated: false,
        };
        drawGraph(ctx, state(graph), 400, 300, 1);
        expect(calls.clip).toBe(1);
    });

    it("por debajo del zoom de detalle no dibuja texto", () => {
        const { ctx, calls } = mockContext();
        const graph: Graph = {
            nodes: [node(0, 0, 0), node(1, 300, 0)],
            edges: [{ from: 0, from_row: 0, to: 1, label: "hijo" }],
            truncated: false,
        };
        drawGraph(ctx, state(graph, { view: { zoom: 0.2, panX: 0, panY: 0 } }), 400, 300, 1);
        expect(calls.fillText).toHaveLength(0);
        expect(calls.bezier).toBe(1);
    });

    it("resalta seleccionado y coincidencias con su color", () => {
        const { ctx, calls } = mockContext();
        const graph: Graph = { nodes: [node(0, 0, 0), node(1, 0, 100), node(2, 0, 200)], edges: [], truncated: false };
        drawGraph(ctx, state(graph, { selected: 0, matches: new Set([2]) }), 400, 300, 1);
        const styles = calls.strokes.map((s) => s.style);
        expect(styles).toContain(LIGHT_PALETTE.nodeSelected);
        expect(styles).toContain(LIGHT_PALETTE.nodeMatch);
        expect(styles).toContain(LIGHT_PALETTE.nodeBorder);
    });
});

import { describe, expect, it } from "vitest";

import type { GraphNode } from "@/bindings";
import {
    applyWheel,
    centerOn,
    charCount,
    DARK_PALETTE,
    edgeAnchorY,
    edgeGeometry,
    edgeVisible,
    findNodeMatches,
    fitToBounds,
    FONT_SIZE,
    graphFontSize,
    hitTest,
    IDENTITY_VIEW,
    LIGHT_PALETTE,
    measureFontMetrics,
    NODE_PADDING,
    nextMatchIndex,
    nodeDetailText,
    resolvePalette,
    ROW_EXTRA,
    screenToWorld,
    SCROLL_PAN_STEP,
    truncationToastNeeded,
    valueColor,
    viewportOf,
    visibleNodeIndices,
    ZOOM_MAX,
    ZOOM_MIN,
    zoomAt,
} from "@/lib/graph-view";

const node = (id: number, x: number, y: number, extra: Partial<GraphNode> = {}): GraphNode => ({
    id,
    label: "",
    rows: [],
    depth: 0,
    x,
    y,
    width: 100,
    height: 40,
    ...extra,
});

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe("zoomAt", () => {
    it("deja fijo el punto de mundo bajo el puntero", () => {
        const view = { zoom: 1.3, panX: 40, panY: -25 };
        const before = screenToWorld(view, 210, 130);
        const after = zoomAt(view, 1.2, 210, 130);
        const world = screenToWorld(after, 210, 130);
        close(after.zoom, 1.56);
        close(world.x, before.x);
        close(world.y, before.y);
    });

    it("acota el zoom a ZOOM_MIN..ZOOM_MAX sin mover el ancla", () => {
        const max = zoomAt({ zoom: 3.9, panX: 0, panY: 0 }, 10, 50, 50);
        expect(max.zoom).toBe(ZOOM_MAX);
        expect(zoomAt({ zoom: 0.06, panX: 0, panY: 0 }, 0.01, 0, 0).zoom).toBe(ZOOM_MIN);
        // En el tope, un zoom más no mueve nada.
        expect(zoomAt(max, 2, 50, 50)).toEqual(max);
    });
});

describe("fitToBounds", () => {
    it("encuadra con 10% de margen y centra el bounding box", () => {
        const bounds = { min_x: 0, min_y: 0, max_x: 1000, max_y: 500 };
        const view = fitToBounds(bounds, 500, 500);
        close(view.zoom, 0.45); // 0.9 * min(500/1000, 500/500)
        // El centro del grafo cae en el centro del canvas.
        close(500 * view.zoom + view.panX, 250);
        close(250 * view.zoom + view.panY, 250);
        // Margen: el grafo ocupa el 90% del eje limitante.
        close(1000 * view.zoom, 450);
    });

    it("no agranda más de 1.5x un grafo chico", () => {
        const view = fitToBounds({ min_x: 10, min_y: 10, max_x: 20, max_y: 20 }, 800, 600);
        expect(view.zoom).toBe(1.5);
        close(15 * view.zoom + view.panX, 400);
    });

    it("con caja o canvas degenerados vuelve a la identidad", () => {
        expect(fitToBounds({ min_x: 0, min_y: 0, max_x: 0, max_y: 0 }, 800, 600)).toEqual(IDENTITY_VIEW);
        expect(fitToBounds({ min_x: 0, min_y: 0, max_x: 10, max_y: 10 }, 0, 600)).toEqual(IDENTITY_VIEW);
    });
});

describe("centerOn", () => {
    it("centra el nodo conservando el zoom", () => {
        const view = centerOn({ zoom: 2, panX: 0, panY: 0 }, node(0, 100, 200), 400, 300);
        expect(view.zoom).toBe(2);
        close((100 + 50) * 2 + view.panX, 200);
        close((200 + 20) * 2 + view.panY, 150);
    });
});

describe("applyWheel", () => {
    const wheel = (dx: number, dy: number, mods: { ctrl?: boolean; shift?: boolean; mode?: number } = {}) => ({
        deltaX: dx,
        deltaY: dy,
        deltaMode: mods.mode ?? 0,
        ctrlKey: mods.ctrl ?? false,
        metaKey: false,
        shiftKey: mods.shift ?? false,
    });

    it("sin modificador hace pan de SCROLL_PAN_STEP por muesca", () => {
        const view = applyWheel(IDENTITY_VIEW, wheel(0, 100), 0, 0);
        expect(view.zoom).toBe(1);
        close(view.panX, 0);
        expect(view.panY).toBe(-SCROLL_PAN_STEP);
        // Modo líneas: 3 líneas = una muesca.
        expect(applyWheel(IDENTITY_VIEW, wheel(3, 0, { mode: 1 }), 0, 0).panX).toBe(-SCROLL_PAN_STEP);
    });

    it("Shift convierte la rueda vertical en pan horizontal", () => {
        const view = applyWheel(IDENTITY_VIEW, wheel(0, 100, { shift: true }), 0, 0);
        expect(view.panX).toBe(-SCROLL_PAN_STEP);
        expect(view.panY).toBe(0);
    });

    it("Ctrl hace zoom anclado al puntero (rueda hacia arriba acerca)", () => {
        const view = applyWheel(IDENTITY_VIEW, wheel(0, -100, { ctrl: true }), 120, 80);
        close(view.zoom, 1.2);
        const world = screenToWorld(view, 120, 80);
        close(world.x, 120);
        close(world.y, 80);
    });
});

describe("culling", () => {
    it("solo quedan los nodos que tocan el viewport", () => {
        const nodes = [node(0, 0, 0), node(1, 500, 0), node(2, 0, 1000), node(3, -150, -100)];
        const vp = viewportOf({ zoom: 1, panX: 0, panY: 0 }, 300, 300);
        expect(visibleNodeIndices(nodes, vp)).toEqual([0]);
        // Alejando, entran todos.
        const far = viewportOf({ zoom: 0.25, panX: 200, panY: 200 }, 800, 800);
        expect(visibleNodeIndices(nodes, far)).toEqual([0, 1, 2, 3]);
    });

    it("una arista se descarta si su caja queda fuera", () => {
        const vp = viewportOf(IDENTITY_VIEW, 100, 100);
        expect(edgeVisible({ x1: 50, y1: 50, x2: 400, y2: 50 }, vp)).toBe(true);
        expect(edgeVisible({ x1: 150, y1: 50, x2: 400, y2: 50 }, vp)).toBe(false);
    });
});

describe("aristas", () => {
    const parent = node(0, 0, 100, {
        rows: [
            { key: "a", value: "1", kind: "Number" },
            { key: "b", value: "{2 keys}", kind: "ObjectRef" },
        ],
        height: 2 * NODE_PADDING + 2 * 20,
    });

    it("anclan en el centro de la fila de referencia del padre", () => {
        expect(edgeAnchorY(parent, 1, 20)).toBe(100 + NODE_PADDING + 1.5 * 20);
        // Sin fila (o fila inexistente): centro vertical del nodo.
        expect(edgeAnchorY(parent, null, 20)).toBe(100 + parent.height / 2);
        expect(edgeAnchorY(parent, 9, 20)).toBe(100 + parent.height / 2);
    });

    it("van del borde derecho del padre al centro izquierdo del hijo", () => {
        const child = node(1, 300, 0);
        expect(edgeGeometry(parent, 0, child, 20)).toEqual({
            x1: 100,
            y1: 100 + NODE_PADDING + 0.5 * 20,
            x2: 300,
            y2: 20,
        });
    });
});

describe("hitTest", () => {
    it("devuelve el nodo bajo el punto, el último gana", () => {
        const nodes = [node(0, 0, 0), node(1, 50, 10)];
        expect(hitTest(nodes, 60, 20)?.id).toBe(1);
        expect(hitTest(nodes, 10, 10)?.id).toBe(0);
        expect(hitTest(nodes, 500, 500)).toBeNull();
    });
});

describe("búsqueda", () => {
    const nodes = [
        node(0, 0, 0, { rows: [{ key: "usuario", value: "{2 keys}", kind: "ObjectRef" }] }),
        node(1, 0, 0, { label: "usuario", rows: [{ key: "nombre", value: '"Ana"', kind: "String" }] }),
        node(2, 0, 0, { label: "tags", rows: [{ key: "0", value: '"ADMIN"', kind: "String" }] }),
    ];

    it("busca en label, clave y valor sin distinguir mayúsculas", () => {
        expect(findNodeMatches(nodes, "USUARIO")).toEqual([0, 1]);
        expect(findNodeMatches(nodes, "admin")).toEqual([2]);
        expect(findNodeMatches(nodes, " ana ")).toEqual([1]);
    });

    it("una consulta vacía no coincide con nada", () => {
        expect(findNodeMatches(nodes, "   ")).toEqual([]);
    });

    it("Enter cicla las coincidencias", () => {
        expect(nextMatchIndex(0, 3)).toBe(1);
        expect(nextMatchIndex(2, 3)).toBe(0);
        expect(nextMatchIndex(-1, 0)).toBe(-1);
    });
});

describe("nodeDetailText", () => {
    it("label y filas, sin clave para escalares sueltos", () => {
        const detail = nodeDetailText(
            node(0, 0, 0, {
                label: "usuario",
                rows: [
                    { key: "nombre", value: '"Ana"', kind: "String" },
                    { key: "", value: "42", kind: "Number" },
                ],
            }),
        );
        expect(detail).toBe('usuario\nnombre: "Ana"\n42');
    });
});

describe("truncationToastNeeded", () => {
    it("avisa solo en la transición a truncado", () => {
        expect(truncationToastNeeded(false, true)).toBe(true);
        expect(truncationToastNeeded(true, true)).toBe(false);
        expect(truncationToastNeeded(true, false)).toBe(false);
        expect(truncationToastNeeded(false, false)).toBe(false);
    });
});

describe("paleta", () => {
    it("sin variables CSS usa la paleta de la GTK del esquema activo", () => {
        expect(resolvePalette(false)).toEqual(LIGHT_PALETTE);
        expect(resolvePalette(true)).toEqual(DARK_PALETTE);
    });

    it("las variables CSS definidas mandan sobre el fallback", () => {
        const palette = resolvePalette(true, (name) => (name === "--graph-edge" ? "  #123456 " : ""));
        expect(palette.edge).toBe("#123456");
        expect(palette.nodeFill).toBe(DARK_PALETTE.nodeFill);
    });

    it("colorea cada tipo de valor", () => {
        expect(valueColor(LIGHT_PALETTE, "String")).toBe(LIGHT_PALETTE.string);
        expect(valueColor(LIGHT_PALETTE, "Number")).toBe(LIGHT_PALETTE.number);
        expect(valueColor(LIGHT_PALETTE, "Bool")).toBe(LIGHT_PALETTE.boolean);
        expect(valueColor(LIGHT_PALETTE, "Null")).toBe(LIGHT_PALETTE.null);
        expect(valueColor(LIGHT_PALETTE, "ObjectRef")).toBe(LIGHT_PALETTE.reference);
        expect(valueColor(LIGHT_PALETTE, "ArrayRef")).toBe(LIGHT_PALETTE.reference);
        expect(valueColor(DARK_PALETTE, "Text")).toBe(DARK_PALETTE.text);
    });
});

describe("métricas de fuente", () => {
    it("ancho de 'M' y alto de fila = ascenso + descenso + ROW_EXTRA", () => {
        const ctx = {
            font: "",
            measureText: () => ({ width: 7.25, fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 3 }),
        };
        const m = measureFontMetrics(ctx, 12);
        expect(m).toEqual({ fontSize: 12, charWidth: 7.25, rowHeight: 14 + ROW_EXTRA });
        expect(ctx.font).toContain("12px");
        expect(ctx.font).toContain("monospace");
    });

    it("sin contexto o con medidas absurdas cae a valores proporcionales", () => {
        const fallback = measureFontMetrics(null, 12);
        close(fallback.charWidth, 7.2);
        expect(fallback.rowHeight).toBe(12 + ROW_EXTRA);
        const broken = { font: "", measureText: () => ({ width: Number.NaN }) };
        expect(measureFontMetrics(broken, 10).charWidth).toBe(6);
    });

    it("la fuente escala con la UI", () => {
        expect(graphFontSize(1)).toBe(FONT_SIZE);
        expect(graphFontSize(1.5)).toBe(18);
        expect(graphFontSize(Number.NaN)).toBe(FONT_SIZE);
    });

    it("cuenta caracteres como el núcleo, no unidades UTF-16", () => {
        expect(charCount("abc")).toBe(3);
        expect(charCount("ñandú")).toBe(5);
        expect(charCount("a😀b")).toBe(3);
    });
});

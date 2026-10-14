/*
 * Lógica pura de la vista de grafo (D2): transformaciones de vista, culling,
 * búsqueda, selección, paleta y métricas de fuente.
 *
 * Port de las funciones sin estado de `src/ui/graph_view.rs` (GTK). El layout
 * lo calcula el núcleo (`rustdiff_core::graph::layout`) y llega ya posicionado
 * por `commands.buildGraph`; acá solo vive la geometría de la cámara y lo que
 * el canvas necesita para dibujar e interactuar. Sin DOM ni React: todo se
 * prueba con Vitest.
 */

import type { GraphBounds, GraphNode, ValueKind } from "@/bindings";
import { cssColorToHex, parseColor } from "@/lib/color";

// ─────────────────────────────────────────────
// Constantes (mismos valores que la GTK)
// ─────────────────────────────────────────────

/** Tamaño de fuente (px) del texto de los nodos al 100%, en coordenadas de mundo. */
export const FONT_SIZE = 12;
/** Aire vertical extra por fila sobre la altura de la fuente. */
export const ROW_EXTRA = 6;
/** Radio de las esquinas redondeadas de los nodos. */
export const CORNER_RADIUS = 6;
/** Relleno interno de cada nodo: `LayoutConfig::default().node_padding` del núcleo. */
export const NODE_PADDING = 8;
/** Límites y paso del zoom. */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
export const ZOOM_BTN_FACTOR = 1.2;
/** Zoom máximo que aplica el encuadre automático. */
export const FIT_ZOOM_MAX = 1.5;
/** Fracción del canvas que ocupa el grafo al encuadrar (10% de margen). */
export const FIT_FILL = 0.9;
/** Píxeles de pan por "tick" de rueda sin Ctrl. */
export const SCROLL_PAN_STEP = 50;
/** Por debajo de este zoom no se dibuja texto (nivel de detalle). */
export const LOD_TEXT_ZOOM = 0.3;
/** Por debajo de este zoom no se dibujan etiquetas de arista. */
export const LOD_EDGE_LABEL_ZOOM = 0.45;
/** `MAX_GRAPH_NODES` del núcleo: el texto del aviso de truncado lo muestra. */
export const MAX_GRAPH_NODES = 3000;
/** Familia monoespaciada del canvas (la misma pila que los editores). */
export const MONO_FONT_FAMILY = '"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace';

/**
 * Largo en caracteres (code points), como `chars().count()` del núcleo: el
 * layout dimensiona los nodos así y `.length` contaría de más con emojis.
 * Sin asignaciones, porque corre por cada fila visible en cada frame.
 */
export function charCount(text: string): number {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        // La segunda mitad de un par sustituto no cuenta como carácter propio.
        if (code < 0xdc00 || code > 0xdfff) {
            count++;
        }
    }
    return count;
}

// ─────────────────────────────────────────────
// Cámara: pan + zoom
// ─────────────────────────────────────────────

/** Transformación mundo → pantalla: `pantalla = mundo * zoom + pan`. */
export type ViewTransform = { zoom: number; panX: number; panY: number };

export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

/** Rectángulo visible en coordenadas de mundo. */
export type Viewport = { x0: number; y0: number; x1: number; y1: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function screenToWorld(view: ViewTransform, sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom };
}

/**
 * Multiplica el zoom por `factor` (acotado a `ZOOM_MIN..ZOOM_MAX`) dejando fijo
 * el punto de mundo que está bajo `(px, py)` en pantalla.
 */
export function zoomAt(view: ViewTransform, factor: number, px: number, py: number): ViewTransform {
    const zoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const applied = zoom / view.zoom;
    return {
        zoom,
        panX: px - (px - view.panX) * applied,
        panY: py - (py - view.panY) * applied,
    };
}

/** `apply_fit` de la GTK: encuadra el bounding box con un 10% de margen. */
export function fitToBounds(bounds: GraphBounds, width: number, height: number): ViewTransform {
    const bw = bounds.max_x - bounds.min_x;
    const bh = bounds.max_y - bounds.min_y;
    if (!(bw > 0) || !(bh > 0) || !(width > 0) || !(height > 0)) {
        return IDENTITY_VIEW;
    }
    const zoom = clamp(FIT_FILL * Math.min(width / bw, height / bh), ZOOM_MIN, FIT_ZOOM_MAX);
    const cx = (bounds.min_x + bounds.max_x) / 2;
    const cy = (bounds.min_y + bounds.max_y) / 2;
    return { zoom, panX: width / 2 - cx * zoom, panY: height / 2 - cy * zoom };
}

/** Centra la vista en un nodo conservando el zoom (búsqueda). */
export function centerOn(view: ViewTransform, node: GraphNode, width: number, height: number): ViewTransform {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    return { zoom: view.zoom, panX: width / 2 - cx * view.zoom, panY: height / 2 - cy * view.zoom };
}

export function viewportOf(view: ViewTransform, width: number, height: number): Viewport {
    const x0 = -view.panX / view.zoom;
    const y0 = -view.panY / view.zoom;
    return { x0, y0, x1: x0 + width / view.zoom, y1: y0 + height / view.zoom };
}

// ─────────────────────────────────────────────
// Rueda del ratón
// ─────────────────────────────────────────────

/** Lo que importa de un `WheelEvent`. */
export type WheelLike = Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "shiftKey">;

/** Píxeles que WebKit/Chromium reportan por muesca de rueda en `DOM_DELTA_PIXEL`. */
const PIXELS_PER_TICK = 100;
const LINES_PER_TICK = 3;

/** Convierte un delta del navegador a "ticks" de rueda (la unidad de la GTK). */
export function wheelTicks(delta: number, deltaMode: number): number {
    switch (deltaMode) {
        case 1: // DOM_DELTA_LINE
            return delta / LINES_PER_TICK;
        case 2: // DOM_DELTA_PAGE
            return delta;
        default: // DOM_DELTA_PIXEL
            return delta / PIXELS_PER_TICK;
    }
}

/**
 * Rueda como en la GTK: Ctrl = zoom anclado al puntero (los gestos de pinza del
 * touchpad llegan también con `ctrlKey`); Shift = pan horizontal; sin
 * modificador = pan.
 */
export function applyWheel(view: ViewTransform, event: WheelLike, px: number, py: number): ViewTransform {
    const dx = wheelTicks(event.deltaX, event.deltaMode);
    const dy = wheelTicks(event.deltaY, event.deltaMode);
    if (event.ctrlKey || event.metaKey) {
        return zoomAt(view, Math.pow(ZOOM_BTN_FACTOR, -dy), px, py);
    }
    if (event.shiftKey) {
        return { ...view, panX: view.panX - (dx + dy) * SCROLL_PAN_STEP };
    }
    return { ...view, panX: view.panX - dx * SCROLL_PAN_STEP, panY: view.panY - dy * SCROLL_PAN_STEP };
}

// ─────────────────────────────────────────────
// Teclado (canvas enfocado)
// ─────────────────────────────────────────────

/** Multiplicador del paso de pan con Shift + flecha. */
export const KEY_PAN_FAST = 4;

/** Lo que importa de un `KeyboardEvent`. */
export type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Resultado de una tecla: vista nueva, encuadrar, o `null` si no es nuestra. */
export type GraphKeyAction = { kind: "view"; view: ViewTransform } | { kind: "fit" } | null;

/**
 * Navegación por teclado sobre el canvas enfocado:
 *   `+` / `=` acerca y `-` / `_` aleja (anclado al centro, como los botones),
 *   `0` encuadra, y las flechas mueven la cámara `SCROLL_PAN_STEP` px (x4 con
 *   Shift): flecha derecha = ver lo que está a la derecha.
 * Con Ctrl/Meta/Alt no hace nada, así Ctrl++ / Ctrl+0 siguen siendo la
 * escala del texto de la app.
 */
export function graphKeyAction(view: ViewTransform, event: KeyLike, width: number, height: number): GraphKeyAction {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return null;
    }
    const step = SCROLL_PAN_STEP * (event.shiftKey ? KEY_PAN_FAST : 1);
    switch (event.key) {
        case "+":
        case "=":
            return { kind: "view", view: zoomAt(view, ZOOM_BTN_FACTOR, width / 2, height / 2) };
        case "-":
        case "_":
            return { kind: "view", view: zoomAt(view, 1 / ZOOM_BTN_FACTOR, width / 2, height / 2) };
        case "0":
            return { kind: "fit" };
        case "ArrowLeft":
            return { kind: "view", view: { ...view, panX: view.panX + step } };
        case "ArrowRight":
            return { kind: "view", view: { ...view, panX: view.panX - step } };
        case "ArrowUp":
            return { kind: "view", view: { ...view, panY: view.panY + step } };
        case "ArrowDown":
            return { kind: "view", view: { ...view, panY: view.panY - step } };
        default:
            return null;
    }
}

// ─────────────────────────────────────────────
// Culling, aristas e hit-testing
// ─────────────────────────────────────────────

/** `true` si el nodo toca el viewport. */
export function nodeVisible(node: GraphNode, vp: Viewport): boolean {
    return !(node.x + node.width < vp.x0 || node.x > vp.x1 || node.y + node.height < vp.y0 || node.y > vp.y1);
}

/** Índices de los nodos que tocan el viewport (lo único que se dibuja). */
export function visibleNodeIndices(nodes: readonly GraphNode[], vp: Viewport): number[] {
    const out: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
        if (nodeVisible(nodes[i], vp)) {
            out.push(i);
        }
    }
    return out;
}

/**
 * Punto de anclaje de una arista en el borde derecho del padre: centro de la
 * fila de referencia si existe, o centro vertical del nodo.
 */
export function edgeAnchorY(node: GraphNode, fromRow: number | null, rowHeight: number): number {
    if (fromRow !== null && fromRow < node.rows.length) {
        return node.y + NODE_PADDING + (fromRow + 0.5) * rowHeight;
    }
    return node.y + node.height / 2;
}

/** Extremos de la curva bezier de una arista. */
export type EdgeGeometry = { x1: number; y1: number; x2: number; y2: number };

export function edgeGeometry(from: GraphNode, fromRow: number | null, to: GraphNode, rowHeight: number): EdgeGeometry {
    return {
        x1: from.x + from.width,
        y1: edgeAnchorY(from, fromRow, rowHeight),
        x2: to.x,
        y2: to.y + to.height / 2,
    };
}

/** Culling por la caja de los extremos de la curva. */
export function edgeVisible(edge: EdgeGeometry, vp: Viewport): boolean {
    const { x1, y1, x2, y2 } = edge;
    return !(
        Math.max(x1, x2) < vp.x0 ||
        Math.min(x1, x2) > vp.x1 ||
        Math.max(y1, y2) < vp.y0 ||
        Math.min(y1, y2) > vp.y1
    );
}

/** Nodo bajo un punto de mundo (el último dibujado gana, como en la GTK). */
export function hitTest(nodes: readonly GraphNode[], wx: number, wy: number): GraphNode | null {
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) {
            return n;
        }
    }
    return null;
}

// ─────────────────────────────────────────────
// Búsqueda y detalle
// ─────────────────────────────────────────────

/** Ids de los nodos cuyo label, clave o valor contiene la consulta (sin mayúsculas). */
export function findNodeMatches(nodes: readonly GraphNode[], query: string): number[] {
    const q = query.trim().toLowerCase();
    if (q === "") {
        return [];
    }
    const out: number[] = [];
    for (const node of nodes) {
        const hit =
            node.label.toLowerCase().includes(q) ||
            node.rows.some((r) => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
        if (hit) {
            out.push(node.id);
        }
    }
    return out;
}

/** Siguiente índice de coincidencia, cíclico (Enter en la búsqueda). */
export function nextMatchIndex(current: number, count: number): number {
    return count === 0 ? -1 : (current + 1) % count;
}

/** Texto del detalle de un nodo: label + todas sus filas (`node_detail_text`). */
export function nodeDetailText(node: GraphNode): string {
    const lines: string[] = [];
    if (node.label !== "") {
        lines.push(node.label);
    }
    for (const row of node.rows) {
        lines.push(row.key === "" ? row.value : `${row.key}: ${row.value}`);
    }
    return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────
// Aviso de truncado
// ─────────────────────────────────────────────

/** El aviso sale solo en la transición a truncado, no en cada reconstrucción. */
export function truncationToastNeeded(wasTruncated: boolean, truncated: boolean): boolean {
    return truncated && !wasTruncated;
}

// ─────────────────────────────────────────────
// Paleta (claro / oscuro, de los tokens `--graph-*`)
// ─────────────────────────────────────────────

export type GraphPalette = {
    background: string;
    nodeFill: string;
    nodeBorder: string;
    nodeSelected: string;
    nodeMatch: string;
    edge: string;
    key: string;
    string: string;
    number: string;
    boolean: string;
    null: string;
    reference: string;
    text: string;
};

/*
 * Respaldo cuando las variables CSS no están (tests sin hoja de estilos):
 * la conversión exacta a hex de los tokens `--graph-*` de `styles/tokens.css`.
 * `tokens.test.ts` falla si se desincronizan.
 */
export const LIGHT_PALETTE: GraphPalette = {
    background: "#f5f7f9",
    nodeFill: "#ffffff",
    nodeBorder: "#c1c4cb",
    nodeSelected: "#2763d7",
    nodeMatch: "#8d4e00",
    edge: "#a7abb3",
    key: "#636974",
    string: "#025884",
    number: "#007272",
    boolean: "#a8347f",
    null: "#5847b7",
    reference: "#5f636c",
    text: "#15181f",
};

export const DARK_PALETTE: GraphPalette = {
    background: "#0f1014",
    nodeFill: "#16181d",
    nodeBorder: "#3a3d44",
    nodeSelected: "#5d92f6",
    nodeMatch: "#efb146",
    edge: "#4a4d54",
    key: "#9399a2",
    string: "#8ecbe8",
    number: "#73d1ca",
    boolean: "#f197c2",
    null: "#b9b0f7",
    reference: "#8e929a",
    text: "#edeef2",
};

/** Variable CSS de cada color (`styles/tokens.css`, `--graph-*`). */
export const PALETTE_VARIABLES: Record<keyof GraphPalette, string> = {
    background: "--graph-background",
    nodeFill: "--graph-node-fill",
    nodeBorder: "--graph-node-border",
    nodeSelected: "--graph-node-selected",
    nodeMatch: "--graph-node-match",
    edge: "--graph-edge",
    key: "--graph-key",
    string: "--graph-string",
    number: "--graph-number",
    boolean: "--graph-boolean",
    null: "--graph-null",
    reference: "--graph-reference",
    text: "--graph-text",
};

/**
 * Paleta del canvas: cada color sale de su variable CSS (OKLCH en los tokens,
 * convertido a hex para el contexto 2D) y, si no está definida, del respaldo
 * del esquema activo.
 */
export function resolvePalette(dark: boolean, readVariable: (name: string) => string = () => ""): GraphPalette {
    const fallback = dark ? DARK_PALETTE : LIGHT_PALETTE;
    const out = { ...fallback };
    for (const key of Object.keys(PALETTE_VARIABLES) as (keyof GraphPalette)[]) {
        const value = readVariable(PALETTE_VARIABLES[key]).trim();
        // Solo colores que el contexto 2D entiende: un `var(...)` sin
        // resolver (o cualquier sintaxis rara) se queda con el respaldo.
        if (value !== "" && parseColor(value) !== null) {
            out[key] = cssColorToHex(value);
        }
    }
    return out;
}

/** Color del valor de una fila según su tipo. */
export function valueColor(palette: GraphPalette, kind: ValueKind): string {
    switch (kind) {
        case "String":
            return palette.string;
        case "Number":
            return palette.number;
        case "Bool":
            return palette.boolean;
        case "Null":
            return palette.null;
        case "ObjectRef":
        case "ArrayRef":
            return palette.reference;
        case "Text":
            return palette.text;
    }
}

// ─────────────────────────────────────────────
// Métricas de fuente
// ─────────────────────────────────────────────

export type FontMetrics = { fontSize: number; charWidth: number; rowHeight: number };

/** Lo mínimo del contexto 2D que se usa para medir. */
export type MeasureContext = {
    font: string;
    measureText: (text: string) => Pick<TextMetrics, "width"> &
        Partial<Pick<TextMetrics, "fontBoundingBoxAscent" | "fontBoundingBoxDescent">>;
};

export function nodeFont(fontSize: number): string {
    return `${fontSize}px ${MONO_FONT_FAMILY}`;
}

/** Tamaño de la fuente de los nodos a una escala de UI dada. */
export function graphFontSize(uiScale: number): number {
    return FONT_SIZE * (Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1);
}

/**
 * `measure_font_metrics` de la GTK: ancho de "M" y alto de fila
 * (ascenso + descenso de la fuente + `ROW_EXTRA`). Sin contexto o con
 * medidas absurdas cae a valores proporcionales al tamaño.
 */
export function measureFontMetrics(ctx: MeasureContext | null, fontSize: number): FontMetrics {
    const fallback: FontMetrics = { fontSize, charWidth: fontSize * 0.6, rowHeight: fontSize + ROW_EXTRA };
    if (!ctx) {
        return fallback;
    }
    ctx.font = nodeFont(fontSize);
    const m = ctx.measureText("M");
    const charWidth = Number.isFinite(m.width) && m.width > 0 ? m.width : fallback.charWidth;
    const ascent = m.fontBoundingBoxAscent ?? 0;
    const descent = m.fontBoundingBoxDescent ?? 0;
    const height = ascent + descent;
    const rowHeight = Number.isFinite(height) && height > 0 ? height + ROW_EXTRA : fallback.rowHeight;
    return { fontSize, charWidth, rowHeight };
}

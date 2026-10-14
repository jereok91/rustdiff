/*
 * Dibujo del grafo sobre un contexto 2D (port de `draw_graph` de la GTK).
 *
 * Funciones sin estado: reciben el grafo ya posicionado, la cámara y la paleta
 * y pintan un frame completo. Solo se dibujan los nodos y aristas que tocan el
 * viewport, y el detalle baja con el zoom (sin texto por debajo de
 * `LOD_TEXT_ZOOM`, sin etiquetas de arista por debajo de `LOD_EDGE_LABEL_ZOOM`).
 *
 * Para aguantar 3000 nodos sin tirones se agrupan los trazos: todas las
 * aristas van en un único path, y todos los nodos sin resaltar comparten un
 * relleno y un borde; solo los seleccionados/coincidentes se trazan aparte.
 */

import type { Graph, GraphNode } from "@/bindings";
import {
    charCount,
    CORNER_RADIUS,
    edgeGeometry,
    edgeVisible,
    type FontMetrics,
    type GraphPalette,
    LOD_EDGE_LABEL_ZOOM,
    LOD_TEXT_ZOOM,
    NODE_PADDING,
    nodeFont,
    nodeVisible,
    valueColor,
    type ViewTransform,
    viewportOf,
} from "@/lib/graph-view";

/** Subconjunto de `CanvasRenderingContext2D` que usa el renderer (mockeable en tests). */
export type Ctx2D = Pick<
    CanvasRenderingContext2D,
    | "setTransform"
    | "fillRect"
    | "beginPath"
    | "moveTo"
    | "lineTo"
    | "arcTo"
    | "bezierCurveTo"
    | "closePath"
    | "fill"
    | "stroke"
    | "save"
    | "restore"
    | "clip"
    | "fillText"
    | "measureText"
> & {
    fillStyle: CanvasRenderingContext2D["fillStyle"];
    strokeStyle: CanvasRenderingContext2D["strokeStyle"];
    lineWidth: number;
    font: string;
    textBaseline: CanvasRenderingContext2D["textBaseline"];
};

export type DrawState = {
    graph: Graph | null;
    view: ViewTransform;
    selected: number | null;
    /** Ids de los nodos que coinciden con la búsqueda. */
    matches: ReadonlySet<number>;
    palette: GraphPalette;
    metrics: FontMetrics;
};

/** Contadores del último frame (los tests y el diagnóstico los miran). */
export type DrawStats = { nodes: number; edges: number };

/** Agrega al path actual un rectángulo de esquinas redondeadas. */
export function roundedRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

/**
 * Pinta un frame. `width`/`height` en píxeles CSS; `dpr` es el
 * `devicePixelRatio` con el que se dimensionó el backing store del canvas.
 */
export function drawGraph(ctx: Ctx2D, state: DrawState, width: number, height: number, dpr: number): DrawStats {
    const { graph, view, palette } = state;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    if (!graph || graph.nodes.length === 0 || !(view.zoom > 0)) {
        return { nodes: 0, edges: 0 };
    }

    // Mundo → backing store: `pantalla = mundo * zoom + pan`, todo por dpr.
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.panX, dpr * view.panY);
    ctx.font = nodeFont(state.metrics.fontSize);
    ctx.textBaseline = "alphabetic";

    const vp = viewportOf(view, width, height);
    const edges = drawEdges(ctx, state, vp);
    const nodes = drawNodes(ctx, state, vp);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { nodes, edges };
}

function drawEdges(ctx: Ctx2D, state: DrawState, vp: ReturnType<typeof viewportOf>): number {
    const { graph, view, palette, metrics } = state;
    if (!graph) {
        return 0;
    }
    const withLabels = view.zoom >= LOD_EDGE_LABEL_ZOOM;
    const labels: { text: string; x: number; y: number }[] = [];
    let count = 0;

    // Un único path para todas las curvas: un solo `stroke` por frame.
    ctx.beginPath();
    for (const edge of graph.edges) {
        const from = graph.nodes[edge.from];
        const to = graph.nodes[edge.to];
        if (!from || !to) {
            continue;
        }
        const g = edgeGeometry(from, edge.from_row, to, metrics.rowHeight);
        if (!edgeVisible(g, vp)) {
            continue;
        }
        const cx = (g.x1 + g.x2) / 2;
        ctx.moveTo(g.x1, g.y1);
        ctx.bezierCurveTo(cx, g.y1, cx, g.y2, g.x2, g.y2);
        count++;
        if (withLabels && edge.label !== "") {
            labels.push({ text: edge.label, x: cx, y: (g.y1 + g.y2) / 2 - 4 });
        }
    }
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = Math.min(2.5, Math.max(0.6, 1.2 / view.zoom));
    ctx.stroke();

    // Etiqueta centrada en el punto medio de la curva.
    if (labels.length > 0) {
        ctx.fillStyle = palette.key;
        for (const label of labels) {
            const w = charCount(label.text) * metrics.charWidth;
            ctx.fillText(label.text, label.x - w / 2, label.y);
        }
    }
    return count;
}

function drawNodes(ctx: Ctx2D, state: DrawState, vp: ReturnType<typeof viewportOf>): number {
    const { graph, view, palette, selected, matches } = state;
    if (!graph) {
        return 0;
    }

    const visible: GraphNode[] = [];
    for (const node of graph.nodes) {
        if (nodeVisible(node, vp)) {
            visible.push(node);
        }
    }
    if (visible.length === 0) {
        return 0;
    }

    // Relleno de todas las tarjetas en un solo path.
    ctx.beginPath();
    for (const node of visible) {
        roundedRectPath(ctx, node.x, node.y, node.width, node.height, CORNER_RADIUS);
    }
    ctx.fillStyle = palette.nodeFill;
    ctx.fill();

    // Bordes normales juntos; seleccionado y coincidencias, aparte y más gruesos.
    const highlighted: GraphNode[] = [];
    ctx.beginPath();
    for (const node of visible) {
        if (node.id === selected || matches.has(node.id)) {
            highlighted.push(node);
        } else {
            roundedRectPath(ctx, node.x, node.y, node.width, node.height, CORNER_RADIUS);
        }
    }
    ctx.strokeStyle = palette.nodeBorder;
    // 1 px de pantalla con cualquier zoom (la GTK usaba 1 unidad de mundo, que
    // desaparecía al alejar).
    ctx.lineWidth = 1 / view.zoom;
    ctx.stroke();
    const thick = 2 / Math.max(view.zoom, 0.5);
    for (const node of highlighted) {
        ctx.beginPath();
        roundedRectPath(ctx, node.x, node.y, node.width, node.height, CORNER_RADIUS);
        ctx.strokeStyle = node.id === selected ? palette.nodeSelected : palette.nodeMatch;
        ctx.lineWidth = thick;
        ctx.stroke();
    }

    // Nivel de detalle: sin texto cuando el zoom es muy pequeño.
    if (view.zoom >= LOD_TEXT_ZOOM) {
        for (const node of visible) {
            drawRows(ctx, state, node);
        }
    }
    return visible.length;
}

/** Filas `clave: valor` de un nodo; recorta solo si el texto no entra. */
function drawRows(ctx: Ctx2D, state: DrawState, node: GraphNode): void {
    const { palette, metrics } = state;
    const maxChars = node.rows.reduce(
        (max, row) => Math.max(max, (row.key === "" ? 0 : charCount(row.key) + 2) + charCount(row.value)),
        0,
    );
    // El layout dimensiona el nodo por sus caracteres, salvo cuando lo acota
    // `max_node_width`: solo entonces hace falta el clip (caro con 3000 nodos).
    const overflow = 2 * NODE_PADDING + maxChars * metrics.charWidth > node.width + 0.5;
    if (overflow) {
        ctx.save();
        ctx.beginPath();
        roundedRectPath(ctx, node.x, node.y, node.width, node.height, CORNER_RADIUS);
        ctx.clip();
    }
    for (let i = 0; i < node.rows.length; i++) {
        const row = node.rows[i];
        const baseline = node.y + NODE_PADDING + (i + 0.78) * metrics.rowHeight;
        let x = node.x + NODE_PADDING;
        if (row.key !== "") {
            ctx.fillStyle = palette.key;
            ctx.fillText(`${row.key}:`, x, baseline);
            x += (charCount(row.key) + 2) * metrics.charWidth;
        }
        ctx.fillStyle = valueColor(palette, row.kind);
        ctx.fillText(row.value, x, baseline);
    }
    if (overflow) {
        ctx.restore();
    }
}

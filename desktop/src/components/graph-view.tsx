/*
 * Vista de grafo del documento izquierdo (F6, D2): canvas 2D propio sobre el
 * layout que calcula `rustdiff_core::graph` (`commands.buildGraph`).
 *
 * Paridad con `src/ui/graph_view.rs` + `refresh_graph` de `main_window.rs`:
 *   - Barra: búsqueda de nodos (resalta, centra en la primera, Enter cicla,
 *     Esc limpia) y botones de zoom (alejar, acercar, encuadrar).
 *   - Pan arrastrando; rueda = pan (Shift = horizontal), Ctrl+rueda = zoom
 *     anclado al puntero; click = selección con detalle del nodo (popover
 *     de Radix anclado al punto del click; Escape lo cierra).
 *   - Con el canvas enfocado: flechas = pan, `+`/`-` = zoom, `0` = encuadrar
 *     (`graphKeyAction`).
 *   - Editor vacío → estado vacío; SQL/texto → "formato no soportado"; un
 *     error de parseo mientras se escribe conserva el último grafo bueno.
 *   - El primer grafo se encuadra; los siguientes (edición en vivo) conservan
 *     pan y zoom del usuario.
 *
 * Rendimiento: el grafo, la cámara y la selección viven en refs y se pintan
 * en `requestAnimationFrame`; React solo re-renderiza la barra, los estados
 * vacíos y el detalle, nunca por frame. La lógica pura está en
 * `lib/graph-view` y el dibujo en `lib/graph-render`.
 */

import {
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Network, Search, ZoomIn, ZoomOut, Maximize } from "lucide-react";

import { commands, type Format, type GraphResponse } from "@/bindings";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { ColorScheme } from "@/hooks/use-color-scheme";
import { DEBOUNCE_MS, useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { toCommandError } from "@/lib/errors";
import { drawGraph, type Ctx2D } from "@/lib/graph-render";
import {
    applyWheel,
    centerOn,
    findNodeMatches,
    fitToBounds,
    type FontMetrics,
    graphFontSize,
    graphKeyAction,
    type GraphPalette,
    hitTest,
    IDENTITY_VIEW,
    measureFontMetrics,
    nextMatchIndex,
    nodeDetailText,
    resolvePalette,
    screenToWorld,
    type ViewTransform,
    ZOOM_BTN_FACTOR,
    zoomAt,
} from "@/lib/graph-view";

/** Qué muestra el panel: el canvas o uno de los dos estados vacíos. */
type Mode = "graph" | "empty" | "unsupported";

/** Desplazamiento (px) a partir del cual un click pasa a ser arrastre. */
const DRAG_THRESHOLD = 3;

export type GraphViewProps = {
    /** Texto del editor izquierdo. */
    text: string;
    /** Formato elegido en la cabecera (`null` = detección automática). */
    format: Format | null;
    /** Escala de la UI: agranda la fuente de los nodos y el layout con ella. */
    uiScale: number;
    scheme: ColorScheme;
    /** Estado de truncado de cada grafo construido (el aviso lo decide App). */
    onTruncatedChange?: (truncated: boolean) => void;
};

type Detail = { text: string; x: number; y: number };

type Drag = { pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean };

/** Mide las métricas de la fuente de los nodos en un canvas fuera del DOM. */
function measureMetrics(uiScale: number): FontMetrics {
    const size = graphFontSize(uiScale);
    let ctx: CanvasRenderingContext2D | null = null;
    try {
        ctx = document.createElement("canvas").getContext("2d");
    } catch {
        ctx = null;
    }
    return measureFontMetrics(ctx, size);
}

const requestFrame = (cb: () => void): number =>
    typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(cb)
        : (setTimeout(cb, 16) as unknown as number);

const cancelFrame = (id: number) =>
    typeof window.cancelAnimationFrame === "function" ? window.cancelAnimationFrame(id) : clearTimeout(id);

export function GraphView({ text, format, uiScale, scheme, onTruncatedChange }: GraphViewProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [mode, setMode] = useState<Mode>("empty");
    const [query, setQuery] = useState("");
    const [detail, setDetail] = useState<Detail | null>(null);

    const metrics = useMemo(() => measureMetrics(uiScale), [uiScale]);

    // Estado del canvas: refs, para pintar sin pasar por React.
    const graph = useRef<GraphResponse | null>(null);
    const view = useRef<ViewTransform>(IDENTITY_VIEW);
    const selected = useRef<number | null>(null);
    const matches = useRef<number[]>([]);
    const matchSet = useRef<Set<number>>(new Set());
    const matchIndex = useRef(-1);
    const queryRef = useRef("");
    const fitPending = useRef(false);
    const palette = useRef<GraphPalette | null>(null);
    const size = useRef({ width: 0, height: 0 });
    const frame = useRef<number | null>(null);
    const drag = useRef<Drag | null>(null);
    const metricsRef = useRef(metrics);
    metricsRef.current = metrics;
    const schemeRef = useRef(scheme);
    schemeRef.current = scheme;
    const latest = useRef({ text, format, onTruncatedChange });
    latest.current = { text, format, onTruncatedChange };
    // Cada construcción lleva un número; solo la última se aplica.
    const sequence = useRef(0);
    const lastRequested = useRef<string | null>(null);

    const draw = useCallback(() => {
        frame.current = null;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d") as Ctx2D | null | undefined;
        if (!canvas || !ctx) {
            return;
        }
        const { width, height } = size.current;
        const dpr = window.devicePixelRatio || 1;
        // Backing store en píxeles físicos: nítido en pantallas HiDPI.
        const backingW = Math.max(1, Math.round(width * dpr));
        const backingH = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== backingW || canvas.height !== backingH) {
            canvas.width = backingW;
            canvas.height = backingH;
        }
        if (!palette.current) {
            const style = getComputedStyle(canvas);
            palette.current = resolvePalette(schemeRef.current === "dark", (name) => style.getPropertyValue(name));
        }
        const current = graph.current;
        if (fitPending.current && current && width > 0 && height > 0) {
            view.current = fitToBounds(current.bounds, width, height);
            fitPending.current = false;
        }
        drawGraph(
            ctx,
            {
                graph: current?.graph ?? null,
                view: view.current,
                selected: selected.current,
                matches: matchSet.current,
                palette: palette.current,
                metrics: metricsRef.current,
            },
            width,
            height,
            dpr,
        );
    }, []);

    const requestDraw = useCallback(() => {
        if (frame.current === null) {
            frame.current = requestFrame(draw);
        }
    }, [draw]);

    useEffect(
        () => () => {
            if (frame.current !== null) {
                cancelFrame(frame.current);
                frame.current = null;
            }
        },
        [],
    );

    const recomputeMatches = useCallback(() => {
        const nodes = graph.current?.graph.nodes ?? [];
        matches.current = findNodeMatches(nodes, queryRef.current);
        matchSet.current = new Set(matches.current);
        matchIndex.current = matches.current.length > 0 ? 0 : -1;
    }, []);

    const centerOnMatch = useCallback(() => {
        const current = graph.current;
        const id = matches.current[matchIndex.current];
        const node = id === undefined ? undefined : current?.graph.nodes[id];
        if (node) {
            view.current = centerOn(view.current, node, size.current.width, size.current.height);
        }
    }, []);

    /** Estado vacío o no soportado: descarta el grafo (`show_empty` de la GTK). */
    const showPlaceholder = useCallback((next: Exclude<Mode, "graph">) => {
        graph.current = null;
        selected.current = null;
        matches.current = [];
        matchSet.current = new Set();
        matchIndex.current = -1;
        view.current = IDENTITY_VIEW;
        setDetail(null);
        setMode(next);
        latest.current.onTruncatedChange?.(false);
    }, []);

    /** Grafo nuevo (`GraphView::update`): encuadra solo si no había uno. */
    const applyGraph = useCallback(
        (response: GraphResponse) => {
            const first = !graph.current || graph.current.graph.nodes.length === 0;
            graph.current = response;
            selected.current = null;
            setDetail(null);
            recomputeMatches();
            if (first) {
                fitPending.current = true;
            }
            setMode("graph");
            latest.current.onTruncatedChange?.(response.truncated);
            requestDraw();
        },
        [recomputeMatches, requestDraw],
    );

    /** `refresh_graph` de la GTK. */
    const build = useCallback(async () => {
        const { text: current, format: fmt } = latest.current;
        lastRequested.current = current;
        const seq = ++sequence.current;
        if (current.trim() === "") {
            showPlaceholder("empty");
            return;
        }
        const m = metricsRef.current;
        try {
            const response = await commands.buildGraph(current, fmt, m.charWidth, m.rowHeight);
            if (seq === sequence.current) {
                applyGraph(response);
            }
        } catch (error) {
            if (seq !== sequence.current) {
                return;
            }
            switch (toCommandError(error).code) {
                case "NeedInput":
                    showPlaceholder("empty");
                    break;
                case "UnsupportedFormat":
                case "DetectFailed":
                    showPlaceholder("unsupported");
                    break;
                default:
                    // Error de parseo (o tamaño) mientras se escribe: se
                    // conserva el último grafo bueno, igual que la GTK.
                    break;
            }
        }
    }, [applyGraph, showPlaceholder]);

    const scheduleBuild = useDebouncedCallback(() => void build(), DEBOUNCE_MS);

    // Al abrir, al cambiar el formato o las métricas (escala): reconstruir ya.
    // Con métricas nuevas cambian todas las posiciones, así que se re-encuadra.
    const lastMetrics = useRef(metrics);
    useEffect(() => {
        if (lastMetrics.current !== metrics) {
            lastMetrics.current = metrics;
            fitPending.current = true;
        }
        scheduleBuild.cancel();
        void build();
    }, [format, metrics, build, scheduleBuild]);

    // Edición en vivo del editor izquierdo: reconstrucción con debounce.
    useEffect(() => {
        if (text !== lastRequested.current) {
            scheduleBuild();
        }
    }, [text, scheduleBuild]);

    // Cambio de tema: se relee la paleta en el próximo frame (después de que
    // `useColorScheme` mueva la clase `.dark`).
    useEffect(() => {
        palette.current = null;
        requestDraw();
    }, [scheme, requestDraw]);

    // Tamaño del panel → tamaño del canvas.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        const measure = () => {
            const rect = container.getBoundingClientRect();
            size.current = { width: rect.width, height: rect.height };
            requestDraw();
        };
        measure();
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [requestDraw]);

    // Cambio de devicePixelRatio (ventana movida a otro monitor, zoom del WebView).
    useEffect(() => {
        if (typeof window.matchMedia !== "function") {
            return;
        }
        let media: MediaQueryList | null = null;
        const listen = () => {
            media?.removeEventListener("change", onChange);
            media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
            media.addEventListener("change", onChange);
        };
        const onChange = () => {
            listen();
            requestDraw();
        };
        listen();
        return () => media?.removeEventListener("change", onChange);
    }, [requestDraw]);

    // Rueda: listener nativo no pasivo para poder cancelar el scroll de la página.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = canvas.getBoundingClientRect();
            view.current = applyWheel(view.current, event, event.clientX - rect.left, event.clientY - rect.top);
            setDetail(null);
            requestDraw();
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [requestDraw]);

    const localPoint = (event: { clientX: number; clientY: number }) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const p = localPoint(event);
        drag.current = {
            pointerId: event.pointerId,
            startX: p.x,
            startY: p.y,
            panX: view.current.panX,
            panY: view.current.panY,
            moved: false,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.currentTarget.focus();
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const d = drag.current;
        if (!d || d.pointerId !== event.pointerId) {
            return;
        }
        const p = localPoint(event);
        const dx = p.x - d.startX;
        const dy = p.y - d.startY;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
            return;
        }
        if (!d.moved) {
            d.moved = true;
            setDetail(null);
        }
        view.current = { ...view.current, panX: d.panX + dx, panY: d.panY + dy };
        requestDraw();
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.pointerId !== event.pointerId) {
            return;
        }
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (d.moved || event.button !== 0) {
            return;
        }
        // Click sin arrastre: selección del nodo bajo el puntero.
        const p = localPoint(event);
        const world = screenToWorld(view.current, p.x, p.y);
        const hit = hitTest(graph.current?.graph.nodes ?? [], world.x, world.y);
        selected.current = hit?.id ?? null;
        setDetail(hit ? { text: nodeDetailText(hit), x: p.x, y: p.y } : null);
        requestDraw();
    };

    const zoomBy = (factor: number) => {
        const { width, height } = size.current;
        view.current = zoomAt(view.current, factor, width / 2, height / 2);
        setDetail(null);
        requestDraw();
    };

    const fit = () => {
        const current = graph.current;
        if (current) {
            view.current = fitToBounds(current.bounds, size.current.width, size.current.height);
            setDetail(null);
            requestDraw();
        }
    };

    const onQueryChange = (value: string) => {
        setQuery(value);
        queryRef.current = value;
        recomputeMatches();
        centerOnMatch();
        setDetail(null);
        requestDraw();
    };

    const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const count = matches.current.length;
            if (count === 0) {
                return;
            }
            matchIndex.current = event.shiftKey
                ? (matchIndex.current - 1 + count) % count
                : nextMatchIndex(matchIndex.current, count);
            centerOnMatch();
            setDetail(null);
            requestDraw();
        } else if (event.key === "Escape") {
            event.preventDefault();
            onQueryChange("");
        }
    };

    const onCanvasKey = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
        if (event.key === "Escape") {
            setDetail(null);
            return;
        }
        if (!graph.current) {
            return;
        }
        const { width, height } = size.current;
        const action = graphKeyAction(view.current, event, width, height);
        if (!action) {
            return;
        }
        event.preventDefault();
        if (action.kind === "fit") {
            fit();
            return;
        }
        view.current = action.view;
        setDetail(null);
        requestDraw();
    };

    const hasGraph = mode === "graph";
    const hintId = "graph-keyboard-hint";

    return (
        <div className="bg-card flex h-full min-h-0 flex-col" data-testid="graph-view">
            <div className="bg-card text-card-foreground flex h-(--toolbar-height) shrink-0 items-center gap-1 border-b px-2">
                <Search className="text-muted-foreground mr-0.5 size-4 shrink-0" aria-hidden />
                <Input
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={onSearchKey}
                    placeholder={t("graph.search_placeholder")}
                    aria-label={t("graph.search_placeholder")}
                    className="flex-1"
                />
                <IconButton
                    label={t("graph.zoom_out_tooltip")}
                    tooltip={`${t("graph.zoom_out_tooltip")} (-)`}
                    onClick={() => zoomBy(1 / ZOOM_BTN_FACTOR)}
                    disabled={!hasGraph}
                >
                    <ZoomOut />
                </IconButton>
                <IconButton
                    label={t("graph.zoom_in_tooltip")}
                    tooltip={`${t("graph.zoom_in_tooltip")} (+)`}
                    onClick={() => zoomBy(ZOOM_BTN_FACTOR)}
                    disabled={!hasGraph}
                >
                    <ZoomIn />
                </IconButton>
                <IconButton
                    label={t("graph.zoom_fit_tooltip")}
                    tooltip={`${t("graph.zoom_fit_tooltip")} (0)`}
                    onClick={fit}
                    disabled={!hasGraph}
                >
                    <Maximize />
                </IconButton>
            </div>

            <div ref={containerRef} className="bg-background relative min-h-0 flex-1 overflow-hidden">
                <span id={hintId} className="sr-only">
                    {t("graph.keyboard_hint")}
                </span>
                <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label={t("graph.canvas_label")}
                    aria-describedby={hintId}
                    tabIndex={0}
                    className={
                        hasGraph
                            ? "focus-ring-inset absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
                            : "hidden"
                    }
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => {
                        drag.current = null;
                    }}
                    onKeyDown={onCanvasKey}
                />
                {!hasGraph && (
                    <div
                        className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
                        data-testid="graph-placeholder"
                    >
                        <Network className="size-12 opacity-50" aria-hidden />
                        <p className="text-foreground text-title font-semibold">
                            {t(mode === "unsupported" ? "graph.unsupported_title" : "graph.empty_title")}
                        </p>
                        <p className="max-w-sm text-body">
                            {t(mode === "unsupported" ? "graph.unsupported_desc" : "graph.empty_desc")}
                        </p>
                    </div>
                )}
                {/* Detalle del nodo: popover de Radix anclado al punto del click.
                    No roba el foco (el teclado sigue en el canvas); Escape o un
                    click fuera lo cierran. */}
                <Popover
                    open={hasGraph && detail !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setDetail(null);
                        }
                    }}
                >
                    <PopoverAnchor asChild>
                        <span
                            aria-hidden
                            className="pointer-events-none absolute size-0"
                            style={{ left: detail?.x ?? 0, top: detail?.y ?? 0 }}
                        />
                    </PopoverAnchor>
                    {detail && (
                        <PopoverContent
                            data-testid="graph-detail"
                            aria-label={t("graph.node_detail")}
                            aria-live="polite"
                            collisionBoundary={containerRef.current}
                            collisionPadding={8}
                            onOpenAutoFocus={(event) => event.preventDefault()}
                            onCloseAutoFocus={(event) => event.preventDefault()}
                            // El click en el canvas ya decide la selección (pointerup).
                            onPointerDownOutside={(event) => {
                                if (event.target === canvasRef.current) {
                                    event.preventDefault();
                                }
                            }}
                            className="max-w-[min(32rem,90vw)] font-mono text-code whitespace-pre-wrap select-text"
                        >
                            {detail.text}
                        </PopoverContent>
                    )}
                </Popover>
            </div>
        </div>
    );
}

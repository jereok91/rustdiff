/*
 * Panel de diferencias (F4): el `DiffPanel` de `src/ui/diff_panel.rs`.
 *
 *   - Barra superior con el resumen y tres toggles (Added / Removed /
 *     Changed) que filtran por tipo y muestran cuántas filas hay de cada uno.
 *   - Columnas Type / Path / Left / Right; las celdas se truncan con "…" y el
 *     valor completo va en el tooltip (`title`), como en la GTK.
 *   - En las filas Changed, los caracteres que difieren se resaltan dentro de
 *     Left/Right con `commands.inlineCharRanges` (el mismo
 *     `inline_char_ranges` que usa `changed_value_markup`). Se piden solo
 *     para las filas visibles y se cachean.
 *   - Virtualizada con alto de fila fijo: con 3000+ filas solo se montan las
 *     que entran en pantalla (más un margen).
 *   - Click o flechas sobre una fila la seleccionan y avisan a `onActivate`
 *     (salto a los editores, `highlight_and_scroll_to_item`).
 */

import { type KeyboardEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DiffItem, type DiffKind, type DiffResult, type InlineRanges } from "@/bindings";
import {
    ALL_KINDS,
    DEFAULT_FILTERS,
    diffRows,
    filterRows,
    kindCounts,
    type KindFilters,
    valueSegments,
    visibleWindow,
} from "@/lib/diff-rows";
import { cn } from "@/lib/utils";

/** Alto fijo de fila en px: la virtualización depende de que no varíe. */
export const ROW_HEIGHT = 28;

/** Alto supuesto del viewport cuando el DOM todavía no lo midió (jsdom, primer render). */
const FALLBACK_VIEWPORT = 600;

const KIND_LABEL: Record<DiffKind, string> = {
    Added: "diff.added_label",
    Removed: "diff.removed_label",
    Changed: "diff.changed_label",
};

const FILTER_LABEL: Record<DiffKind, string> = {
    Added: "panel.filter_added",
    Removed: "panel.filter_removed",
    Changed: "panel.filter_changed",
};

const KIND_COLOR: Record<DiffKind, string> = {
    Added: "text-diff-added",
    Removed: "text-diff-removed",
    Changed: "text-diff-changed",
};

const FILTER_ACTIVE: Record<DiffKind, string> = {
    Added: "border-diff-added/60 bg-diff-added/15",
    Removed: "border-diff-removed/60 bg-diff-removed/15",
    Changed: "border-diff-changed/60 bg-diff-changed/15",
};

export type RangesFetcher = (left: string, right: string) => Promise<InlineRanges>;

export type DiffTableProps = {
    result: DiffResult | null;
    /** Click, Enter o flechas sobre una fila. */
    onActivate?: (item: DiffItem) => void;
    /** `commands.inlineCharRanges` en la app; un doble en los tests. */
    fetchRanges?: RangesFetcher;
    /**
     * Filtros controlados por el padre, para que sobrevivan a ocultar el panel
     * con Ctrl+D (que lo desmonta). Sin ellos, el panel los maneja solo.
     */
    filters?: KindFilters;
    onFiltersChange?: (filters: KindFilters) => void;
};

const rangesKey = (left: string, right: string) => `${left}\u0000${right}`;

export function DiffTable({
    result,
    onActivate,
    fetchRanges = commands.inlineCharRanges,
    filters: controlledFilters,
    onFiltersChange,
}: DiffTableProps) {
    const { t } = useTranslation();
    const [ownFilters, setOwnFilters] = useState<KindFilters>(DEFAULT_FILTERS);
    const filters = controlledFilters ?? ownFilters;
    const [selected, setSelected] = useState<DiffItem | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewport, setViewport] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Caché de rangos inline por par de valores; `bump` re-renderiza al llegar.
    const ranges = useRef(new Map<string, InlineRanges>());
    const pending = useRef(new Set<string>());
    const [, bump] = useReducer((n: number) => n + 1, 0);

    const allRows = useMemo(() => diffRows(result), [result]);
    const rows = useMemo(() => filterRows(allRows, filters), [allRows, filters]);
    const counts = useMemo(() => kindCounts(result), [result]);

    // Un resultado nuevo invalida la selección y la caché.
    useEffect(() => {
        setSelected(null);
        ranges.current = new Map();
        pending.current = new Set();
    }, [result]);

    // Alto real del viewport para la ventana virtual.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        setViewport(el.clientHeight);
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(() => setViewport(el.clientHeight));
        observer.observe(el);
        return () => observer.disconnect();
    }, [allRows.length > 0]);

    const { start, end } = visibleWindow(scrollTop, viewport || FALLBACK_VIEWPORT, ROW_HEIGHT, rows.length);
    const visible = rows.slice(start, end);

    // Pide los rangos inline de las filas Changed visibles que falten.
    useEffect(() => {
        for (const item of visible) {
            if (item.kind !== "Changed" || item.left === null || item.right === null) {
                continue;
            }
            const key = rangesKey(item.left, item.right);
            if (ranges.current.has(key) || pending.current.has(key)) {
                continue;
            }
            pending.current.add(key);
            const cache = ranges.current;
            fetchRanges(item.left, item.right)
                .then((found) => {
                    // Si llegó otro resultado mientras tanto, la caché ya es otra.
                    if (cache === ranges.current) {
                        cache.set(key, found);
                        bump();
                    }
                })
                .catch(() => undefined);
        }
    });

    const activate = useCallback(
        (item: DiffItem) => {
            setSelected(item);
            onActivate?.(item);
        },
        [onActivate],
    );

    /** Desplaza el scroll lo justo para que la fila `index` quede a la vista. */
    const ensureVisible = (index: number) => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        const header = ROW_HEIGHT;
        const top = index * ROW_HEIGHT;
        const height = el.clientHeight || FALLBACK_VIEWPORT;
        if (top < el.scrollTop) {
            el.scrollTop = top;
        } else if (top + ROW_HEIGHT + header > el.scrollTop + height) {
            el.scrollTop = top + ROW_HEIGHT + header - height;
        }
        setScrollTop(el.scrollTop);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (rows.length === 0) {
            return;
        }
        const current = selected ? rows.indexOf(selected) : -1;
        let next: number;
        switch (event.key) {
            case "ArrowDown":
                next = Math.min(rows.length - 1, current + 1);
                break;
            case "ArrowUp":
                next = current === -1 ? 0 : Math.max(0, current - 1);
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = rows.length - 1;
                break;
            case "Enter":
                if (selected) {
                    event.preventDefault();
                    onActivate?.(selected);
                }
                return;
            default:
                return;
        }
        event.preventDefault();
        activate(rows[next]);
        ensureVisible(next);
    };

    const toggle = (kind: DiffKind) => {
        const next = { ...filters, [kind]: !filters[kind] };
        setOwnFilters(next);
        onFiltersChange?.(next);
    };

    const total = counts.Added + counts.Removed + counts.Changed;
    const summary = !result
        ? t("panel.summary_none")
        : total === 0
          ? t("diff.summary_identical")
          : t("diff.summary_counts", { total, added: counts.Added, removed: counts.Removed, changed: counts.Changed });

    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="diff-panel">
            <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
                <span className="text-muted-foreground flex-1 truncate text-xs" data-testid="diff-summary">
                    {summary}
                </span>
                {ALL_KINDS.map((kind) => (
                    <button
                        key={kind}
                        type="button"
                        aria-pressed={filters[kind]}
                        data-testid={`filter-${kind}`}
                        onClick={() => toggle(kind)}
                        className={cn(
                            "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
                            "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                            filters[kind] ? FILTER_ACTIVE[kind] : "text-muted-foreground opacity-60 hover:opacity-100",
                        )}
                    >
                        <span className={cn(filters[kind] && KIND_COLOR[kind])}>{t(FILTER_LABEL[kind])}</span>
                        <span className="bg-background/70 rounded px-1 tabular-nums">{counts[kind]}</span>
                    </button>
                ))}
            </div>

            {allRows.length === 0 ? (
                <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                    {t(result ? "diff.summary_identical" : "panel.summary_none")}
                </div>
            ) : (
                <div
                    ref={scrollRef}
                    className="focus-visible:ring-ring/50 min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-[2px] focus-visible:ring-inset"
                    tabIndex={0}
                    role="grid"
                    aria-rowcount={rows.length}
                    onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                    onKeyDown={onKeyDown}
                >
                    <table className="w-full table-fixed border-collapse text-sm" data-testid="diff-table">
                        <colgroup>
                            <col className="w-32" />
                            <col className="w-[30%]" />
                            <col />
                            <col />
                        </colgroup>
                        <thead className="bg-card text-muted-foreground sticky top-0 z-10 text-left">
                            <tr style={{ height: ROW_HEIGHT }}>
                                <th className="border-b px-2 font-medium">{t("panel.col_type")}</th>
                                <th className="border-b border-l px-2 font-medium">{t("panel.col_path")}</th>
                                <th className="border-b border-l px-2 font-medium">{t("panel.col_left")}</th>
                                <th className="border-b border-l px-2 font-medium">{t("panel.col_right")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {start > 0 && <tr aria-hidden style={{ height: start * ROW_HEIGHT }} />}
                            {visible.map((item, offset) => (
                                <DiffRow
                                    key={`${start + offset}-${item.kind}-${item.path}`}
                                    item={item}
                                    selected={item === selected}
                                    ranges={
                                        item.kind === "Changed" && item.left !== null && item.right !== null
                                            ? ranges.current.get(rangesKey(item.left, item.right))
                                            : undefined
                                    }
                                    onClick={() => activate(item)}
                                    label={t(KIND_LABEL[item.kind])}
                                />
                            ))}
                            {end < rows.length && (
                                <tr aria-hidden style={{ height: (rows.length - end) * ROW_HEIGHT }} />
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

type DiffRowProps = {
    item: DiffItem;
    selected: boolean;
    ranges: InlineRanges | undefined;
    onClick: () => void;
    label: string;
};

function DiffRow({ item, selected, ranges, onClick, label }: DiffRowProps) {
    return (
        <tr
            data-kind={item.kind}
            aria-selected={selected}
            onClick={onClick}
            style={{ height: ROW_HEIGHT }}
            className={cn(
                "cursor-pointer",
                selected ? "bg-accent text-accent-foreground" : cn(`diff-row-${item.kind}`, "hover:bg-accent/60"),
            )}
        >
            <td className={cn("truncate border-b px-2 whitespace-nowrap", KIND_COLOR[item.kind])}>{label}</td>
            <td className="truncate border-b border-l px-2 font-mono whitespace-nowrap" title={item.path}>
                {item.path}
            </td>
            <ValueCell value={item.left} ranges={ranges?.left} highlightClass="diff-cell-inline-removed" />
            <ValueCell value={item.right} ranges={ranges?.right} highlightClass="diff-cell-inline-added" />
        </tr>
    );
}

function ValueCell({
    value,
    ranges,
    highlightClass,
}: {
    value: string | null;
    ranges: InlineRanges["left"] | undefined;
    highlightClass: string;
}) {
    if (value === null) {
        return <td className="text-muted-foreground truncate border-b border-l px-2">—</td>;
    }
    const segments = ranges && ranges.length > 0 ? valueSegments(value, ranges) : null;
    return (
        <td className="truncate border-b border-l px-2 font-mono whitespace-nowrap" title={value}>
            {segments
                ? segments.map((segment, index) =>
                      segment.highlight ? (
                          <mark key={index} className={cn("text-inherit", highlightClass)} data-inline>
                              {segment.text}
                          </mark>
                      ) : (
                          <span key={index}>{segment.text}</span>
                      ),
                  )
                : value}
        </td>
    );
}

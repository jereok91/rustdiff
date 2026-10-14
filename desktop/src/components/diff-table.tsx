/*
 * Panel de diferencias (F4): el `DiffPanel` de `src/ui/diff_panel.rs`.
 *
 *   - Barra superior (con el aspecto del `diff-panel.tsx` del prototipo):
 *     tres toggles (Added / Removed / Changed) en un control segmentado que
 *     filtran por tipo y muestran cuántas filas hay de cada uno, el resumen,
 *     la posición y anterior / siguiente.
 *   - Columnas # / Type (insignia) / Path (`JsonPath`) / Left / Right (chips
 *     de valor); los valores se truncan con "…" y el completo va en el
 *     tooltip (`title`), como en la GTK.
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
import { ChevronDown, ChevronUp, CircleCheck, GitCompareArrows } from "lucide-react";

import { commands, type DiffItem, type DiffResult, type InlineRanges } from "@/bindings";
import { DiffDot, DiffKindBadge, JsonPath, KIND_META } from "@/components/diff-kind";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { IconButton } from "@/components/ui/icon-button";
import { segmentedGroup, segmentedItem, ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
    ALL_KINDS,
    DEFAULT_FILTERS,
    diffRows,
    filterRows,
    kindCounts,
    type KindFilters,
    stepRow,
    valueSegments,
    visibleWindow,
} from "@/lib/diff-rows";
import { cn } from "@/lib/utils";

/** Alto fijo de fila en px: la virtualización depende de que no varíe. */
export const ROW_HEIGHT = 36;

/** Alto supuesto del viewport cuando el DOM todavía no lo midió (jsdom, primer render). */
const FALLBACK_VIEWPORT = 600;

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

    const setFilters = (next: KindFilters) => {
        setOwnFilters(next);
        onFiltersChange?.(next);
    };

    /** Anterior / siguiente diferencia visible, con vuelta. */
    const step = (direction: 1 | -1) => {
        const next = stepRow(rows, selected, direction);
        if (next >= 0) {
            activate(rows[next]);
            ensureVisible(next);
        }
    };

    const total = counts.Added + counts.Removed + counts.Changed;
    const summary = !result
        ? t("panel.summary_none")
        : total === 0
          ? t("diff.summary_identical")
          : t("diff.summary_counts", { total, added: counts.Added, removed: counts.Removed, changed: counts.Changed });
    const position = selected ? rows.indexOf(selected) : -1;

    let body;
    if (allRows.length === 0) {
        body = result ? (
            <Empty className="h-full">
                <EmptyMedia className="bg-(--diff-added-row) text-diff-added-foreground">
                    <CircleCheck />
                </EmptyMedia>
                <EmptyTitle>{t("diff.summary_identical")}</EmptyTitle>
                <EmptyDescription>{t("panel.identical_desc")}</EmptyDescription>
            </Empty>
        ) : (
            <Empty className="h-full">
                <EmptyMedia>
                    <GitCompareArrows />
                </EmptyMedia>
                <EmptyTitle>{t("panel.summary_none")}</EmptyTitle>
                <EmptyDescription>{t("panel.waiting_desc")}</EmptyDescription>
            </Empty>
        );
    } else {
        body = (
            <div
                ref={scrollRef}
                className="focus-ring-inset min-h-0 flex-1 overflow-auto"
                tabIndex={0}
                role="grid"
                aria-label={t("header.diff_panel")}
                aria-rowcount={rows.length}
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                onKeyDown={onKeyDown}
            >
                <table className="w-full table-fixed border-collapse text-body" data-testid="diff-table">
                    <colgroup>
                        <col className="w-12" />
                        <col className="w-32" />
                        <col />
                        <col className="w-[24%]" />
                        <col className="w-[24%]" />
                    </colgroup>
                    <thead className="bg-card text-muted-foreground sticky top-0 z-10 text-left text-caption">
                        <tr style={{ height: ROW_HEIGHT - 4 }}>
                            <th className="border-b pl-4 font-medium">#</th>
                            <th className="border-b px-2 font-medium">{t("panel.col_type")}</th>
                            <th className="border-b px-2 font-medium">{t("panel.col_path")}</th>
                            <th className="border-b px-2 font-medium">{t("panel.col_left")}</th>
                            <th className="border-b px-2 pr-4 font-medium">{t("panel.col_right")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {start > 0 && <tr aria-hidden style={{ height: start * ROW_HEIGHT }} />}
                        {visible.map((item, offset) => (
                            <DiffRow
                                key={`${start + offset}-${item.kind}-${item.path}`}
                                index={start + offset}
                                item={item}
                                selected={item === selected}
                                ranges={
                                    item.kind === "Changed" && item.left !== null && item.right !== null
                                        ? ranges.current.get(rangesKey(item.left, item.right))
                                        : undefined
                                }
                                onClick={() => activate(item)}
                            />
                        ))}
                        {end < rows.length && <tr aria-hidden style={{ height: (rows.length - end) * ROW_HEIGHT }} />}
                    </tbody>
                </table>
            </div>
        );
    }

    // Proveedor propio: el panel también se monta suelto (tests) y Radix anida bien.
    return (
        <TooltipProvider>
            <section
                className="bg-card text-card-foreground @container flex h-full min-h-0 flex-col"
                aria-label={t("header.diff_panel")}
                data-testid="diff-panel"
            >
                <div className="flex h-(--toolbar-height) shrink-0 items-center gap-3 border-b px-3">
                    <h2 className="hidden shrink-0 text-body font-semibold @xl:block">{t("header.diff_panel")}</h2>

                    <ToggleGroup
                        type="multiple"
                        size="sm"
                        value={ALL_KINDS.filter((kind) => filters[kind])}
                        onValueChange={(value) =>
                            setFilters({
                                Added: value.includes("Added"),
                                Removed: value.includes("Removed"),
                                Changed: value.includes("Changed"),
                            })
                        }
                        className={segmentedGroup}
                        aria-label={t("panel.filters")}
                    >
                        {ALL_KINDS.map((kind) => (
                            <ToggleGroupItem
                                key={kind}
                                value={kind}
                                data-testid={`filter-${kind}`}
                                aria-label={`${t(KIND_META[kind].filter)}: ${counts[kind]}`}
                                className={segmentedItem}
                            >
                                <DiffDot kind={kind} className={cn(!filters[kind] && "opacity-40")} />
                                <span className="hidden @3xl:inline">{t(KIND_META[kind].filter)}</span>
                                <span className="text-muted-foreground tabular">{counts[kind]}</span>
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>

                    <span
                        className="text-muted-foreground hidden min-w-0 flex-1 truncate text-caption @2xl:block"
                        data-testid="diff-summary"
                    >
                        {summary}
                    </span>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        <span className="text-muted-foreground hidden min-w-10 text-right text-caption tabular @lg:inline">
                            {rows.length > 0 ? `${position >= 0 ? position + 1 : "–"} / ${rows.length}` : ""}
                        </span>
                        <div className="flex">
                            <IconButton
                                variant="outline"
                                className="rounded-r-none"
                                label={t("panel.prev")}
                                onClick={() => step(-1)}
                                disabled={rows.length === 0}
                            >
                                <ChevronUp />
                            </IconButton>
                            <IconButton
                                variant="outline"
                                className="-ml-px rounded-l-none"
                                label={t("panel.next")}
                                onClick={() => step(1)}
                                disabled={rows.length === 0}
                            >
                                <ChevronDown />
                            </IconButton>
                        </div>
                    </div>
                </div>

                {body}
            </section>
        </TooltipProvider>
    );
}

type DiffRowProps = {
    index: number;
    item: DiffItem;
    selected: boolean;
    ranges: InlineRanges | undefined;
    onClick: () => void;
};

function DiffRow({ index, item, selected, ranges, onClick }: DiffRowProps) {
    return (
        <tr
            data-kind={item.kind}
            aria-selected={selected}
            onClick={onClick}
            style={{ height: ROW_HEIGHT }}
            className={cn(
                "border-border/60 cursor-pointer border-b transition-colors duration-(--duration-fast)",
                selected ? "bg-accent" : "hover:bg-muted/60",
            )}
        >
            <td
                className={cn(
                    "pl-4 text-caption tabular",
                    selected ? "text-primary font-semibold" : "text-muted-foreground",
                )}
            >
                {index + 1}
            </td>
            <td className="px-2">
                <DiffKindBadge kind={item.kind} />
            </td>
            <td className="truncate px-2 whitespace-nowrap" title={item.path}>
                <JsonPath path={item.path} />
            </td>
            <ValueCell value={item.left} ranges={ranges?.left} />
            <ValueCell value={item.right} ranges={ranges?.right} last />
        </tr>
    );
}

/** Valor como chip (el `ValueChip` del prototipo), con los caracteres que difieren resaltados. */
function ValueCell({
    value,
    ranges,
    last,
}: {
    value: string | null;
    ranges: InlineRanges["left"] | undefined;
    last?: boolean;
}) {
    if (value === null) {
        return (
            <td className={cn("text-muted-foreground px-2", last && "pr-4")}>
                —
            </td>
        );
    }
    const segments = ranges && ranges.length > 0 ? valueSegments(value, ranges) : null;
    return (
        <td className={cn("px-2", last && "pr-4")} title={value}>
            <span className="bg-muted text-foreground inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 align-middle font-mono text-caption whitespace-nowrap">
                {segments
                    ? segments.map((segment, index) =>
                          segment.highlight ? (
                              <mark
                                  key={index}
                                  className="text-diff-changed-foreground rounded-[3px] bg-(--diff-changed-inline) px-px"
                                  data-inline
                              >
                                  {segment.text}
                              </mark>
                          ) : (
                              <span key={index}>{segment.text}</span>
                          ),
                      )
                    : value}
            </span>
        </td>
    );
}

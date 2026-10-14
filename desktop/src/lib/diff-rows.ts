/*
 * Modelo de la tabla de diferencias (puro): orden, filtros, conteos y el
 * troceado de un valor en fragmentos resaltados.
 *
 * Paridad con `src/ui/diff_panel.rs`: las filas se ordenan por ruta
 * (`sort_by(path)`, estable: a igual ruta quedan añadidos, eliminados,
 * cambiados) y los tres toggles filtran por tipo.
 */

import type { CharRange, DiffItem, DiffKind, DiffResult } from "@/bindings";

export type KindFilters = Record<DiffKind, boolean>;

export const ALL_KINDS: DiffKind[] = ["Added", "Removed", "Changed"];

export const DEFAULT_FILTERS: KindFilters = { Added: true, Removed: true, Changed: true };

/** Comparación por unidades de código, como `str::cmp` de Rust en ASCII/BMP. */
function comparePaths(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Todas las filas, en el orden del panel GTK. */
export function diffRows(result: DiffResult | null): DiffItem[] {
    if (!result) {
        return [];
    }
    const rows = [...result.added, ...result.removed, ...result.changed];
    // `Array.prototype.sort` es estable desde ES2019, igual que `sort_by`.
    return rows.sort((a, b) => comparePaths(a.path, b.path));
}

/** Filas visibles con los filtros activos (`apply_filters`). */
export function filterRows(rows: DiffItem[], filters: KindFilters): DiffItem[] {
    if (filters.Added && filters.Removed && filters.Changed) {
        return rows;
    }
    return rows.filter((item) => filters[item.kind]);
}

/** Cantidad de filas por tipo (lo que muestran los toggles). */
export function kindCounts(result: DiffResult | null): Record<DiffKind, number> {
    return {
        Added: result?.added.length ?? 0,
        Removed: result?.removed.length ?? 0,
        Changed: result?.changed.length ?? 0,
    };
}

export type ValueSegment = { text: string; highlight: boolean };

/**
 * Trocea `text` según `ranges` (índices de caracteres/code points, como los
 * devuelve `inline_char_ranges`): el equivalente de `markup_with_ranges`, sin
 * markup. Los rangos fuera del texto se recortan.
 */
export function valueSegments(text: string, ranges: CharRange[]): ValueSegment[] {
    const chars = Array.from(text);
    const segments: ValueSegment[] = [];
    const push = (from: number, to: number, highlight: boolean) => {
        if (to > from) {
            segments.push({ text: chars.slice(from, to).join(""), highlight });
        }
    };
    let pos = 0;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    for (const range of sorted) {
        const start = Math.max(pos, Math.min(range.start, chars.length));
        const end = Math.max(start, Math.min(range.end, chars.length));
        push(pos, start, false);
        push(start, end, true);
        pos = end;
    }
    push(pos, chars.length, false);
    return segments;
}

/** Ventana visible de una lista virtualizada de filas de alto fijo. */
export function visibleWindow(
    scrollTop: number,
    viewportHeight: number,
    rowHeight: number,
    total: number,
    overscan = 8,
): { start: number; end: number } {
    const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
    const count = Math.ceil(viewportHeight / rowHeight);
    const start = Math.max(0, first - overscan);
    const end = Math.min(total, first + count + overscan);
    return { start, end: Math.max(start, end) };
}

/*
 * Lógica de la barra de búsqueda (Ctrl+F), pura y sin UI.
 *
 * Paridad con `connect_search_bar` de `src/ui/main_window.rs`:
 *   - Sin distinguir mayúsculas (`CASE_INSENSITIVE`).
 *   - "Siguiente" busca desde el final de la selección (o el cursor); si no
 *     hay más, vuelve a empezar desde el principio (wrap-around).
 *   - "Anterior" busca hacia atrás desde el inicio de la selección; si no hay,
 *     vuelve desde el final.
 * Además (no estaba en la GTK) cuenta las coincidencias para el contador.
 */

import type { TextRange } from "@/lib/locate";

/** Tope de coincidencias que se cuentan; más allá el contador muestra "N+". */
export const MAX_MATCHES = 10_000;

/** Todas las coincidencias no solapadas de `query` en `text`. */
export function findMatches(text: string, query: string, limit: number = MAX_MATCHES): TextRange[] {
    if (query === "") {
        return [];
    }
    const loweredText = text.toLowerCase();
    const loweredQuery = query.toLowerCase();
    // Si bajar a minúsculas cambia longitudes, los offsets no sirven: búsqueda exacta.
    const sameLength = loweredText.length === text.length && loweredQuery.length === query.length;
    const haystack = sameLength ? loweredText : text;
    const needle = sameLength ? loweredQuery : query;

    const matches: TextRange[] = [];
    let at = haystack.indexOf(needle);
    while (at !== -1 && matches.length < limit) {
        matches.push({ from: at, to: at + needle.length });
        at = haystack.indexOf(needle, at + needle.length);
    }
    return matches;
}

export type SearchDirection = "next" | "prev";

/**
 * Índice de la coincidencia a la que se salta desde la selección actual
 * (`-1` si no hay coincidencias).
 */
export function pickMatch(matches: TextRange[], selection: TextRange, direction: SearchDirection): number {
    if (matches.length === 0) {
        return -1;
    }
    if (direction === "next") {
        const index = matches.findIndex((m) => m.from >= selection.to);
        return index === -1 ? 0 : index;
    }
    for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].to <= selection.from) {
            return i;
        }
    }
    return matches.length - 1;
}

/**
 * Primera coincidencia al escribir (búsqueda incremental): la que empieza en
 * la selección o después, para no saltar si la actual sigue valiendo.
 */
export function pickIncremental(matches: TextRange[], selection: TextRange): number {
    if (matches.length === 0) {
        return -1;
    }
    const index = matches.findIndex((m) => m.from >= selection.from);
    return index === -1 ? 0 : index;
}

/** Índice de la coincidencia que coincide exactamente con la selección, o `-1`. */
export function currentMatch(matches: TextRange[], selection: TextRange): number {
    return matches.findIndex((m) => m.from === selection.from && m.to === selection.to);
}

/*
 * Lógica pura del historial de sesiones (la barra lateral de la GTK).
 *
 * La GTK pagina con un límite creciente: arranca con una página y "Load more"
 * suma otra; con búsqueda usa `search_sessions`, sin búsqueda
 * `load_sessions_offset(0, limit)`. "Load more" solo se muestra si la página
 * vino llena (podría haber más). El total nunca pasa de `MAX_SESSIONS`
 * porque el storage poda las más viejas al guardar.
 */

import type { CommandError, DiffSummary, Session } from "@/bindings";
import type { StatusMessage } from "@/lib/errors";

/** `MAX_SESSIONS` de `rustdiff-persist/src/storage.rs`. */
export const MAX_SESSIONS = 20;
/** Sesiones por página ("Load more" suma otra página). */
export const HISTORY_PAGE_SIZE = 10;

export type HistoryApi = {
    historyList: (offset: number, limit: number) => Promise<Session[]>;
    historySearch: (query: string, limit: number) => Promise<Session[]>;
};

export type HistoryPage = {
    sessions: Session[];
    /** `true` si la página vino llena y podría haber más. */
    hasMore: boolean;
};

/** Carga las primeras `limit` sesiones, filtradas por `query` si no está vacía. */
export async function fetchHistoryPage(api: HistoryApi, query: string, limit: number): Promise<HistoryPage> {
    const trimmed = query.trim();
    const sessions = trimmed === "" ? await api.historyList(0, limit) : await api.historySearch(trimmed, limit);
    return { sessions, hasMore: sessions.length >= limit && limit < MAX_SESSIONS };
}

/** Límite de la página siguiente, sin pasar de `MAX_SESSIONS`. */
export function nextHistoryLimit(limit: number): number {
    return Math.min(MAX_SESSIONS, limit + HISTORY_PAGE_SIZE);
}

/** `DiffSummary::short_text` del storage: "+a −r ~c" o "Identical". */
export function summaryShort(summary: DiffSummary): StatusMessage | string {
    if (summary.total === 0) {
        return { key: "diff.identical" };
    }
    return `+${summary.added} −${summary.removed} ~${summary.changed}`;
}

/** Error de un comando del historial: "no disponible" o el mensaje de la operación. */
export function historyErrorStatus(err: CommandError, otherwise: StatusMessage): StatusMessage {
    return err.code === "HistoryUnavailable" ? { key: "history.status_unavailable", error: true } : otherwise;
}

/** Mensaje de estado al restaurar: "Session #N restored — summary". */
export function restoredStatus(session: Session): StatusMessage {
    const short = summaryShort(session.diff_summary);
    return typeof short === "string"
        ? { key: "history.status_restored", params: { id: session.id, summary: short } }
        : { key: "history.status_restored", params: { id: session.id }, nested: { summary: short } };
}

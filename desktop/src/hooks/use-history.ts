/*
 * Estado de la barra lateral del historial: búsqueda, paginación con
 * "Load more" y recarga tras guardar/borrar (ver `lib/history`).
 *
 * Solo consulta el backend mientras `enabled` es `true` (barra visible). Cada
 * consulta lleva un número de secuencia: solo la última pinta resultados, así
 * una búsqueda lenta no pisa a la que vino después.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { CommandError, Session } from "@/bindings";
import { toCommandError } from "@/lib/errors";
import { fetchHistoryPage, HISTORY_PAGE_SIZE, type HistoryApi, nextHistoryLimit } from "@/lib/history";

/** Espera antes de buscar mientras se escribe (como `search-changed` de GTK). */
export const HISTORY_SEARCH_DELAY_MS = 150;

export type HistoryState = {
    query: string;
    setQuery: (query: string) => void;
    sessions: Session[];
    hasMore: boolean;
    loading: boolean;
    error: CommandError | null;
    loadMore: () => void;
    /** Vuelve a la primera página con la búsqueda actual. */
    reload: () => void;
};

export function useHistory(api: HistoryApi, enabled: boolean, refreshToken = 0): HistoryState {
    const [query, setQueryState] = useState("");
    const [appliedQuery, setAppliedQuery] = useState("");
    const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
    const [version, setVersion] = useState(0);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<CommandError | null>(null);
    const sequence = useRef(0);
    const apiRef = useRef(api);
    apiRef.current = api;

    // La búsqueda se aplica con un pequeño retardo y vuelve a la primera página.
    useEffect(() => {
        if (query === appliedQuery) {
            return;
        }
        const timer = setTimeout(() => {
            setLimit(HISTORY_PAGE_SIZE);
            setAppliedQuery(query);
        }, HISTORY_SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [query, appliedQuery]);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        const seq = ++sequence.current;
        setLoading(true);
        fetchHistoryPage(apiRef.current, appliedQuery, limit)
            .then((page) => {
                if (seq !== sequence.current) {
                    return;
                }
                setSessions(page.sessions);
                setHasMore(page.hasMore);
                setError(null);
            })
            .catch((err: unknown) => {
                if (seq !== sequence.current) {
                    return;
                }
                setSessions([]);
                setHasMore(false);
                setError(toCommandError(err));
            })
            .finally(() => {
                if (seq === sequence.current) {
                    setLoading(false);
                }
            });
    }, [enabled, appliedQuery, limit, version, refreshToken]);

    const loadMore = useCallback(() => setLimit((current) => nextHistoryLimit(current)), []);

    const reload = useCallback(() => {
        setLimit(HISTORY_PAGE_SIZE);
        setVersion((v) => v + 1);
    }, []);

    return { query, setQuery: setQueryState, sessions, hasMore, loading, error, loadMore, reload };
}

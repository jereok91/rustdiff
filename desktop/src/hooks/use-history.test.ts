import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Session } from "@/bindings";
import { HISTORY_SEARCH_DELAY_MS, useHistory } from "@/hooks/use-history";
import { HISTORY_PAGE_SIZE } from "@/lib/history";

const session = (id: number): Session => ({
    id,
    created_at: "2026-07-27",
    format: "Json",
    left_content: "",
    right_content: "",
    diff_summary: { added: 0, removed: 0, changed: 0, total: 0 },
});

function fakeApi(count: number) {
    return {
        historyList: vi.fn(async (_offset: number, limit: number) =>
            Array.from({ length: Math.min(limit, count) }, (_, i) => session(count - i)),
        ),
        historySearch: vi.fn(async () => [session(3)]),
    };
}

describe("useHistory", () => {
    it("no consulta mientras la barra está oculta", () => {
        const api = fakeApi(3);
        renderHook(() => useHistory(api, false));
        expect(api.historyList).not.toHaveBeenCalled();
    });

    it("carga la primera página y 'Load more' pide la siguiente", async () => {
        const api = fakeApi(14);
        const { result } = renderHook(() => useHistory(api, true));
        await waitFor(() => expect(result.current.sessions).toHaveLength(HISTORY_PAGE_SIZE));
        expect(result.current.hasMore).toBe(true);

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.sessions).toHaveLength(14));
        expect(api.historyList).toHaveBeenLastCalledWith(0, HISTORY_PAGE_SIZE * 2);
        expect(result.current.hasMore).toBe(false);
    });

    it("la búsqueda se aplica con retardo y vuelve a la primera página", async () => {
        vi.useFakeTimers();
        try {
            const api = fakeApi(14);
            const { result } = renderHook(() => useHistory(api, true));
            await act(async () => {
                await Promise.resolve();
            });
            act(() => result.current.loadMore());
            act(() => result.current.setQuery("json"));
            expect(api.historySearch).not.toHaveBeenCalled();
            await act(async () => {
                vi.advanceTimersByTime(HISTORY_SEARCH_DELAY_MS);
                await Promise.resolve();
            });
            expect(api.historySearch).toHaveBeenCalledWith("json", HISTORY_PAGE_SIZE);
        } finally {
            vi.useRealTimers();
        }
    });

    it("un token de refresco nuevo recarga; un error deja la lista vacía con el código", async () => {
        const api = fakeApi(2);
        const { result, rerender } = renderHook(({ token }) => useHistory(api, true, token), {
            initialProps: { token: 0 },
        });
        await waitFor(() => expect(result.current.sessions).toHaveLength(2));
        api.historyList.mockRejectedValueOnce({ code: "HistoryUnavailable", message: "sin base" });
        rerender({ token: 1 });
        await waitFor(() => expect(result.current.error?.code).toBe("HistoryUnavailable"));
        expect(result.current.sessions).toHaveLength(0);
    });
});

import { describe, expect, it, vi } from "vitest";

import type { Session } from "@/bindings";
import {
    fetchHistoryPage,
    HISTORY_PAGE_SIZE,
    historyErrorStatus,
    MAX_SESSIONS,
    nextHistoryLimit,
    restoredStatus,
    summaryShort,
} from "@/lib/history";

const session = (id: number, total = 3): Session => ({
    id,
    created_at: "2026-07-27 10:00:00",
    format: "Json",
    left_content: "{}",
    right_content: "{}",
    diff_summary: { added: 1, removed: 0, changed: total - 1, total },
});

const api = (count: number) => ({
    historyList: vi.fn(async (_offset: number, limit: number) =>
        Array.from({ length: Math.min(limit, count) }, (_, i) => session(count - i)),
    ),
    historySearch: vi.fn(async (_query: string, limit: number) => [session(1)].slice(0, limit)),
});

describe("historial", () => {
    it("sin búsqueda lista desde el principio; página llena = puede haber más", async () => {
        const fake = api(15);
        const page = await fetchHistoryPage(fake, "", HISTORY_PAGE_SIZE);
        expect(fake.historyList).toHaveBeenCalledWith(0, HISTORY_PAGE_SIZE);
        expect(page.sessions).toHaveLength(HISTORY_PAGE_SIZE);
        expect(page.hasMore).toBe(true);

        const second = await fetchHistoryPage(fake, "", nextHistoryLimit(HISTORY_PAGE_SIZE));
        expect(second.sessions).toHaveLength(15);
        expect(second.hasMore).toBe(false);
    });

    it("con búsqueda usa historySearch con el texto recortado", async () => {
        const fake = api(5);
        const page = await fetchHistoryPage(fake, "  json ", HISTORY_PAGE_SIZE);
        expect(fake.historySearch).toHaveBeenCalledWith("json", HISTORY_PAGE_SIZE);
        expect(fake.historyList).not.toHaveBeenCalled();
        expect(page.hasMore).toBe(false);
    });

    it("la paginación nunca pasa de MAX_SESSIONS", async () => {
        expect(nextHistoryLimit(MAX_SESSIONS - 1)).toBe(MAX_SESSIONS);
        const page = await fetchHistoryPage(api(40), "", MAX_SESSIONS);
        expect(page.hasMore).toBe(false);
    });

    it("resumen corto y estado de restauración como la GTK", () => {
        expect(summaryShort({ added: 2, removed: 1, changed: 0, total: 3 })).toBe("+2 −1 ~0");
        expect(summaryShort({ added: 0, removed: 0, changed: 0, total: 0 })).toEqual({ key: "diff.identical" });
        expect(restoredStatus(session(7))).toEqual({
            key: "history.status_restored",
            params: { id: 7, summary: "+1 −0 ~2" },
        });
        expect(restoredStatus(session(8, 0)).nested).toEqual({ summary: { key: "diff.identical" } });
    });

    it("historial no disponible tiene su propio mensaje", () => {
        const otherwise = { key: "x" };
        expect(historyErrorStatus({ code: "HistoryUnavailable", message: "" }, otherwise).key).toBe(
            "history.status_unavailable",
        );
        expect(historyErrorStatus({ code: "Io", message: "" }, otherwise)).toBe(otherwise);
    });
});

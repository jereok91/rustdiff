/*
 * Panel de diferencias: filtros con conteo, resaltado inline en filas
 * Changed, click-to-activate y virtualización con muchas filas.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/bindings", () => ({ commands: { inlineCharRanges: vi.fn() } }));

import type { DiffResult } from "@/bindings";
import { DiffTable } from "@/components/diff-table";
import "@/i18n";

afterEach(cleanup);

const result: DiffResult = {
    added: [{ path: "$.nuevo", kind: "Added", left: null, right: "true" }],
    removed: [{ path: "$.viejo", kind: "Removed", left: '"x"', right: null }],
    changed: [{ path: "$.edad", kind: "Changed", left: "30", right: "31" }],
};

const noRanges = vi.fn(async () => ({ left: [], right: [] }));

const bodyRows = () => screen.getByTestId("diff-table").querySelectorAll("tbody tr[data-kind]");

describe("DiffTable", () => {
    it("los toggles muestran el conteo y filtran por tipo", () => {
        render(<DiffTable result={result} fetchRanges={noRanges} />);
        expect(screen.getByTestId("filter-Added").textContent).toContain("1");
        expect(screen.getByTestId("diff-summary").textContent).toBe(
            "3 difference(s): 1 added, 1 removed, 1 changed",
        );
        expect(bodyRows()).toHaveLength(3);

        fireEvent.click(screen.getByTestId("filter-Added"));
        expect(screen.getByTestId("filter-Added").getAttribute("aria-pressed")).toBe("false");
        expect([...bodyRows()].map((r) => r.getAttribute("data-kind"))).toEqual(["Changed", "Removed"]);

        fireEvent.click(screen.getByTestId("filter-Changed"));
        fireEvent.click(screen.getByTestId("filter-Removed"));
        expect(bodyRows()).toHaveLength(0);
    });

    it("resalta los caracteres que difieren en las celdas de filas Changed", async () => {
        const fetchRanges = vi.fn(async () => ({ left: [{ start: 1, end: 2 }], right: [{ start: 1, end: 2 }] }));
        render(<DiffTable result={result} fetchRanges={fetchRanges} />);
        await waitFor(() => expect(screen.getByTestId("diff-table").querySelectorAll("mark")).toHaveLength(2));
        // Solo las filas Changed piden rangos.
        expect(fetchRanges).toHaveBeenCalledTimes(1);
        expect(fetchRanges).toHaveBeenCalledWith("30", "31");
        const marks = [...screen.getByTestId("diff-table").querySelectorAll("mark")].map((m) => m.textContent);
        expect(marks).toEqual(["0", "1"]);
    });

    it("click y flechas activan la fila", () => {
        const onActivate = vi.fn();
        render(<DiffTable result={result} fetchRanges={noRanges} onActivate={onActivate} />);
        fireEvent.click(screen.getByText("$.viejo"));
        expect(onActivate).toHaveBeenLastCalledWith(result.removed[0]);
        expect(screen.getByText("$.viejo").closest("tr")?.getAttribute("aria-selected")).toBe("true");

        fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowUp" });
        expect(onActivate).toHaveBeenLastCalledWith(result.added[0]);
    });

    it("con 3000+ filas solo monta una ventana y pide rangos solo para ella", () => {
        const many: DiffResult = {
            added: [],
            removed: [],
            changed: Array.from({ length: 3500 }, (_, i) => ({
                path: `$.k${String(i).padStart(4, "0")}`,
                kind: "Changed" as const,
                left: String(i),
                right: String(i + 1),
            })),
        };
        const fetchRanges = vi.fn(async () => ({ left: [], right: [] }));
        render(<DiffTable result={many} fetchRanges={fetchRanges} />);
        const mounted = bodyRows().length;
        expect(mounted).toBeGreaterThan(0);
        expect(mounted).toBeLessThan(100);
        expect(fetchRanges.mock.calls.length).toBe(mounted);
        expect(screen.getByTestId("filter-Changed").textContent).toContain("3500");
    });

    it("sin resultado muestra el vacío", () => {
        render(<DiffTable result={null} fetchRanges={noRanges} />);
        expect(screen.queryByTestId("diff-table")).toBeNull();
        expect(screen.getByTestId("diff-panel").textContent).toContain("No differences");
    });
});

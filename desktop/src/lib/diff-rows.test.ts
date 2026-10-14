import { describe, expect, it } from "vitest";

import type { DiffResult } from "@/bindings";
import { diffRows, filterRows, kindCounts, valueSegments, visibleWindow, pathSegments, stepRow } from "@/lib/diff-rows";

const result: DiffResult = {
    added: [{ path: "$.c", kind: "Added", left: null, right: "1" }],
    removed: [{ path: "$.a", kind: "Removed", left: "1", right: null }],
    changed: [
        { path: "$.b", kind: "Changed", left: "1", right: "2" },
        { path: "$.c", kind: "Changed", left: "3", right: "4" },
    ],
};

describe("diffRows", () => {
    it("ordena por ruta, estable como `sort_by` de la GTK", () => {
        expect(diffRows(result).map((r) => `${r.kind}:${r.path}`)).toEqual([
            "Removed:$.a",
            "Changed:$.b",
            "Added:$.c",
            "Changed:$.c",
        ]);
        expect(diffRows(null)).toEqual([]);
    });
});

describe("filtros", () => {
    const rows = diffRows(result);

    it("cada toggle oculta su tipo", () => {
        expect(filterRows(rows, { Added: true, Removed: true, Changed: true })).toBe(rows);
        expect(filterRows(rows, { Added: false, Removed: true, Changed: true }).map((r) => r.kind)).toEqual([
            "Removed",
            "Changed",
            "Changed",
        ]);
        expect(filterRows(rows, { Added: false, Removed: false, Changed: true })).toHaveLength(2);
        expect(filterRows(rows, { Added: false, Removed: false, Changed: false })).toEqual([]);
    });

    it("cuenta filas por tipo", () => {
        expect(kindCounts(result)).toEqual({ Added: 1, Removed: 1, Changed: 2 });
        expect(kindCounts(null)).toEqual({ Added: 0, Removed: 0, Changed: 0 });
    });
});

describe("valueSegments (markup_with_ranges)", () => {
    it("trocea por índices de caracteres, también con astrales", () => {
        expect(valueSegments('"hola"', [{ start: 2, end: 4 }])).toEqual([
            { text: '"h', highlight: false },
            { text: "ol", highlight: true },
            { text: 'a"', highlight: false },
        ]);
        expect(valueSegments("a😀b", [{ start: 1, end: 2 }])).toEqual([
            { text: "a", highlight: false },
            { text: "😀", highlight: true },
            { text: "b", highlight: false },
        ]);
    });

    it("recorta rangos fuera del texto y sin rangos devuelve el texto entero", () => {
        expect(valueSegments("ab", [{ start: 1, end: 9 }])).toEqual([
            { text: "a", highlight: false },
            { text: "b", highlight: true },
        ]);
        expect(valueSegments("ab", [])).toEqual([{ text: "ab", highlight: false }]);
    });
});

describe("visibleWindow", () => {
    it("monta solo las filas visibles más el margen", () => {
        expect(visibleWindow(0, 280, 28, 3000, 5)).toEqual({ start: 0, end: 15 });
        expect(visibleWindow(28 * 1000, 280, 28, 3000, 5)).toEqual({ start: 995, end: 1015 });
        expect(visibleWindow(28 * 2995, 280, 28, 3000, 5)).toEqual({ start: 2990, end: 3000 });
        expect(visibleWindow(0, 280, 28, 0)).toEqual({ start: 0, end: 0 });
    });
});

describe("pathSegments", () => {
    it("trocea rutas JSON con raíz, nombres e índices", () => {
        expect(pathSegments("$.usuario.tags[1]")).toEqual([
            { text: "$", kind: "root", last: false },
            { text: ".usuario", kind: "name", last: false },
            { text: ".tags", kind: "name", last: false },
            { text: "[1]", kind: "index", last: true },
        ]);
    });

    it("acepta rutas XML y SQL que no empiezan con $", () => {
        expect(pathSegments("root.item[0]").map((s) => s.text)).toEqual(["root", ".item", "[0]"]);
        expect(pathSegments("stmt[3]").map((s) => s.kind)).toEqual(["name", "index"]);
    });

    it("lo que no encaja queda como un solo tramo", () => {
        expect(pathSegments("")).toEqual([{ text: "", kind: "name", last: true }]);
        expect(pathSegments("a[b")).toEqual([{ text: "a[b", kind: "name", last: true }]);
    });
});

describe("stepRow", () => {
    const rows = ["a", "b", "c"];

    it("avanza y retrocede con vuelta", () => {
        expect(stepRow(rows, "c", 1)).toBe(0);
        expect(stepRow(rows, "a", -1)).toBe(2);
        expect(stepRow(rows, "b", 1)).toBe(2);
    });

    it("sin selección empieza por el extremo; sin filas no hay destino", () => {
        expect(stepRow(rows, null, 1)).toBe(0);
        expect(stepRow(rows, null, -1)).toBe(2);
        expect(stepRow([], null, 1)).toBe(-1);
    });
});

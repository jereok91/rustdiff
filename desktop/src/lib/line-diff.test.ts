import { describe, expect, it, vi } from "vitest";

import type { DiffResult } from "@/bindings";
import {
    buildDiffDecorations,
    charToUtf16,
    cleanSearchValue,
    computeLineOps,
    extractKeyFromPath,
    inlineMarks,
    lineHighlights,
    lineStartOffsets,
    semanticMarks,
    splitLines,
} from "@/lib/line-diff";

const EMPTY: DiffResult = { added: [], removed: [], changed: [] };

describe("splitLines", () => {
    it("se comporta como str::lines de Rust", () => {
        expect(splitLines("")).toEqual([]);
        expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
        expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
        expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
    });
});

describe("computeLineOps + lineHighlights", () => {
    it("un borrado seguido de una inserción es un replace emparejado por posición", () => {
        const ops = computeLineOps(["a", "b", "c"], ["a", "B", "c"]);
        expect(ops.map((op) => op.tag)).toEqual(["equal", "replace", "equal"]);
        const { left, right, pairs } = lineHighlights(ops);
        expect(left).toEqual([{ line: 1, kind: "removed" }]);
        expect(right).toEqual([{ line: 1, kind: "added" }]);
        expect(pairs).toEqual([{ left: 1, right: 1 }]);
    });

    it("inserciones y borrados puros no generan pares inline", () => {
        const { left, right, pairs } = lineHighlights(computeLineOps(["a", "x", "b"], ["a", "b", "y"]));
        expect(left).toEqual([{ line: 1, kind: "removed" }]);
        expect(right).toEqual([{ line: 2, kind: "added" }]);
        expect(pairs).toEqual([]);
    });

    it("en un replace desparejo solo se emparejan las líneas comunes", () => {
        const { pairs, right } = lineHighlights(computeLineOps(["a"], ["b", "c"]));
        expect(pairs).toEqual([{ left: 0, right: 0 }]);
        expect(right.map((h) => h.line)).toEqual([0, 1]);
    });

    it("textos iguales no tienen decoraciones", () => {
        const { left, right, pairs } = lineHighlights(computeLineOps(["a", "b"], ["a", "b"]));
        expect([left, right, pairs]).toEqual([[], [], []]);
    });
});

describe("offsets", () => {
    it("lineStartOffsets marca el inicio de cada línea", () => {
        expect(lineStartOffsets("ab\ncd\n")).toEqual([0, 3, 6]);
    });

    it("convierte índices de code points (Rust) a UTF-16 (CodeMirror)", () => {
        const line = "a😀b";
        expect(charToUtf16(line, 1)).toBe(1);
        expect(charToUtf16(line, 2)).toBe(3);
        expect(charToUtf16(line, 3)).toBe(4);
    });

    it("inlineMarks desplaza al inicio de línea y descarta rangos vacíos", () => {
        expect(
            inlineMarks(10, "x😀yz", [
                { start: 1, end: 3 },
                { start: 2, end: 2 },
            ], "added"),
        ).toEqual([{ from: 11, to: 14, kind: "added" }]);
    });
});

describe("resaltado semántico", () => {
    it("limpia comillas y extrae la clave de la ruta como la GTK", () => {
        expect(cleanSearchValue(' "ana" ')).toBe("ana");
        expect(cleanSearchValue("31")).toBe("31");
        expect(extractKeyFromPath("$.usuario.edad")).toBe("edad");
        expect(extractKeyFromPath("$.tags[1]")).toBe("tags");
        expect(extractKeyFromPath("root.item[@id]")).toBe("id");
        expect(extractKeyFromPath("root.item.[text]")).toBe("item");
    });

    it("marca valor y clave del lado que corresponde", () => {
        const text = '{\n  "edad": 31\n}';
        const result: DiffResult = {
            ...EMPTY,
            changed: [{ path: "$.edad", kind: "Changed", left: "30", right: "31" }],
        };
        const marks = semanticMarks(text, result, "right");
        expect(marks).toContainEqual({ from: text.indexOf("31"), to: text.indexOf("31") + 2, kind: "changed" });
        expect(marks).toContainEqual({ from: 4, to: 10, kind: "changed" });
        // Un añadido no se busca en el documento izquierdo.
        const added: DiffResult = { ...EMPTY, added: [{ path: "$.x", kind: "Added", left: null, right: "1" }] };
        expect(semanticMarks("1", added, "left")).toEqual([]);
    });

    it("la marca de un valor corto no cae dentro de una clave (captura de F3)", () => {
        // Antes: la primera aparición cruda de `b` estaba en `"nombre"`.
        const left = '{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}';
        const result: DiffResult = {
            ...EMPTY,
            changed: [
                { path: "$.tags[1]", kind: "Changed", left: '"b"', right: '"c"' },
                { path: "$.usuario.edad", kind: "Changed", left: "30", right: "31" },
            ],
        };
        const marks = semanticMarks(left, result, "left");
        const valueB = left.indexOf('"b"') + 1;
        expect(marks).toContainEqual({ from: valueB, to: valueB + 1, kind: "changed" });
        const nombre = left.indexOf('"nombre"');
        // Ninguna marca toca la clave `"nombre"` ni el valor `"ana"`.
        for (const mark of marks) {
            expect(mark.to <= nombre || mark.from >= left.indexOf('"ana"') + 5).toBe(true);
        }
        expect(marks).toContainEqual({ from: left.indexOf("30"), to: left.indexOf("30") + 2, kind: "changed" });
        // La clave de `$.tags[1]` no es `"tags"` (el token anterior).
        expect(marks.some((m) => m.from === left.indexOf('"tags"'))).toBe(false);
    });

    it("la clave marcada es la del item, no el token anterior (captura del design system)", () => {
        const docs = {
            left: '{\n  "usuario": {"nombre": "ana", "edad": 30},\n  "tags": ["a", "b"]\n}\n',
            right: '{\n  "usuario": {"nombre": "ana", "edad": 31},\n  "tags": ["a", "c"],\n  "activo": true\n}\n',
        };
        const result: DiffResult = {
            ...EMPTY,
            added: [{ path: "$.activo", kind: "Added", left: null, right: "true" }],
            changed: [
                { path: "$.tags[1]", kind: "Changed", left: '"b"', right: '"c"' },
                { path: "$.usuario.edad", kind: "Changed", left: "30", right: "31" },
            ],
        };
        for (const side of ["left", "right"] as const) {
            const text = docs[side];
            const marked = semanticMarks(text, result, side).map((m) => text.slice(m.from, m.to));
            // `$.usuario.edad`: clave `"edad"` y su valor.
            expect(marked).toContain('"edad"');
            expect(marked).toContain(side === "left" ? "30" : "31");
            // `$.tags[1]`: solo el valor del elemento, ni `"tags"` ni otra clave.
            expect(marked).toContain(side === "left" ? "b" : "c");
            for (const wrong of ['"usuario"', '"nombre"', '"tags"', '"ana"']) {
                expect(marked).not.toContain(wrong);
            }
            // Exactamente en el `"edad"` que precede al valor cambiado.
            const edad = text.indexOf('"edad"');
            const marks = semanticMarks(text, result, side);
            expect(marks).toContainEqual({ from: edad, to: edad + 6, kind: "changed" });
        }
    });

    it("el texto plano (line[N]) no usa resaltado semántico", () => {
        const result: DiffResult = {
            ...EMPTY,
            changed: [{ path: "line[0]", kind: "Changed", left: "a", right: "b" }],
        };
        expect(semanticMarks("b", result, "right")).toEqual([]);
    });
});

describe("buildDiffDecorations", () => {
    it("pide rangos inline solo para pares cambiados y los ubica en el texto completo", async () => {
        const left = "same\nvalue 30\n";
        const right = "same\nvalue 31\nextra\n";
        const fetchRanges = vi.fn(async () => ({ left: [{ start: 7, end: 8 }], right: [{ start: 7, end: 8 }] }));

        const decos = await buildDiffDecorations(left, right, EMPTY, fetchRanges);

        expect(fetchRanges).toHaveBeenCalledTimes(1);
        expect(fetchRanges).toHaveBeenCalledWith("value 30", "value 31");
        expect(decos.left.lines).toEqual([{ line: 1, kind: "removed" }]);
        expect(decos.right.lines).toEqual([
            { line: 1, kind: "added" },
            { line: 2, kind: "added" },
        ]);
        expect(decos.left.marks).toEqual([{ from: 12, to: 13, kind: "removed" }]);
        expect(decos.right.marks).toEqual([{ from: 12, to: 13, kind: "added" }]);
    });

    it("respeta el tope de pares por comparación", async () => {
        const fetchRanges = vi.fn(async () => ({ left: [], right: [] }));
        await buildDiffDecorations("a\nb\nc", "x\ny\nz", EMPTY, fetchRanges, 2);
        expect(fetchRanges).toHaveBeenCalledTimes(2);
    });
});

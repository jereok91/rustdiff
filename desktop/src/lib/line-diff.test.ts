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
    semanticAlignment,
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

describe("alineación anclada por ruta", () => {
    // Reporte del usuario: el documento derecho agrega un segundo elemento de
    // `recuados` casi igual al primero del izquierdo. Como el diff de líneas
    // compara texto, el `insert` cae del lado del elemento agregado y el
    // elemento que la tabla reporta modificado queda sin decoración en el
    // izquierdo y "añadido" en el derecho, con las líneas corridas un elemento.
    const elemento = {
        AmountString: "444411.00",
        DeletedAt: null,
        ID: "ad4dba5b-97b0-45e1-86ed-59762297a666",
        recibido: true,
    };
    const modificado = {
        ...elemento,
        AmountString: "2222.00",
        ID: "97e1cf96-272f-4f01-8bae-28e0f88a020a",
    };
    const izquierda = JSON.stringify({ data: { recuados: [elemento] } }, null, 2);
    const derecha = JSON.stringify({ data: { recuados: [modificado, elemento] } }, null, 2);
    const lineasIzq = splitLines(izquierda);
    const lineasDer = splitLines(derecha);
    const resultado: DiffResult = {
        added: [{ path: "$.data.recuados[1]", kind: "Added", left: null, right: JSON.stringify(elemento) }],
        removed: [],
        changed: [
            { path: "$.data.recuados[0].AmountString", kind: "Changed", left: '"444411.00"', right: '"2222.00"' },
            {
                path: "$.data.recuados[0].ID",
                kind: "Changed",
                left: `"${elemento.ID}"`,
                right: `"${modificado.ID}"`,
            },
        ],
    };
    const sinAnclas = lineHighlights(computeLineOps(lineasIzq, lineasDer));
    const alineacion = semanticAlignment(izquierda, derecha, resultado);
    const conAnclas = lineHighlights(computeLineOps(lineasIzq, lineasDer, alineacion));

    it("cada item cambiado ancla en su línea de los dos lados", () => {
        expect(alineacion).toEqual([
            { left: 4, right: 4 },
            { left: 6, right: 6 },
        ]);
    });

    it("no marca entero el elemento modificado: empareja sus items cambiados", () => {
        expect(conAnclas.left).toEqual([4, 6].map((line) => ({ line, kind: "removed" })));
        expect(conAnclas.right).toEqual([4, 6, 8, 9, 10, 11, 12, 13].map((line) => ({ line, kind: "added" })));
        // Los pares son los que alimentan el diff inline de caracteres.
        expect(conAnclas.pairs).toEqual([
            { left: 4, right: 4 },
            { left: 6, right: 6 },
        ]);
    });

    it("las líneas idénticas del elemento modificado no se marcan", () => {
        // 5 (`DeletedAt`) y 7 (`recibido`) son iguales en los dos documentos y no
        // cambiaron: el Myers a secas las marcaba como añadidas del lado del
        // elemento agregado.
        const marcadas = conAnclas.right.map((h) => h.line);
        expect(marcadas).not.toContain(5);
        expect(marcadas).not.toContain(7);
    });

    it("el mismo caso espejado (elemento eliminado) no marca el modificado", () => {
        const espejo: DiffResult = {
            added: [],
            removed: [{ path: "$.data.recuados[1]", kind: "Removed", left: JSON.stringify(elemento), right: null }],
            changed: resultado.changed.map((item) => ({ ...item, left: item.right, right: item.left })),
        };
        const espejoAnclado = semanticAlignment(derecha, izquierda, espejo);
        const { left, right } = lineHighlights(computeLineOps(lineasDer, lineasIzq, espejoAnclado));
        expect(right.map((h) => h.line)).toEqual([4, 6]);
        expect(left.map((h) => h.line)).toEqual([4, 6, 8, 9, 10, 11, 12, 13]);
    });

    it("sin anclas el mismo caso corre las líneas y no empareja nada (lo que se reportó)", () => {
        expect(sinAnclas.left).toEqual([]);
        expect(sinAnclas.right.map((h) => h.line)).toEqual([4, 5, 6, 7, 8, 9]);
        expect(sinAnclas.pairs).toEqual([]);
    });

    it("el texto plano (line[N]) no ancla: el diff de líneas ya es el diff", () => {
        const texto: DiffResult = {
            ...EMPTY,
            changed: [{ path: "line[1]", kind: "Changed", left: "b", right: "B" }],
        };
        expect(semanticAlignment("a\nb\nc", "a\nB\nc", texto)).toEqual([]);
    });

    it("descarta un ancla que no avanza (misma línea dos veces)", () => {
        const result: DiffResult = {
            ...EMPTY,
            changed: [
                { path: "$.a", kind: "Changed", left: '"uno"', right: '"uno2"' },
                { path: "$.b", kind: "Changed", left: '"dos"', right: '"dos2"' },
            ],
        };
        // Los dos items viven en la misma línea (JSON compacto): una sola ancla.
        expect(semanticAlignment('{"a":"uno","b":"dos"}', '{"a":"uno2","b":"dos2"}', result)).toEqual([
            { left: 0, right: 0 },
        ]);
    });

    it("no ancla si los dos lados no caen en la misma columna (clave repetida)", () => {
        // Reporte del verificador independiente: `$.user.status` existe en dos
        // niveles y el valor nuevo (`active`) ya está en el anidado, así que el
        // `locate` del lado derecho ubica el token de la columna 6 (el de
        // `profile`) y no el del mismo nivel (columna 4).
        const arriba = JSON.stringify({ user: { profile: { status: "active", id: 1 }, status: "paused", id: 2 } }, null, 2);
        const abajo = JSON.stringify({ user: { profile: { status: "active", id: 1 }, status: "active", id: 2 } }, null, 2);
        const result: DiffResult = {
            ...EMPTY,
            changed: [{ path: "$.user.status", kind: "Changed", left: '"paused"', right: '"active"' }],
        };
        const anclas = semanticAlignment(arriba, abajo, result);
        expect(anclas).toEqual([]);
        // Sin ancla manda el diff de líneas: la línea 6 se empareja con la 6.
        const { left, right, pairs } = lineHighlights(computeLineOps(splitLines(arriba), splitLines(abajo), anclas));
        expect(pairs).toEqual([{ left: 6, right: 6 }]);
        expect(left.map((h) => h.line)).toEqual([6]);
        expect(right.map((h) => h.line)).toEqual([6]);
    });

    it("no ancla si el valor ubicado cae en otra línea que su clave (valor duplicado)", () => {
        // Reporte del refuter: el valor nuevo ya existe más arriba con el mismo
        // contenido y la misma columna, así que la búsqueda del token reubicaba
        // el item en esa línea y el par quedaba cruzado.
        const arriba = '{\n  "b": 1\n}';
        const abajo = '{\n  "a": 2,\n  "b": 1\n}';
        const result: DiffResult = {
            ...EMPTY,
            changed: [{ path: "$.b", kind: "Changed", left: "1", right: "2" }],
        };
        // La clave `"b"` está en la línea 2 y el `2` que se ubica es el de la
        // línea 1: sin ancla, el diff de líneas decide.
        expect(semanticAlignment(arriba, abajo, result)).toEqual([]);
    });

    it("no ancla en XML: el índice de hermano no se distingue", () => {
        // Reporte del verificador: `r.item[1].valor.[text]` ubica el primer
        // `<item>` y los hermanos comparten columna, así que el ancla cruzaba
        // posiciones y marcaba la línea idéntica de arriba.
        const arriba = "<r>\n  <item><valor>old</valor></item>\n  <item><valor>old</valor></item>\n</r>";
        const abajo = "<r>\n  <item><valor>old</valor></item>\n  <item><valor>new</valor></item>\n</r>";
        const result: DiffResult = {
            ...EMPTY,
            changed: [{ path: "r.item[1].valor.[text]", kind: "Changed", left: "old", right: "new" }],
        };
        const anclas = semanticAlignment(arriba, abajo, result);
        expect(anclas).toEqual([]);
        // El diff de líneas empareja la 2 con la 2 y no toca la 1.
        const { left, right, pairs } = lineHighlights(computeLineOps(splitLines(arriba), splitLines(abajo), anclas));
        expect(pairs).toEqual([{ left: 2, right: 2 }]);
        expect(left.map((h) => h.line)).toEqual([2]);
        expect(right.map((h) => h.line)).toEqual([2]);
    });

    it("un elemento añadido con la clave del array repetida no fuerza nada", () => {
        // Contraejemplo del verificador: `$.d[1]` con otro `"d"` más arriba, así
        // que un tramo de un solo lado ubicado por ruta caería en el array
        // ajeno y marcaría líneas idénticas que no cambiaron.
        const arriba = JSON.stringify({ c: { d: [{ x: 1 }, { x: 2 }] }, d: [{ y: 2 }] }, null, 2);
        const abajo = JSON.stringify({ c: { d: [{ x: 1 }, { x: 2 }] }, d: [{ y: 2 }, { y: 2 }] }, null, 2);
        const result: DiffResult = {
            ...EMPTY,
            added: [{ path: "$.d[1]", kind: "Added", left: null, right: '{"y":2}' }],
        };
        const anclas = semanticAlignment(arriba, abajo, result);
        expect(anclas).toEqual([]);
        const conAnclas = lineHighlights(computeLineOps(splitLines(arriba), splitLines(abajo), anclas));
        // La línea 4 (`{"x": 2}`) es idéntica en los dos documentos y no cambió:
        // antes se enmascaraba y quedaba como eliminada y añadida a la vez.
        expect(conAnclas.left).toEqual([]);
        const marcadas = conAnclas.right.map((h) => h.line);
        expect(marcadas).not.toContain(4);
        // Lo único que se toca es la cola del array que recibió el elemento.
        expect(marcadas.every((line) => line >= 12)).toBe(true);
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

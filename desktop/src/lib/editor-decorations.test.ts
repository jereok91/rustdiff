import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";

import {
    decorationRanges,
    diffDecorations,
    lineMarkers,
    MARKER_GLYPH,
    setDiffDecorations,
    setFlashRange,
} from "@/lib/editor-decorations";

describe("decorationRanges", () => {
    const doc = EditorState.create({ doc: "uno\ndos\ntres" }).doc;

    it("convierte líneas a su offset y ordena líneas antes que marcas", () => {
        const ranges = decorationRanges(doc, {
            lines: [{ line: 1, kind: "added" }],
            marks: [
                { from: 9, to: 12, kind: "changed" },
                { from: 4, to: 6, kind: "added" },
            ],
        });
        expect(ranges).toEqual([
            { from: 4, to: 4, className: "cm-diff-line-added" },
            { from: 4, to: 6, className: "cm-diff-added" },
            { from: 9, to: 12, className: "cm-diff-changed" },
        ]);
    });

    it("descarta lo que quedó fuera del documento", () => {
        const ranges = decorationRanges(doc, {
            lines: [{ line: 7, kind: "removed" }],
            marks: [
                { from: 10, to: 99, kind: "removed" },
                { from: 3, to: 3, kind: "removed" },
            ],
        });
        expect(ranges).toEqual([]);
    });
});

describe("diffDecorations (StateField)", () => {
    it("aplica el efecto sin lanzar y sigue los cambios del documento", () => {
        let state = EditorState.create({ doc: "a\nb", extensions: [diffDecorations()] });
        state = state.update({
            effects: setDiffDecorations.of({
                lines: [{ line: 1, kind: "added" }],
                marks: [{ from: 2, to: 3, kind: "added" }],
            }),
        }).state;
        state = state.update({ changes: { from: 0, insert: "zz" } }).state;
        expect(state.doc.toString()).toBe("zza\nb");
    });
});

describe("lineMarkers", () => {
    const doc = EditorState.create({ doc: "uno\ndos\ntres\ncuatro" }).doc;

    it("una línea por marcador: manda el fondo de línea, si no la primera marca", () => {
        const markers = lineMarkers(doc, {
            lines: [{ line: 1, kind: "removed" }],
            marks: [
                { from: 5, to: 6, kind: "changed" }, // línea 1, ya tiene fondo
                { from: 9, to: 11, kind: "changed" }, // línea 2
                { from: 8, to: 9, kind: "added" }, // línea 2, empieza antes: gana
            ],
        });
        expect(markers).toEqual([
            { line: 1, kind: "removed" },
            { line: 2, kind: "added" },
        ]);
    });

    it("una marca que cruza líneas marca todas, y lo inválido se descarta", () => {
        const markers = lineMarkers(doc, {
            lines: [{ line: 9, kind: "added" }],
            marks: [
                { from: 2, to: 6, kind: "changed" },
                { from: 3, to: 99, kind: "removed" },
            ],
        });
        expect(markers).toEqual([
            { line: 0, kind: "changed" },
            { line: 1, kind: "changed" },
        ]);
    });

    it("los glifos son + − ~", () => {
        expect(Object.values(MARKER_GLYPH)).toEqual(["+", "\u2212", "~"]);
    });
});

describe("destello de llegada", () => {
    it("marca el rango y cada línea que toca, y se apaga con null", () => {
        let state = EditorState.create({ doc: "uno\ndos\ntres", extensions: [diffDecorations()] });
        state = state.update({ effects: setFlashRange.of({ from: 2, to: 6 }) }).state;
        const classes = (s: EditorState) =>
            s.facet(EditorView.decorations).flatMap((source) => {
                const set = typeof source === "function" ? null : source;
                const out: string[] = [];
                set?.between(0, s.doc.length, (from, to, deco) => {
                    out.push(`${from}-${to}:${deco.spec.class}`);
                });
                return out;
            });
        expect(classes(state)).toEqual(expect.arrayContaining(["0-0:cm-diff-arrive", "4-4:cm-diff-arrive", "2-6:cm-diff-flash"]));
        state = state.update({ effects: setFlashRange.of(null) }).state;
        expect(classes(state).filter((c) => c.includes("arrive") || c.includes("flash"))).toEqual([]);
    });
});

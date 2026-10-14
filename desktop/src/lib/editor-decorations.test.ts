import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { decorationRanges, diffDecorations, setDiffDecorations } from "@/lib/editor-decorations";

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

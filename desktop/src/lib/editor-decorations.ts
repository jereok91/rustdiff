/*
 * Decoraciones de diff para CodeMirror 6.
 *
 * Un `StateField` guarda las decoraciones del editor; se reemplazan enteras con
 * el efecto `setDiffDecorations` después de cada comparación. Mientras el
 * usuario escribe, las decoraciones se desplazan con los cambios (`map`) hasta
 * que el auto-compare las recalcule.
 *
 * Las clases `cm-diff-*` y sus colores viven en `styles/tokens.css`.
 */

import { type Extension, RangeSetBuilder, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import type { SideDecorations } from "@/lib/line-diff";

export const setDiffDecorations = StateEffect.define<SideDecorations>();

const LINE_CLASS = {
    added: Decoration.line({ class: "cm-diff-line-added" }),
    removed: Decoration.line({ class: "cm-diff-line-removed" }),
} as const;

const MARK_CLASS = {
    added: Decoration.mark({ class: "cm-diff-added" }),
    removed: Decoration.mark({ class: "cm-diff-removed" }),
    changed: Decoration.mark({ class: "cm-diff-changed" }),
} as const;

/** Rango plano de una decoración, ya validado contra el documento. */
export type DecorationRange = { from: number; to: number; className: string };

/**
 * Traduce las decoraciones del diff a rangos absolutos y ordenados sobre `doc`.
 * Descarta lo que quede fuera del documento (el texto pudo cambiar mientras
 * la comparación viajaba por IPC).
 */
export function decorationRanges(doc: Text, side: SideDecorations): DecorationRange[] {
    const ranges: DecorationRange[] = [];
    for (const { line, kind } of side.lines) {
        if (line < 0 || line >= doc.lines) {
            continue;
        }
        const from = doc.line(line + 1).from;
        ranges.push({ from, to: from, className: `cm-diff-line-${kind}` });
    }
    for (const mark of side.marks) {
        if (mark.from < 0 || mark.to > doc.length || mark.to <= mark.from) {
            continue;
        }
        ranges.push({ from: mark.from, to: mark.to, className: `cm-diff-${mark.kind}` });
    }
    // RangeSetBuilder exige orden por `from` y, a igual `from`, las de línea
    // (punto) antes que las marcas.
    ranges.sort((a, b) => a.from - b.from || a.to - a.from - (b.to - b.from));
    return ranges;
}

function buildDecorations(doc: Text, side: SideDecorations): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const range of decorationRanges(doc, side)) {
        if (range.from === range.to) {
            const kind = range.className === "cm-diff-line-added" ? "added" : "removed";
            builder.add(range.from, range.from, LINE_CLASS[kind]);
        } else {
            const kind = range.className.slice("cm-diff-".length) as keyof typeof MARK_CLASS;
            builder.add(range.from, range.to, MARK_CLASS[kind]);
        }
    }
    return builder.finish();
}

const diffField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
        let next = value.map(tr.changes);
        for (const effect of tr.effects) {
            if (effect.is(setDiffDecorations)) {
                next = buildDecorations(tr.state.doc, effect.value);
            }
        }
        return next;
    },
    provide: (field) => EditorView.decorations.from(field),
});

/** Extensión a instalar en cada editor. */
export function diffDecorations(): Extension {
    return diffField;
}

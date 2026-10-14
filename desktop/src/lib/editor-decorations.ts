/*
 * Decoraciones de diff para CodeMirror 6.
 *
 * Un `StateField` guarda las decoraciones del editor; se reemplazan enteras con
 * el efecto `setDiffDecorations` después de cada comparación. Mientras el
 * usuario escribe, las decoraciones se desplazan con los cambios (`map`) hasta
 * que el auto-compare las recalcule.
 *
 * Además del fondo de línea y el énfasis de caracteres, cada línea con
 * diferencias lleva su marcador `+` / `−` / `~` en un margen propio (como los
 * paneles del prototipo, `docs/NuevaUX/rustdiff-ui`), y las líneas que solo
 * tienen cambios de valor reciben el tinte "changed".
 *
 * Las clases `cm-diff-*` y sus colores viven en `styles/tokens.css`.
 */

import {
    type Extension,
    RangeSet,
    RangeSetBuilder,
    StateEffect,
    StateField,
    type Text,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, gutter, GutterMarker } from "@codemirror/view";

import type { MarkKind, SideDecorations } from "@/lib/line-diff";

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

// ─────────────────────────────────────────────
// Marcadores de margen
// ─────────────────────────────────────────────

/** Glifo de cada tipo en el margen (el `−` es el signo menos, no un guion). */
export const MARKER_GLYPH: Record<MarkKind, string> = { added: "+", removed: "\u2212", changed: "~" };

/** Tipo de diferencia de una línea (0-based) para su marcador. */
export type LineMarker = { line: number; kind: MarkKind };

/**
 * Un marcador por línea con diferencias, ordenado por línea: manda el fondo
 * de línea (añadida / eliminada); si no lo hay, el tipo de la primera marca
 * que toca la línea. Lo que cae fuera del documento se descarta.
 */
export function lineMarkers(doc: Text, side: SideDecorations): LineMarker[] {
    const byLine = new Map<number, MarkKind>();
    for (const { line, kind } of side.lines) {
        if (line >= 0 && line < doc.lines) {
            byLine.set(line, kind);
        }
    }
    const marks = [...side.marks].sort((a, b) => a.from - b.from);
    for (const mark of marks) {
        if (mark.from < 0 || mark.to > doc.length || mark.to <= mark.from) {
            continue;
        }
        const first = doc.lineAt(mark.from).number - 1;
        const last = doc.lineAt(mark.to).number - 1;
        for (let line = first; line <= last; line++) {
            if (!byLine.has(line)) {
                byLine.set(line, mark.kind);
            }
        }
    }
    return [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([line, kind]) => ({ line, kind }));
}

class DiffMarker extends GutterMarker {
    constructor(readonly kind: MarkKind) {
        super();
    }
    eq(other: GutterMarker): boolean {
        return other instanceof DiffMarker && other.kind === this.kind;
    }
    toDOM(): Node {
        const span = document.createElement("span");
        span.className = `cm-diff-marker-${this.kind}`;
        span.textContent = MARKER_GLYPH[this.kind];
        return span;
    }
}

const MARKERS: Record<MarkKind, DiffMarker> = {
    added: new DiffMarker("added"),
    removed: new DiffMarker("removed"),
    changed: new DiffMarker("changed"),
};

/** Tinte de línea para las que solo tienen cambios de valor. */
const CHANGED_LINE = Decoration.line({ class: "cm-diff-line-changed" });

type MarkerState = { gutter: RangeSet<GutterMarker>; lines: DecorationSet };

function buildMarkers(doc: Text, side: SideDecorations): MarkerState {
    const gutterBuilder = new RangeSetBuilder<GutterMarker>();
    const lineBuilder = new RangeSetBuilder<Decoration>();
    const withLineClass = new Set(side.lines.map((l) => l.line));
    for (const { line, kind } of lineMarkers(doc, side)) {
        const from = doc.line(line + 1).from;
        gutterBuilder.add(from, from, MARKERS[kind]);
        if (kind === "changed" && !withLineClass.has(line)) {
            lineBuilder.add(from, from, CHANGED_LINE);
        }
    }
    return { gutter: gutterBuilder.finish(), lines: lineBuilder.finish() };
}

const markerField = StateField.define<MarkerState>({
    create: () => ({ gutter: RangeSet.empty, lines: Decoration.none }),
    update(value, tr) {
        let next = tr.docChanged
            ? { gutter: value.gutter.map(tr.changes), lines: value.lines.map(tr.changes) }
            : value;
        for (const effect of tr.effects) {
            if (effect.is(setDiffDecorations)) {
                next = buildMarkers(tr.state.doc, effect.value);
            }
        }
        return next;
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.lines),
});

const markerGutter = gutter({
    class: "cm-diff-gutter",
    markers: (view) => view.state.field(markerField).gutter,
    // Reserva el ancho aunque todavía no haya diferencias: el texto no salta.
    initialSpacer: () => MARKERS.changed,
});

/**
 * Destello sobre el rango al que salta un click en la tabla o la búsqueda:
 * `null` lo apaga. El rango queda contorneado (`cm-diff-flash`) y sus líneas
 * destellan y se asientan (`cm-diff-arrive`, el `animate-arrive` del
 * prototipo; sin animación con movimiento reducido). Vive aparte de las
 * decoraciones del diff para no reconstruirlas.
 */
export const setFlashRange = StateEffect.define<{ from: number; to: number } | null>();

const FLASH_MARK = Decoration.mark({ class: "cm-diff-flash" });
const ARRIVE_LINE = Decoration.line({ class: "cm-diff-arrive" });

/** Decoraciones del destello: una por línea tocada y el contorno del rango. */
function flashDecorations(doc: Text, from: number, to: number): DecorationSet {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    const ranges = [];
    for (let n = first; n <= last; n++) {
        const start = doc.line(n).from;
        ranges.push(ARRIVE_LINE.range(start, start));
    }
    ranges.push(FLASH_MARK.range(from, to));
    return Decoration.set(ranges, true);
}

const flashField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
        let next = value.map(tr.changes);
        for (const effect of tr.effects) {
            if (effect.is(setFlashRange)) {
                const range = effect.value;
                next =
                    range && range.to > range.from && range.to <= tr.state.doc.length
                        ? flashDecorations(tr.state.doc, range.from, range.to)
                        : Decoration.none;
            }
        }
        return next;
    },
    provide: (field) => EditorView.decorations.from(field),
});

/** Extensión a instalar en cada editor. */
export function diffDecorations(): Extension {
    return [diffField, markerField, markerGutter, flashField];
}

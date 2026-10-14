/*
 * Cálculo del resaltado de diferencias en los editores (puro, sin UI).
 *
 * Porta la estrategia de `src/ui/highlighter.rs` de la app GTK:
 *   1. Diff línea por línea (acá con `diff`, allá con `similar`): fondo
 *      sutil para líneas eliminadas (izquierda) y añadidas (derecha).
 *   2. En los bloques reemplazados, las líneas se emparejan por posición y
 *      se marcan los caracteres exactos que difieren con
 *      `commands.inlineCharRanges` (el mismo `inline_char_ranges` del núcleo).
 *   3. Resaltado semántico: el valor de cada `DiffItem` (y su clave) se marca
 *      con el color de su tipo. A diferencia de la GTK, que toma la primera
 *      aparición cruda, se ancla por la ruta y se busca el token completo
 *      (`lib/locate`).
 *
 * Todas las posiciones que salen de este módulo son offsets UTF-16 sobre el
 * texto completo, que es lo que entiende CodeMirror. El núcleo devuelve
 * offsets de caracteres (code points), así que se convierten acá.
 */

import { diffArrays } from "diff";
import type { CharRange, DiffItem, DiffResult, InlineRanges } from "@/bindings";
import { cleanSearchValue, locateItem, type TextRange } from "@/lib/locate";

/** Tope de pares de líneas que piden rangos inline al backend por comparación. */
export const MAX_INLINE_PAIRS = 500;

/** Mismo criterio que `str::lines` de Rust: sin línea vacía final y sin `\r`. */
export function splitLines(text: string): string[] {
    if (text === "") {
        return [];
    }
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

export type LineOpTag = "equal" | "delete" | "insert" | "replace";

/** Operación sobre rangos semiabiertos de líneas, como `similar::DiffOp`. */
export type LineOp = {
    tag: LineOpTag;
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
};

/** Diff línea por línea; un borrado seguido de una inserción es un `replace`. */
export function computeLineOps(left: string[], right: string[]): LineOp[] {
    const ops: LineOp[] = [];
    let oldPos = 0;
    let newPos = 0;
    let pendingDel = 0;
    let pendingIns = 0;

    const flush = () => {
        if (pendingDel === 0 && pendingIns === 0) {
            return;
        }
        const tag: LineOpTag = pendingDel > 0 && pendingIns > 0 ? "replace" : pendingDel > 0 ? "delete" : "insert";
        ops.push({
            tag,
            oldStart: oldPos,
            oldEnd: oldPos + pendingDel,
            newStart: newPos,
            newEnd: newPos + pendingIns,
        });
        oldPos += pendingDel;
        newPos += pendingIns;
        pendingDel = 0;
        pendingIns = 0;
    };

    for (const change of diffArrays(left, right)) {
        const count = change.value.length;
        if (change.added) {
            pendingIns += count;
        } else if (change.removed) {
            pendingDel += count;
        } else {
            flush();
            ops.push({
                tag: "equal",
                oldStart: oldPos,
                oldEnd: oldPos + count,
                newStart: newPos,
                newEnd: newPos + count,
            });
            oldPos += count;
            newPos += count;
        }
    }
    flush();
    return ops;
}

export type LineKind = "added" | "removed";
export type LineHighlight = { line: number; kind: LineKind };
export type LinePair = { left: number; right: number };

/** Fondos de línea por lado y pares de líneas emparejadas para el diff inline. */
export function lineHighlights(ops: LineOp[]): { left: LineHighlight[]; right: LineHighlight[]; pairs: LinePair[] } {
    const left: LineHighlight[] = [];
    const right: LineHighlight[] = [];
    const pairs: LinePair[] = [];

    for (const op of ops) {
        if (op.tag === "equal") {
            continue;
        }
        for (let i = op.oldStart; i < op.oldEnd; i++) {
            left.push({ line: i, kind: "removed" });
        }
        for (let j = op.newStart; j < op.newEnd; j++) {
            right.push({ line: j, kind: "added" });
        }
        if (op.tag === "replace") {
            const common = Math.min(op.oldEnd - op.oldStart, op.newEnd - op.newStart);
            for (let k = 0; k < common; k++) {
                pairs.push({ left: op.oldStart + k, right: op.newStart + k });
            }
        }
    }
    return { left, right, pairs };
}

/** Offset UTF-16 del inicio de cada línea (separador `\n`). */
export function lineStartOffsets(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            starts.push(i + 1);
        }
    }
    return starts;
}

/** Convierte un índice de caracteres (code points, como Rust) a offset UTF-16. */
export function charToUtf16(line: string, charIndex: number): number {
    let offset = 0;
    let chars = 0;
    while (chars < charIndex && offset < line.length) {
        const code = line.codePointAt(offset) ?? 0;
        offset += code > 0xffff ? 2 : 1;
        chars++;
    }
    return offset;
}

export type MarkKind = "added" | "removed" | "changed";
export type Mark = { from: number; to: number; kind: MarkKind };

/** Rangos de caracteres de una línea -> marcas con offsets absolutos. */
export function inlineMarks(lineStart: number, lineText: string, ranges: CharRange[], kind: MarkKind): Mark[] {
    const marks: Mark[] = [];
    for (const range of ranges) {
        const from = lineStart + charToUtf16(lineText, range.start);
        const to = lineStart + charToUtf16(lineText, range.end);
        if (to > from) {
            marks.push({ from, to, kind });
        }
    }
    return marks;
}

// Las utilidades de búsqueda viven en `lib/locate`; se reexportan por compatibilidad.
export { cleanSearchValue, extractKeyFromPath } from "@/lib/locate";

export type Side = "left" | "right";

/** Resaltado semántico de un lado (`apply_semantic_highlights`). */
export function semanticMarks(text: string, result: DiffResult, side: Side): Mark[] {
    const items: DiffItem[] =
        side === "left" ? [...result.removed, ...result.changed] : [...result.added, ...result.changed];
    const marks: Mark[] = [];

    const push = (range: TextRange | null, kind: MarkKind) => {
        if (range && range.to > range.from) {
            marks.push({ from: range.from, to: range.to, kind });
        }
    };

    for (const item of items) {
        // Texto plano: el diff inline por línea ya es más preciso.
        if (item.path.startsWith("line[")) {
            continue;
        }
        const value = side === "left" ? item.left : item.right;
        let kind: MarkKind;
        if (item.kind === "Changed") {
            kind = "changed";
        } else if (side === "left" && item.kind === "Removed") {
            kind = "removed";
        } else if (side === "right" && item.kind === "Added") {
            kind = "added";
        } else {
            continue;
        }
        if (!value || cleanSearchValue(value) === "") {
            continue;
        }
        // Clave y valor anclados por la ruta (ver `lib/locate`), no la
        // primera aparición cruda del texto.
        const found = locateItem(text, item.path, value);
        push(found.value, kind);
        // En un elemento de array la "clave" es el elemento: si ya cae sobre el
        // valor no se marca dos veces.
        const key = found.key;
        const overlaps = key && found.value && key.from < found.value.to && found.value.from < key.to;
        if (!overlaps) {
            push(key, kind);
        }
    }
    return marks;
}

export type SideDecorations = { lines: LineHighlight[]; marks: Mark[] };
export type DiffDecorations = { left: SideDecorations; right: SideDecorations };

export const EMPTY_DECORATIONS: DiffDecorations = {
    left: { lines: [], marks: [] },
    right: { lines: [], marks: [] },
};

export type RangesFetcher = (left: string, right: string) => Promise<InlineRanges>;

/**
 * Decoraciones completas de una comparación exitosa. `fetchRanges` es
 * `commands.inlineCharRanges` en la app y un doble en los tests.
 */
export async function buildDiffDecorations(
    leftText: string,
    rightText: string,
    result: DiffResult,
    fetchRanges: RangesFetcher,
    maxPairs: number = MAX_INLINE_PAIRS,
): Promise<DiffDecorations> {
    const leftLines = splitLines(leftText);
    const rightLines = splitLines(rightText);
    const { left, right, pairs } = lineHighlights(computeLineOps(leftLines, rightLines));

    const leftStarts = lineStartOffsets(leftText);
    const rightStarts = lineStartOffsets(rightText);

    const selected = pairs.slice(0, maxPairs);
    const ranges = await Promise.all(selected.map((pair) => fetchRanges(leftLines[pair.left], rightLines[pair.right])));

    const leftMarks: Mark[] = [];
    const rightMarks: Mark[] = [];
    selected.forEach((pair, index) => {
        const found = ranges[index];
        leftMarks.push(...inlineMarks(leftStarts[pair.left], leftLines[pair.left], found.left, "removed"));
        rightMarks.push(...inlineMarks(rightStarts[pair.right], rightLines[pair.right], found.right, "added"));
    });

    leftMarks.push(...semanticMarks(leftText, result, "left"));
    rightMarks.push(...semanticMarks(rightText, result, "right"));

    return {
        left: { lines: left, marks: leftMarks },
        right: { lines: right, marks: rightMarks },
    };
}

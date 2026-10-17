/*
 * Cálculo del resaltado de diferencias en los editores (puro, sin UI).
 *
 * Porta la estrategia de `src/ui/highlighter.rs` de la app GTK:
 *   1. Diff línea por línea (acá con `diff`, allá con `similar`): fondo
 *      sutil para líneas eliminadas (izquierda) y añadidas (derecha). Antes de
 *      difear, el diff semántico fija qué líneas se emparejan por ruta
 *      (`semanticAlignment`): el texto a secas elige el vecino parecido y marca
 *      entero como añadido un elemento que la tabla reporta modificado.
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
import { cleanSearchValue, locateItem, pathSyntax, type ItemLocation, type TextRange } from "@/lib/locate";

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

/**
 * Par de líneas que el diff semántico empareja: la misma ruta a los dos lados.
 *
 * Los tramos de un solo lado (un elemento de array que entra o se va entero) no
 * se fijan acá. `locate` ubica el token por ruta sin respetar la profundidad, así
 * que con una clave repetida en otro nivel —`$.d[1]` con otro `"d"` más arriba—
 * devuelve el tramo ajeno, y forzarlo marcaba líneas idénticas que no cambiaron.
 * Lo que entra o se va entero lo resuelve el diff de líneas.
 */
export type LineAnchor = { left: number; right: number };

/** Myers sobre un tramo de líneas, con los índices ya corridos al documento. */
function segmentOps(left: string[], right: string[], oldBase: number, newBase: number): LineOp[] {
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
            oldStart: oldBase + oldPos,
            oldEnd: oldBase + oldPos + pendingDel,
            newStart: newBase + newPos,
            newEnd: newBase + newPos + pendingIns,
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
                oldStart: oldBase + oldPos,
                oldEnd: oldBase + oldPos + count,
                newStart: newBase + newPos,
                newEnd: newBase + newPos + count,
            });
            oldPos += count;
            newPos += count;
        }
    }
    flush();
    return ops;
}

/**
 * Diff línea por línea; un borrado seguido de una inserción es un `replace`.
 *
 * `anchors` son pares de líneas que el diff semántico empareja (ver
 * `semanticAlignment`): entre ancla y ancla el diff es el de siempre, y el ancla
 * queda como un `replace` de una línea por lado, que es el par que
 * `lineHighlights` le pasa al diff inline de caracteres. Las anclas que no
 * avanzan en los dos lados se descartan.
 */
export function computeLineOps(left: string[], right: string[], anchors: LineAnchor[] = []): LineOp[] {
    const ops: LineOp[] = [];
    let oldPos = 0;
    let newPos = 0;

    for (const anchor of anchors) {
        const inside =
            anchor.left >= oldPos &&
            anchor.left < left.length &&
            anchor.right >= newPos &&
            anchor.right < right.length;
        if (!inside) {
            continue;
        }

        ops.push(...segmentOps(left.slice(oldPos, anchor.left), right.slice(newPos, anchor.right), oldPos, newPos));
        // La línea anclada cambió de valor: se empareja 1 a 1.
        ops.push({
            tag: left[anchor.left] === right[anchor.right] ? "equal" : "replace",
            oldStart: anchor.left,
            oldEnd: anchor.left + 1,
            newStart: anchor.right,
            newEnd: anchor.right + 1,
        });
        oldPos = anchor.left + 1;
        newPos = anchor.right + 1;
    }

    ops.push(...segmentOps(left.slice(oldPos), right.slice(newPos), oldPos, newPos));
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

/** Línea (0-based) que contiene `offset`, en un documento con esos inicios. */
function lineIndexAt(starts: number[], offset: number): number {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (starts[mid] <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
}

/** ¿El diff trae rutas del documento? En texto plano (`line[N]`) no hay qué anclar. */
function usesDocumentPaths(result: DiffResult): boolean {
    return [...result.added, ...result.removed, ...result.changed].some((item) => !item.path.startsWith("line["));
}

/** Columna de un offset dentro de su línea. */
function columnAt(starts: number[], offset: number): number {
    return offset - starts[lineIndexAt(starts, offset)];
}

/**
 * Rango que sirve de ancla para un item: su clave, si el valor ubicado cae en
 * la misma línea.
 *
 * `locate` ubica la clave por la ruta (por nombre, en orden) y el valor como
 * token. El valor puede aparecer antes en un hermano o en otro elemento del
 * array —misma columna, mismo contenido— y entonces la búsqueda del token
 * reubica el item en la línea equivocada: anclar ahí empareja con el hermano
 * de arriba y el diff de líneas marca como borradas e insertadas las líneas
 * idénticas del medio. Si la clave y el valor no comparten línea, la búsqueda
 * del valor se fue a otra aparición y el item no da ancla.
 */
function anchorRange(starts: number[], found: ItemLocation): TextRange | null {
    if (!found.key) {
        return found.value;
    }
    if (found.value && lineIndexAt(starts, found.value.from) !== lineIndexAt(starts, found.key.from)) {
        return null;
    }
    return found.key;
}

/**
 * Lo que el diff semántico sabe de la alineación, listo para `computeLineOps`.
 *
 * El diff de líneas compara texto, y con documentos que repiten bloques
 * parecidos —dos elementos de un array con las mismas claves— elige el vecino:
 * el elemento que la tabla reporta modificado queda entero como añadido de un
 * lado y sin decoración del otro, con el resto de las líneas corridas un
 * elemento. Cada ruta dice cuál es la línea que le toca a cada lado: los items
 * cambiados se emparejan (si la columna coincide en los dos lados).
 *
 * Las anclas se ordenan por línea y se descartan las que no avanzan en los dos
 * lados: dos items de la misma línea (JSON compacto) o un `locate` que cayó en
 * el elemento equivocado no pueden fijar dos anclas contradictorias.
 */
export function semanticAlignment(leftText: string, rightText: string, result: DiffResult): LineAnchor[] {
    if (!usesDocumentPaths(result)) {
        return [];
    }

    const leftStarts = lineStartOffsets(leftText);
    const rightStarts = lineStartOffsets(rightText);
    const candidates: LineAnchor[] = [];

    for (const item of result.changed) {
        const { left, right } = item;
        // Mismo criterio que `semanticMarks`: sin valor no hay token que ubicar.
        if (!left || cleanSearchValue(left) === "" || !right || cleanSearchValue(right) === "") {
            continue;
        }
        // Solo JSON: el recorrido de la ruta respeta los índices `[N]` del array.
        // En XML los índices de hermanos se ignoran (`<item>` es siempre el
        // primero) y los hermanos comparten columna, así que el ancla podía caer
        // en el hermano equivocado; sin ancla, esos formatos usan el diff de
        // líneas de siempre.
        if (pathSyntax(item.path) !== "json") {
            continue;
        }
        const rangeLeft = anchorRange(leftStarts, locateItem(leftText, item.path, left));
        const rangeRight = anchorRange(rightStarts, locateItem(rightText, item.path, right));
        if (!rangeLeft || !rangeRight) {
            continue;
        }
        // El `locate` no sabe de profundidad ni de claves repetidas: con el
        // mismo nombre en dos niveles ubica el token equivocado, y forzar ese
        // par marca líneas idénticas como cambiadas. Si los dos lados no caen en
        // la misma columna no es la misma posición y el ancla se descarta:
        // decide el diff de líneas.
        if (columnAt(leftStarts, rangeLeft.from) !== columnAt(rightStarts, rangeRight.from)) {
            continue;
        }
        candidates.push({
            left: lineIndexAt(leftStarts, rangeLeft.from),
            right: lineIndexAt(rightStarts, rangeRight.from),
        });
    }

    candidates.sort((a, b) => a.left - b.left || a.right - b.right);
    const anchors: LineAnchor[] = [];
    let lastLeft = -1;
    let lastRight = -1;
    for (const candidate of candidates) {
        if (candidate.left > lastLeft && candidate.right > lastRight) {
            anchors.push(candidate);
            lastLeft = candidate.left;
            lastRight = candidate.right;
        }
    }

    return anchors;
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
    // Las rutas del diff semántico fijan qué línea de la izquierda le toca a
    // cada línea de la derecha.
    const anchors = semanticAlignment(leftText, rightText, result);
    const { left, right, pairs } = lineHighlights(computeLineOps(leftLines, rightLines, anchors));

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

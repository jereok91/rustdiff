/*
 * Ubicación de un `DiffItem` dentro del texto de un editor (puro, sin UI).
 *
 * La GTK (`highlighter.rs`) busca la primera aparición cruda del valor, sin
 * distinguir mayúsculas. Eso falla con valores cortos: en
 * `{"usuario":{"nombre":"ana"},"tags":["a","b"]}` el valor `"b"` de
 * `$.tags[1]` caía dentro de la clave `"nombre"`. Acá se mejora en dos pasos:
 *
 *   1. **Ancla por ruta**: se recorre la ruta segmento a segmento (`"clave":`
 *      en JSON, `<tag` / `attr=` en XML), cada uno buscado después del
 *      anterior, y los índices de array JSON (`[N]`) saltan al N-ésimo
 *      elemento con un escaneo que respeta strings y anidamiento.
 *   2. **Valor como token**: desde el ancla se busca el valor como token
 *      completo (string JSON entre comillas, o palabra con bordes). Si no
 *      aparece, se reintenta en todo el documento y, como último recurso, la
 *      primera aparición cruda de la GTK.
 *
 * Todos los offsets son UTF-16 (los de CodeMirror).
 */

export type TextRange = { from: number; to: number };

/** Lo que se encontró de un item: su clave (último segmento) y su valor. */
export type ItemLocation = { key: TextRange | null; value: TextRange | null };

/** Quita las comillas envolventes de un string JSON (`clean_search_value`). */
export function cleanSearchValue(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/** Último segmento de una ruta de diff como nombre de clave (`extract_key_from_path`). */
export function extractKeyFromPath(path: string): string {
    // Atributo XML: `[@attr]`.
    const attr = path.lastIndexOf("[@");
    if (attr !== -1) {
        const end = path.indexOf("]", attr);
        if (end !== -1) {
            return path.slice(attr + 2, end);
        }
    }
    // Texto XML: `.[text]` al final (como `trim_end_matches(".[text]")`).
    if (path.endsWith("[text]")) {
        let base = path;
        while (base.endsWith(".[text]")) {
            base = base.slice(0, -".[text]".length);
        }
        const parts = base.split(".");
        return parts[parts.length - 1];
    }
    const parts = path.split(".");
    const last = parts[parts.length - 1];
    const bracket = last.lastIndexOf("[");
    if (bracket > 0) {
        return last.slice(0, bracket);
    }
    return last;
}

export type PathSyntax = "json" | "xml" | "line" | "stmt";

/** Sintaxis de una ruta según su forma (`$.` JSON, `line[N]`, `stmt[N]`, resto XML). */
export function pathSyntax(path: string): PathSyntax {
    if (path === "$" || path.startsWith("$.") || path.startsWith("$[")) {
        return "json";
    }
    if (/^line\[\d+\]$/.test(path)) {
        return "line";
    }
    if (/^stmt\[\d+\]$/.test(path)) {
        return "stmt";
    }
    return "xml";
}

/** Segmento de ruta: clave de objeto/tag, índice de array o atributo XML. */
export type PathSegment =
    | { type: "key"; name: string }
    | { type: "index"; index: number }
    | { type: "attr"; name: string };

/** Descompone una ruta JSON (`$.a.b[0].c`) o XML (`root.item[2][@id]`, `.[text]`). */
export function pathSegments(path: string): PathSegment[] {
    const segments: PathSegment[] = [];
    const body = path.startsWith("$") ? path.slice(1) : `.${path}`;
    const re = /\.\[text\]|\[@([^\]]+)\]|\[(\d+)\]|\.([^.[]+)/g;
    for (const m of body.matchAll(re)) {
        if (m[1] !== undefined) {
            segments.push({ type: "attr", name: m[1] });
        } else if (m[2] !== undefined) {
            segments.push({ type: "index", index: Number(m[2]) });
        } else if (m[3] !== undefined) {
            segments.push({ type: "key", name: m[3] });
        }
    }
    return segments;
}

const WORD = /[\p{L}\p{N}_]/u;

function isWordAt(text: string, index: number): boolean {
    return index >= 0 && index < text.length && WORD.test(text[index]);
}

function skipSpaces(text: string, pos: number): number {
    while (pos < text.length && /\s/.test(text[pos])) {
        pos++;
    }
    return pos;
}

/** `"key"` seguido de `:` (una clave JSON real, no un valor igual). */
function findJsonKey(text: string, key: string, from: number): TextRange | null {
    const needle = `"${key}"`;
    let at = text.indexOf(needle, from);
    while (at !== -1) {
        const after = skipSpaces(text, at + needle.length);
        if (text[after] === ":" && text[at - 1] !== "\\") {
            return { from: at, to: at + needle.length };
        }
        at = text.indexOf(needle, at + 1);
    }
    return null;
}

/** Fin del string JSON que empieza en `pos` (sobre la comilla de apertura). */
function skipJsonString(text: string, pos: number): number {
    let i = pos + 1;
    while (i < text.length) {
        if (text[i] === "\\") {
            i += 2;
        } else if (text[i] === '"') {
            return i + 1;
        } else {
            i++;
        }
    }
    return i;
}

/**
 * Desde `pos` (antes de un `[`), devuelve el offset del elemento `index` del
 * array, o `null` si la estructura no es la esperada.
 */
function jsonArrayElement(text: string, pos: number, index: number): number | null {
    let i = skipSpaces(text, pos);
    if (text[i] === ":") {
        i = skipSpaces(text, i + 1);
    }
    if (text[i] !== "[") {
        return null;
    }
    i++;
    let depth = 0;
    let current = 0;
    let start = skipSpaces(text, i);
    if (index === 0) {
        return text[start] === "]" ? null : start;
    }
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
            i = skipJsonString(text, i);
            continue;
        }
        if (ch === "[" || ch === "{") {
            depth++;
        } else if (ch === "]" || ch === "}") {
            if (depth === 0) {
                return null;
            }
            depth--;
        } else if (ch === "," && depth === 0) {
            current++;
            if (current === index) {
                start = skipSpaces(text, i + 1);
                return start;
            }
        }
        i++;
    }
    return null;
}

/** `<tag` seguido de espacio, `>` o `/`. */
function findXmlTag(text: string, tag: string, from: number): TextRange | null {
    const needle = `<${tag}`;
    let at = text.indexOf(needle, from);
    while (at !== -1) {
        const next = text[at + needle.length];
        if (next === undefined || /[\s>/]/.test(next)) {
            return { from: at + 1, to: at + needle.length };
        }
        at = text.indexOf(needle, at + 1);
    }
    return null;
}

/** `attr=` como nombre completo de atributo. */
function findXmlAttr(text: string, name: string, from: number): TextRange | null {
    let at = text.indexOf(name, from);
    while (at !== -1) {
        const after = skipSpaces(text, at + name.length);
        if (text[after] === "=" && !isWordAt(text, at - 1) && text[at - 1] !== ":" && text[at - 1] !== "-") {
            return { from: at, to: at + name.length };
        }
        at = text.indexOf(name, at + 1);
    }
    return null;
}

/** Ancla de la ruta: dónde empieza la zona del item y el rango de su clave. */
function anchorFor(text: string, path: string, syntax: PathSyntax): { anchor: number; key: TextRange | null } {
    let anchor = 0;
    let key: TextRange | null = null;
    const segments = pathSegments(path);
    for (const segment of segments) {
        let found: TextRange | null = null;
        if (syntax === "json") {
            if (segment.type === "key") {
                found = findJsonKey(text, segment.name, anchor);
            } else if (segment.type === "index") {
                const element = jsonArrayElement(text, anchor, segment.index);
                if (element === null) {
                    break;
                }
                anchor = element;
                continue;
            }
        } else if (segment.type === "key") {
            found = findXmlTag(text, segment.name, anchor);
        } else if (segment.type === "attr") {
            found = findXmlAttr(text, segment.name, anchor);
        } else {
            // Los índices XML cuentan hermanos de cualquier tag: se ignoran.
            continue;
        }
        if (!found) {
            break;
        }
        key = found;
        anchor = found.to;
    }
    return { anchor, key };
}

/** Primera aparición sin distinguir mayúsculas (como `CASE_INSENSITIVE` de GTK). */
export function firstOccurrence(text: string, needle: string, from = 0): number {
    if (needle === "") {
        return -1;
    }
    const lowered = text.toLowerCase();
    // Si bajar a minúsculas cambia longitudes, los offsets no sirven: búsqueda exacta.
    if (lowered.length !== text.length) {
        return text.indexOf(needle, from);
    }
    return lowered.indexOf(needle.toLowerCase(), from);
}

/** `needle` como token: sin letras/dígitos pegados en los bordes que sean palabra. */
function findWord(text: string, needle: string, from: number): number {
    if (needle === "") {
        return -1;
    }
    const checkStart = WORD.test(needle[0]);
    const checkEnd = WORD.test(needle[needle.length - 1]);
    let at = text.indexOf(needle, from);
    while (at !== -1) {
        const okStart = !checkStart || !isWordAt(text, at - 1);
        const okEnd = !checkEnd || !isWordAt(text, at + needle.length);
        if (okStart && okEnd) {
            return at;
        }
        at = text.indexOf(needle, at + 1);
    }
    return -1;
}

/** Busca el valor como token desde `from`; para strings JSON marca el contenido sin comillas. */
function findValueToken(text: string, raw: string, clean: string, syntax: PathSyntax, from: number): TextRange | null {
    const quoted = raw.trim().startsWith('"') && raw.trim().endsWith('"') && raw.trim().length >= 2;
    if (syntax === "json" && quoted) {
        const at = text.indexOf(`"${clean}"`, from);
        return at === -1 ? null : { from: at + 1, to: at + 1 + clean.length };
    }
    const at = findWord(text, clean, from);
    return at === -1 ? null : { from: at, to: at + clean.length };
}

/** Rango de la línea `n` (1-based, como `line[N]` del núcleo), sin el salto. */
function lineRange(text: string, n: number): TextRange | null {
    let start = 0;
    for (let line = 1; line < n; line++) {
        const nl = text.indexOf("\n", start);
        if (nl === -1) {
            return null;
        }
        start = nl + 1;
    }
    let end = text.indexOf("\n", start);
    if (end === -1) {
        end = text.length;
    }
    if (end > start && text[end - 1] === "\r") {
        end--;
    }
    return { from: start, to: end };
}

/**
 * Ubica un item en `text`: la clave del último segmento de la ruta y el valor
 * `value` (el del lado que corresponde, o `null` si ese lado no lo tiene).
 */
export function locateItem(text: string, path: string, value: string | null): ItemLocation {
    const syntax = pathSyntax(path);

    if (syntax === "line") {
        const n = Number(path.slice("line[".length, -1));
        return { key: null, value: lineRange(text, n) };
    }

    const anchored = syntax === "stmt" ? { anchor: 0, key: null } : anchorFor(text, path, syntax);
    const key = anchored.key;
    let anchor = anchored.anchor;
    // Texto XML: se busca después de la etiqueta de apertura, no en sus atributos.
    if (syntax === "xml" && path.endsWith("[text]")) {
        const close = text.indexOf(">", anchor);
        if (close !== -1) {
            anchor = close + 1;
        }
    }

    if (value === null) {
        return { key, value: null };
    }
    const clean = cleanSearchValue(value);
    if (clean === "") {
        return { key, value: null };
    }

    if (syntax !== "stmt") {
        const near = findValueToken(text, value, clean, syntax, anchor);
        if (near) {
            return { key, value: near };
        }
        const anywhere = findValueToken(text, value, clean, syntax, 0);
        if (anywhere) {
            return { key, value: anywhere };
        }
    }
    // Último recurso: la búsqueda cruda de la GTK.
    const at = firstOccurrence(text, clean);
    return { key, value: at === -1 ? null : { from: at, to: at + clean.length } };
}

/**
 * Rango al que salta el click en una fila (`highlight_and_scroll_to_item`):
 * el valor si se encontró, si no la clave.
 */
export function jumpTarget(text: string, path: string, value: string | null): TextRange | null {
    const { key, value: found } = locateItem(text, path, value);
    return found ?? key;
}

/**
 * Destinos del salto en los dos editores, con la regla de la GTK: cada lado
 * busca su propio valor; si ninguno tiene valor, los dos buscan la clave.
 * Un lado sin valor (un añadido en el izquierdo) no se mueve.
 */
export function itemJumpTargets(
    item: { path: string; left: string | null; right: string | null },
    leftText: string,
    rightText: string,
): { left: TextRange | null; right: TextRange | null } {
    const keyOnly = item.left === null && item.right === null;
    return {
        left: item.left !== null || keyOnly ? jumpTarget(leftText, item.path, item.left) : null,
        right: item.right !== null || keyOnly ? jumpTarget(rightText, item.path, item.right) : null,
    };
}

/* --------------------------------------------------------------------------
   Motor de diff de DEMOSTRACIÓN.
   En RustDiff real, el resultado vendrá del backend en Rust (Tauri command).
   Lo importante para la UI son los tipos `DiffEntry` y `DocLine`: si el
   backend devuelve esa forma, todos los componentes funcionan igual.
   -------------------------------------------------------------------------- */

export type DiffKind = "added" | "removed" | "changed"

export interface DiffEntry {
  id: string
  kind: DiffKind
  path: string
  left?: string // valor serializado (JSON) en el documento izquierdo
  right?: string // valor serializado (JSON) en el documento derecho
  leftLines?: [number, number] // rango de líneas 1-based
  rightLines?: [number, number]
}

export interface DocLine {
  n: number
  text: string
  status?: DiffKind
  entryId?: string
  /** rango de caracteres a enfatizar dentro de la línea [inicio, fin) */
  emphasis?: [number, number]
}

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

interface Layout {
  lines: string[]
  ranges: Map<string, [number, number]>
  valueCol: Map<string, number>
}

const isObj = (v: Json): v is { [k: string]: Json } =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const childPath = (base: string, key: string | number) =>
  typeof key === "number"
    ? `${base}[${key}]`
    : /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${base}.${key}`
      : `${base}[${JSON.stringify(key)}]`

function layout(root: Json): Layout {
  const lines: string[] = []
  const ranges = new Map<string, [number, number]>()
  const valueCol = new Map<string, number>()

  const emit = (v: Json, path: string, indent: string, prefix: string, comma: boolean) => {
    const start = lines.length + 1
    const c = comma ? "," : ""
    if (Array.isArray(v) || isObj(v)) {
      const [o, cl] = Array.isArray(v) ? ["[", "]"] : ["{", "}"]
      const entries: [string | number, Json][] = Array.isArray(v)
        ? v.map((x, i) => [i, x])
        : Object.entries(v)
      if (entries.length === 0) {
        lines.push(`${indent}${prefix}${o}${cl}${c}`)
      } else {
        lines.push(`${indent}${prefix}${o}`)
        entries.forEach(([k, child], i) => {
          const p = typeof k === "number" ? "" : `${JSON.stringify(k)}: `
          emit(child, childPath(path, k), indent + "  ", p, i < entries.length - 1)
        })
        lines.push(`${indent}${cl}${c}`)
      }
    } else {
      valueCol.set(path, (indent + prefix).length)
      lines.push(`${indent}${prefix}${JSON.stringify(v)}${c}`)
    }
    ranges.set(path, [start, lines.length])
  }

  emit(root, "$", "", "", false)
  return { lines, ranges, valueCol }
}

export interface DiffOptions {
  /** arreglos con los mismos elementos en otro orden se consideran iguales */
  ignoreArrayOrder?: boolean
  /** cadenas que solo difieren en espacios (bordes o repetidos) se consideran iguales */
  ignoreWhitespace?: boolean
}

const canon = (v: Json): string =>
  Array.isArray(v)
    ? `[${v.map(canon).sort().join(",")}]`
    : isObj(v)
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v)

function structuralDiff(a: Json, b: Json, path: string, out: Omit<DiffEntry, "id">[], opts: DiffOptions = {}) {
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a))
      if (!(k in b)) out.push({ kind: "removed", path: childPath(path, k), left: JSON.stringify(a[k]) })
    for (const k of Object.keys(b))
      if (!(k in a)) out.push({ kind: "added", path: childPath(path, k), right: JSON.stringify(b[k]) })
    for (const k of Object.keys(a)) if (k in b) structuralDiff(a[k], b[k], childPath(path, k), out, opts)
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (opts.ignoreArrayOrder && a.length === b.length && canon(a) === canon(b)) return
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      if (i >= b.length) out.push({ kind: "removed", path: childPath(path, i), left: JSON.stringify(a[i]) })
      else if (i >= a.length) out.push({ kind: "added", path: childPath(path, i), right: JSON.stringify(b[i]) })
      else structuralDiff(a[i], b[i], childPath(path, i), out, opts)
    }
    return
  }
  if (opts.ignoreWhitespace && typeof a === "string" && typeof b === "string") {
    const norm = (x: string) => x.trim().replace(/\s+/g, " ")
    if (norm(a) === norm(b)) return
  }
  if (JSON.stringify(a) !== JSON.stringify(b))
    out.push({ kind: "changed", path, left: JSON.stringify(a), right: JSON.stringify(b) })
}

/** Rango [inicio, fin) de la parte distinta entre dos cadenas (prefijo/sufijo común). */
export function changedSpan(a: string, b: string): { a: [number, number]; b: [number, number] } {
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  return { a: [p, a.length - s], b: [p, b.length - s] }
}

export interface DiffResult {
  entries: DiffEntry[]
  left: DocLine[]
  right: DocLine[]
}

export function computeDiff(leftDoc: Json, rightDoc: Json, opts: DiffOptions = {}): DiffResult {
  const L = layout(leftDoc)
  const R = layout(rightDoc)
  const raw: Omit<DiffEntry, "id">[] = []
  structuralDiff(leftDoc, rightDoc, "$", raw, opts)

  const left: DocLine[] = L.lines.map((text, i) => ({ n: i + 1, text }))
  const right: DocLine[] = R.lines.map((text, i) => ({ n: i + 1, text }))

  const entries: DiffEntry[] = raw
    .map((e) => ({
      ...e,
      leftLines: e.kind !== "added" ? L.ranges.get(e.path) : undefined,
      rightLines: e.kind !== "removed" ? R.ranges.get(e.path) : undefined,
    }))
    .sort((x, y) => (x.leftLines?.[0] ?? x.rightLines![0]) - (y.leftLines?.[0] ?? y.rightLines![0]))
    .map((e, i) => ({ ...e, id: `d${i + 1}` }))

  const mark = (doc: DocLine[], range: [number, number] | undefined, e: DiffEntry) => {
    if (!range) return
    for (let n = range[0]; n <= range[1]; n++) Object.assign(doc[n - 1], { status: e.kind, entryId: e.id })
  }

  for (const e of entries) {
    mark(left, e.leftLines, e)
    mark(right, e.rightLines, e)
    if (e.kind === "changed" && e.left && e.right && e.leftLines?.[0] === e.leftLines?.[1]) {
      const span = changedSpan(e.left, e.right)
      const lc = L.valueCol.get(e.path)
      const rc = R.valueCol.get(e.path)
      if (lc !== undefined) left[e.leftLines![0] - 1].emphasis = [lc + span.a[0], lc + span.a[1]]
      if (rc !== undefined) right[e.rightLines![0] - 1].emphasis = [rc + span.b[0], rc + span.b[1]]
    }
  }

  return { entries, left, right }
}

/* ------------------------------------------------------------ Lectura -- */

export type ParseResult =
  | { ok: true; data: Json }
  | { ok: false; message: string; line: number; column: number }

/** Interpreta un JSON y, si falla, ubica línea y columna del error. */
export function parseDocument(text: string): ParseResult {
  try {
    return { ok: true, data: JSON.parse(text) as Json }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    let line = 1
    let column = 1
    const lc = /line (\d+) column (\d+)/.exec(msg)
    const pos = /position (\d+)/.exec(msg)
    if (lc) {
      line = +lc[1]
      column = +lc[2]
    } else if (pos) {
      const before = text.slice(0, +pos[1])
      line = before.split("\n").length
      column = +pos[1] - before.lastIndexOf("\n")
    } else {
      line = text.split("\n").length
    }
    return { ok: false, message: describeJsonError(msg), line, column }
  }
}

/** Traduce los mensajes más comunes del parser a lenguaje claro. */
function describeJsonError(msg: string): string {
  const m = msg.replace(/\s*\(line \d+ column \d+\)/, "").replace(/ in JSON at position \d+/, "")
  const rules: [RegExp, string | ((r: RegExpExecArray) => string)][] = [
    [/Expected ',' or '}' after property value/, "falta una coma o una llave de cierre después del valor"],
    [/Expected ',' or '\]' after array element/, "falta una coma o un corchete de cierre después del elemento"],
    [/Expected property name or '}'/, "se esperaba el nombre de una propiedad entre comillas dobles"],
    [/Expected double-quoted property name/, "los nombres de propiedad van entre comillas dobles"],
    [/Expected ':' after property name/, "faltan los dos puntos después del nombre de la propiedad"],
    [/Unterminated string/, "hay una cadena sin cerrar"],
    [/Bad control character/, "hay un carácter de control dentro de una cadena"],
    [/Unexpected end of JSON input|Unexpected end/, "el documento termina antes de tiempo"],
    [/Unexpected non-whitespace character after JSON/, "hay contenido después del final del JSON"],
    [/Unexpected token '?(.)'?/, (r) => `carácter inesperado «${r[1]}»`],
  ]
  for (const [re, out] of rules) {
    const r = re.exec(m)
    if (r) return typeof out === "string" ? out : out(r)
  }
  return m
}

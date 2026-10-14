/*
 * Color puro para el sistema de diseño: OKLCH → sRGB, composición con alpha y
 * contraste WCAG 2.x. Sin DOM ni dependencias.
 *
 * Lo usan dos consumidores:
 *   - el test de contraste (`styles/tokens.test.ts`), que lee `tokens.css` y
 *     verifica AA sobre los valores reales de los tokens;
 *   - la paleta del canvas de grafo (`lib/graph-view.ts`), que convierte los
 *     tokens `--graph-*` (OKLCH) a hex antes de dárselos al contexto 2D.
 */

/** Color sRGB codificado (0..1 por canal) con alpha (0..1). */
export type Rgba = { r: number; g: number; b: number; a: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** sRGB lineal → codificado (curva de transferencia sRGB). */
function encode(linear: number): number {
    const c = clamp01(linear);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB codificado → lineal. */
function decode(encoded: number): number {
    return encoded <= 0.04045 ? encoded / 12.92 : Math.pow((encoded + 0.055) / 1.055, 2.4);
}

/**
 * OKLCH → sRGB codificado (Björn Ottosson, OKLab). Los colores fuera de gamut
 * se recortan por canal, igual que hace el navegador al pintar en sRGB.
 */
export function oklchToRgb(l: number, c: number, h: number, alpha = 1): Rgba {
    const [r, g, b] = oklchToLinear(l, c, h);
    return { r: encode(r), g: encode(g), b: encode(b), a: clamp01(alpha) };
}

/** OKLCH → sRGB lineal sin recortar (puede salirse de 0..1). */
function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
    const hr = (h * Math.PI) / 180;
    const a = c * Math.cos(hr);
    const b = c * Math.sin(hr);

    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.291485548 * b;
    const L = l_ * l_ * l_;
    const M = m_ * m_ * m_;
    const S = s_ * s_ * s_;

    return [
        4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
        -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
        -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    ];
}

/**
 * `true` si un color OKLCH (o un `color-mix()` en OKLCH) cae dentro de sRGB,
 * con una tolerancia mínima. Fuera de gamut el navegador (o Lightning CSS al
 * compilar) hace gamut mapping y el color pintado ya no es el que mide el
 * test de contraste. Cualquier otra sintaxis se da por buena.
 */
export function inSrgbGamut(value: string): boolean {
    const color = parseOklch(value);
    if (!color) {
        return true;
    }
    const channels = oklchToLinear(color.l, color.c, color.h ?? 0);
    return channels.every((v) => v >= -0.002 && v <= 1.002);
}

const number = (raw: string, percentScale: number): number =>
    raw.endsWith("%") ? (parseFloat(raw) / 100) * percentScale : parseFloat(raw);

/** Color en OKLCH; `h` es `null` cuando el tono no existe (`transparent`). */
export type Oklch = { l: number; c: number; h: number | null; a: number };

/** Separa por comas de primer nivel (las de dentro de paréntesis no cuentan). */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "(") {
            depth++;
        } else if (ch === ")") {
            depth--;
        } else if (ch === "," && depth === 0) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(text.slice(start).trim());
    return parts;
}

/** `<color> [p%]` de un argumento de `color-mix()`. */
function mixStop(text: string): { color: Oklch; weight: number | null } | null {
    const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(text.trim());
    if (!m) {
        return null;
    }
    const color = parseOklch(m[1]);
    return color ? { color, weight: m[2] === undefined ? null : parseFloat(m[2]) / 100 } : null;
}

/**
 * `color-mix(in oklch, A [p%], B [q%])` según CSS Color 5: interpolación con
 * alpha premultiplicado y tono por el arco corto; un color sin tono
 * (`transparent`) toma el del otro. Es la forma en que los tokens derivan
 * tintes (`color-mix(in oklch, var(--diff-added) 10%, transparent)`).
 */
function mixOklch(text: string): Oklch | null {
    const inner = /^color-mix\((.*)\)$/.exec(text);
    if (!inner) {
        return null;
    }
    const [space, first, second, ...rest] = splitTopLevel(inner[1]);
    if (space !== "in oklch" || !first || !second || rest.length > 0) {
        return null;
    }
    const a = mixStop(first);
    const b = mixStop(second);
    if (!a || !b) {
        return null;
    }
    let pa = a.weight ?? (b.weight === null ? 0.5 : 1 - b.weight);
    let pb = b.weight ?? 1 - pa;
    const sum = pa + pb;
    if (!(sum > 0)) {
        return null;
    }
    // Si los pesos suman menos de 100% el alpha resultante se escala.
    const alphaScale = Math.min(1, sum);
    pa /= sum;
    pb /= sum;

    const alpha = a.color.a * pa + b.color.a * pb;
    if (alpha === 0) {
        return { l: 0, c: 0, h: null, a: 0 };
    }
    const premul = (x: number, y: number) => (x * a.color.a * pa + y * b.color.a * pb) / alpha;
    let h: number | null;
    if (a.color.h === null || b.color.h === null) {
        h = a.color.h ?? b.color.h;
    } else {
        let delta = b.color.h - a.color.h;
        if (delta > 180) {
            delta -= 360;
        } else if (delta < -180) {
            delta += 360;
        }
        h = (((a.color.h + delta * pb) % 360) + 360) % 360;
    }
    return {
        l: premul(a.color.l, b.color.l),
        c: premul(a.color.c, b.color.c),
        h,
        a: alpha * alphaScale,
    };
}

/** `oklch(...)`, `transparent` o `color-mix(in oklch, ...)` → OKLCH. */
export function parseOklch(value: string): Oklch | null {
    const text = value.trim().toLowerCase();
    if (text === "transparent") {
        return { l: 0, c: 0, h: null, a: 0 };
    }
    const oklch = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(text);
    if (oklch) {
        const [, l, c, h, alpha] = oklch;
        return {
            l: number(l, 1),
            c: parseFloat(c),
            h: parseFloat(h),
            a: alpha === undefined ? 1 : clamp01(number(alpha, 1)),
        };
    }
    return mixOklch(text);
}

/**
 * Interpreta `oklch(L C H)`, `oklch(L C H / A)` (L y A también en %),
 * `transparent`, `color-mix(in oklch, …)` y `#rgb` / `#rrggbb`. Devuelve
 * `null` con cualquier otra cosa.
 */
export function parseColor(value: string): Rgba | null {
    const text = value.trim().toLowerCase();
    const oklch = parseOklch(text);
    if (oklch) {
        return oklchToRgb(oklch.l, oklch.c, oklch.h ?? 0, oklch.a);
    }
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/.exec(text);
    if (hex) {
        const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
        return {
            r: parseInt(digits.slice(0, 2), 16) / 255,
            g: parseInt(digits.slice(2, 4), 16) / 255,
            b: parseInt(digits.slice(4, 6), 16) / 255,
            a: 1,
        };
    }
    return null;
}

/** `#rrggbb` (sin alpha) de un color codificado. */
export function toHex(color: Rgba): string {
    const channel = (v: number) =>
        Math.round(clamp01(v) * 255)
            .toString(16)
            .padStart(2, "0");
    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** Convierte un valor CSS a hex si es OKLCH (o `color-mix` en OKLCH) opaco; si no, lo devuelve igual. */
export function cssColorToHex(value: string): string {
    const lower = value.trim().toLowerCase();
    if (!lower.startsWith("oklch(") && !lower.startsWith("color-mix(")) {
        return value;
    }
    const parsed = parseColor(value);
    return parsed && parsed.a === 1 ? toHex(parsed) : value;
}

/** `top` sobre `bottom` (source-over en sRGB codificado, como el navegador). */
export function composite(top: Rgba, bottom: Rgba): Rgba {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
    return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

/** Luminancia relativa WCAG 2.x. */
export function relativeLuminance(color: Rgba): number {
    return 0.2126 * decode(color.r) + 0.7152 * decode(color.g) + 0.0722 * decode(color.b);
}

/** Razón de contraste WCAG 2.x (1..21). Ambos colores deben ser opacos. */
export function contrastRatio(a: Rgba, b: Rgba): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Umbrales WCAG AA. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

// ─────────────────────────────────────────────
// Lectura de `tokens.css`
// ─────────────────────────────────────────────

export type TokenSet = Record<string, string>;
export type ThemeTokens = { light: TokenSet; dark: TokenSet };

/** Declaraciones `--x: valor;` de todos los bloques cuyo selector cumple `match`. */
function declarations(css: string, match: (selector: string) => boolean): TokenSet {
    const out: TokenSet = {};
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const block = /([^{}]+)\{([^{}]*)\}/g;
    for (let m = block.exec(withoutComments); m; m = block.exec(withoutComments)) {
        if (!match(m[1].trim())) {
            continue;
        }
        const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
        for (let d = decl.exec(m[2]); d; d = decl.exec(m[2])) {
            out[d[1]] = d[2].trim().replace(/\s+/g, " ");
        }
    }
    return out;
}

/**
 * Tokens de los dos temas: `:root` es el claro; `.dark` hereda de `:root` y
 * sobreescribe. `var(--x)` se resuelve dentro del mismo tema.
 */
export function parseThemeTokens(css: string): ThemeTokens {
    const light = declarations(css, (s) => s === ":root");
    const dark = { ...light, ...declarations(css, (s) => s === ".dark") };
    return { light: resolveVars(light), dark: resolveVars(dark) };
}

function resolveVars(tokens: TokenSet): TokenSet {
    const out: TokenSet = {};
    const resolve = (value: string, depth: number): string =>
        depth > 8 ? value : value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(tokens[name] ?? "", depth + 1));
    for (const [name, value] of Object.entries(tokens)) {
        out[name] = resolve(value, 0);
    }
    return out;
}

/**
 * Contraste de `fg` sobre `bg`, componiendo primero las capas con alpha:
 * `bg` (y las `under`) sobre el fondo opaco `base`.
 */
export function tokenContrast(tokens: TokenSet, fg: string, bg: string, ...under: string[]): number {
    const read = (name: string): Rgba => {
        const parsed = parseColor(tokens[name] ?? "");
        if (!parsed) {
            throw new Error(`token ${name} sin color válido: ${tokens[name]}`);
        }
        return parsed;
    };
    // La capa más baja tiene que ser opaca: es el fondo real.
    const layers = [bg, ...under].map(read).reverse();
    let surface = layers[0];
    if (surface.a < 1) {
        throw new Error(`la capa base de ${bg} no es opaca`);
    }
    for (const layer of layers.slice(1)) {
        surface = composite(layer, surface);
    }
    return contrastRatio(composite(read(fg), surface), surface);
}

/*
 * Contraste WCAG AA calculado sobre los valores reales de `tokens.css`, en
 * los dos temas. Si alguien cambia un token y rompe AA, este test falla.
 *
 * `PRINT_CONTRAST=1 pnpm test tokens` imprime la tabla completa (es la que se
 * copia a `docs/design-system.md`).
 */

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTRAST_PAIRS } from "@/styles/contrast-pairs";
import { cssColorToHex, inSrgbGamut, parseColor, parseThemeTokens, tokenContrast } from "@/lib/color";
import { DARK_PALETTE, LIGHT_PALETTE, MONO_FONT_FAMILY, PALETTE_VARIABLES } from "@/lib/graph-view";

// Se lee del disco: Vitest no procesa CSS, y el archivo es la fuente de verdad.
const themes = parseThemeTokens(readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8"));

const SHADCN_TOKENS = [
    "--background",
    "--foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--popover-foreground",
    "--primary",
    "--primary-foreground",
    "--secondary",
    "--secondary-foreground",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--accent-foreground",
    "--destructive",
    "--destructive-foreground",
    "--border",
    "--input",
    "--ring",
];

describe("tokens.css", () => {
    it("define el set de shadcn/ui y los de diff en OKLCH, en los dos temas", () => {
        const diff = ["added", "removed", "changed"].flatMap((kind) =>
            ["", "-line", "-inline", "-row"].map((suffix) => `--diff-${kind}${suffix}`),
        );
        for (const [name, tokens] of Object.entries(themes)) {
            for (const token of [...SHADCN_TOKENS, ...diff, ...Object.values(PALETTE_VARIABLES)]) {
                expect(tokens[token], `${name} ${token}`).toMatch(/^oklch\(/);
                expect(parseColor(tokens[token]), `${name} ${token}`).not.toBeNull();
            }
        }
        expect(themes.light["--radius"]).toBe("0.5rem");
    });

    it("todos los colores caen dentro de sRGB (lo medido es lo que se pinta)", () => {
        const outOfGamut = Object.entries(themes).flatMap(([theme, tokens]) =>
            Object.entries(tokens)
                .filter(([, value]) => !inSrgbGamut(value))
                .map(([name, value]) => `${theme} ${name}: ${value}`),
        );
        expect(outOfGamut).toEqual([]);
    });

    for (const theme of ["light", "dark"] as const) {
        it(`cumple WCAG AA en el tema ${theme}`, () => {
            const rows = CONTRAST_PAIRS.map((pair) => ({
                ...pair,
                ratio: tokenContrast(themes[theme], pair.fg, pair.bg, ...(pair.under ?? [])),
            }));
            if (process.env.PRINT_CONTRAST) {
                console.log(
                    `\n${theme}\n` +
                        rows.map((r) => `${r.ratio.toFixed(2).padStart(6)}  ${r.fg} on ${r.bg}  (${r.note})`).join("\n"),
                );
            }
            const failing = rows
                .filter((r) => r.ratio < r.min)
                .map((r) => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min} (${r.note})`);
            expect(failing).toEqual([]);
        });
    }

    it("la paleta de respaldo del grafo es la conversión exacta de los tokens", () => {
        for (const [palette, tokens] of [
            [LIGHT_PALETTE, themes.light],
            [DARK_PALETTE, themes.dark],
        ] as const) {
            for (const [key, variable] of Object.entries(PALETTE_VARIABLES)) {
                expect(palette[key as keyof typeof palette], variable).toBe(cssColorToHex(tokens[variable]));
            }
        }
    });

    it("el canvas usa la misma pila monoespaciada que los editores", () => {
        expect(themes.light["--font-family-mono"]).toBe(MONO_FONT_FAMILY);
    });
});

/*
 * Color puro: OKLCH, `color-mix(in oklch, …)` como lo derivan los tokens, y
 * el contraste compuesto que usa `tokens.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { contrastRatio, cssColorToHex, inSrgbGamut, parseColor, parseOklch, parseThemeTokens, tokenContrast } from "@/lib/color";

describe("lib/color", () => {
    it("mezclar con transparent conserva el color y escala el alpha", () => {
        const mixed = parseOklch("color-mix(in oklch, oklch(0.63 0.15 155) 10%, transparent)");
        expect(mixed).not.toBeNull();
        expect(mixed!.l).toBeCloseTo(0.63, 6);
        expect(mixed!.c).toBeCloseTo(0.15, 6);
        expect(mixed!.h).toBeCloseTo(155, 6);
        expect(mixed!.a).toBeCloseTo(0.1, 6);
    });

    it("el peso que falta es el complemento, y sin pesos es 50/50", () => {
        const half = parseOklch("color-mix(in oklch, oklch(0.2 0 0), oklch(0.8 0 0))");
        expect(half!.l).toBeCloseTo(0.5, 6);
        expect(half!.a).toBe(1);
        const quarter = parseOklch("color-mix(in oklch, oklch(0.2 0 0), oklch(0.6 0 0) 25%)");
        expect(quarter!.l).toBeCloseTo(0.3, 6);
    });

    it("el tono se interpola por el arco corto", () => {
        const mixed = parseOklch("color-mix(in oklch, oklch(0.5 0.1 350) 50%, oklch(0.5 0.1 30))");
        expect(mixed!.h).toBeCloseTo(10, 6);
    });

    it("interpreta transparent, rechaza otros espacios y sintaxis desconocidas", () => {
        expect(parseColor("transparent")?.a).toBe(0);
        expect(parseColor("color-mix(in srgb, red 10%, transparent)")).toBeNull();
        expect(parseColor("var(--x)")).toBeNull();
        expect(parseColor("rgb(0 0 0)")).toBeNull();
    });

    it("un color-mix opaco se convierte a hex; uno translúcido no", () => {
        expect(cssColorToHex("color-mix(in oklch, oklch(1 0 0) 100%, transparent)")).toBe("#ffffff");
        const translucent = "color-mix(in oklch, oklch(1 0 0) 50%, transparent)";
        expect(cssColorToHex(translucent)).toBe(translucent);
    });

    it("el gamut de un color-mix se mide sobre el color resultante", () => {
        expect(inSrgbGamut("color-mix(in oklch, oklch(0.63 0.15 155) 10%, transparent)")).toBe(true);
        expect(inSrgbGamut("oklch(0.5 0.3 195)")).toBe(false);
    });

    it("resuelve var() dentro de color-mix y compone las capas al medir contraste", () => {
        const { light } = parseThemeTokens(`
            :root {
                --bg: oklch(1 0 0);
                --fg: oklch(0 0 0);
                --tint: color-mix(in oklch, var(--fg) 50%, transparent);
            }
        `);
        expect(light["--tint"]).toBe("color-mix(in oklch, oklch(0 0 0) 50%, transparent)");
        const black = parseColor("oklch(0 0 0)")!;
        const white = parseColor("oklch(1 0 0)")!;
        expect(tokenContrast(light, "--fg", "--bg")).toBeCloseTo(contrastRatio(black, white), 6);
        // Negro sobre gris medio: menos contraste que sobre blanco.
        expect(tokenContrast(light, "--fg", "--tint", "--bg")).toBeLessThan(tokenContrast(light, "--fg", "--bg"));
    });
});

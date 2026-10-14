/*
 * `cn` resuelve conflictos con tailwind-merge, que no conoce la escala
 * tipográfica propia (`text-caption`, `text-body`, ...): sin configurarla la
 * tomaba por un color y descartaba el color de texto de la misma lista. El
 * tooltip perdía `text-background` y quedaba como una caja oscura vacía (texto
 * `foreground` sobre fondo `foreground`) en la cabecera del historial.
 */

import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

const SCALE = ["caption", "body", "code", "title", "display"];

describe("cn con la escala tipográfica propia", () => {
    it.each(SCALE)("text-%s no descarta el color de texto", (step) => {
        const classes = cn("bg-foreground text-background", `text-${step}`).split(" ");
        expect(classes).toContain("text-background");
        expect(classes).toContain(`text-${step}`);
    });

    it("un color posterior no descarta el tamaño (variantes de Button)", () => {
        const classes = cn("text-body font-medium", "bg-primary text-primary-foreground").split(" ");
        expect(classes).toEqual(expect.arrayContaining(["text-body", "text-primary-foreground"]));
    });

    it("dos tamaños de la escala siguen en conflicto: gana el último", () => {
        expect(cn("text-body", "text-caption")).toBe("text-caption");
        expect(cn("text-body", "text-caption/5")).toBe("text-caption/5");
    });

    it("dos colores siguen en conflicto: gana el último", () => {
        expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground");
    });
});

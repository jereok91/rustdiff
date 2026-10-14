/*
 * Regresión: el tooltip de un IconButton (Borrar historial / Cerrar, en la
 * cabecera del historial) se pintaba como una caja oscura sin texto porque
 * `cn` descartaba `text-background` al ver `text-caption`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IconButton } from "@/components/ui/icon-button";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(cleanup);

describe("TooltipContent", () => {
    it("lleva texto de color contrastado con su fondo", async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <IconButton label="Clear history">
                    <svg />
                </IconButton>
            </TooltipProvider>,
        );
        const button = screen.getByRole("button", { name: "Clear history" });
        fireEvent.focus(button);
        await screen.findByRole("tooltip");
        const content = document.querySelector<HTMLElement>("[data-slot=tooltip-content]");
        if (!content) throw new Error("sin tooltip-content");
        const classes = content.className.split(" ");
        expect(classes).toContain("bg-foreground");
        expect(classes).toContain("text-background");
        expect(classes).toContain("text-caption");
        expect(content.textContent).toContain("Clear history");
    });
});

/*
 * El `Kbd` del botón primario se estila por `data-button-variant`. Dentro de
 * un `TooltipTrigger asChild` el trigger pisa `data-slot="button"` (por eso el
 * atajo de Comparar salía con el relleno oscuro de `bg-muted`): el atributo
 * propio tiene que sobrevivir.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

afterEach(cleanup);

describe("Button dentro de un tooltip", () => {
    it("conserva data-button-variant aunque el trigger pise data-slot", () => {
        render(
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button>
                            Compare <Kbd>Ctrl</Kbd>
                        </Button>
                    </TooltipTrigger>
                </Tooltip>
            </TooltipProvider>,
        );
        const button = screen.getByRole("button");
        expect(button.getAttribute("data-slot")).toBe("tooltip-trigger");
        expect(button.getAttribute("data-button-variant")).toBe("default");
        // El Kbd lleva la variante que apunta a ese atributo.
        expect(screen.getByText("Ctrl").className).toContain("[[data-button-variant=default]_&]:bg-transparent");
    });
});

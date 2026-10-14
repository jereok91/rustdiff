import * as React from "react";

import { cn } from "@/lib/utils";

/** Tecla de un atajo (botón Comparar, tooltips, diálogo de atajos). */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                "bg-muted text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-caption font-medium select-none",
                "[&_svg:not([class*='size-'])]:size-3",
                "[[data-slot=tooltip-content]_&]:border-background/40 [[data-slot=tooltip-content]_&]:text-background [[data-slot=tooltip-content]_&]:border [[data-slot=tooltip-content]_&]:bg-transparent",
                // En el botón primario el texto va directo sobre `--primary` (el par medido):
                // un relleno translúcido bajaría el contraste por debajo de AA (un 10 % de
                // `--primary-foreground` ya deja el tema claro en 4.36:1). Se ancla a
                // `data-button-variant` y no a `data-slot`: dentro de un tooltip el
                // trigger pisa `data-slot="button"` y el selector no aplicaba.
                "[[data-button-variant=default]_&]:border-primary-foreground/40 [[data-button-variant=default]_&]:text-primary-foreground [[data-button-variant=default]_&]:border [[data-button-variant=default]_&]:bg-transparent",
                className,
            )}
            {...props}
        />
    );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
    return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup };

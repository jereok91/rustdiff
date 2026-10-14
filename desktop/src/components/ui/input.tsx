/*
 * Campo de texto de la app (búsquedas del editor, del historial y del grafo).
 * Alto `--control-height`, borde `--input` (>= 3:1) y el anillo de foco común.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn(
                "border-input bg-background text-foreground placeholder:text-muted-foreground focus-ring h-(--control-height) w-full min-w-0 rounded-md border px-2 text-body shadow-xs transition-colors",
                "[&::-webkit-search-cancel-button]:cursor-pointer",
                className,
            )}
            {...props}
        />
    );
}

export { Input };

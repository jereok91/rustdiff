import * as React from "react";

import { cn } from "@/lib/utils";

/** Tecla de un atajo (diálogo de atajos, ayuda). */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                "bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-caption",
                className,
            )}
            {...props}
        />
    );
}

export { Kbd };

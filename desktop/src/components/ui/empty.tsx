/* Estado vacío (shadcn/ui `Empty`): icono, título y descripción centrados. */

import * as React from "react";

import { cn } from "@/lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="empty"
            className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-balance",
                className,
            )}
            {...props}
        />
    );
}

function EmptyMedia({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="empty-icon"
            aria-hidden
            className={cn(
                "bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-5",
                className,
            )}
            {...props}
        />
    );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="empty-title" className={cn("text-body font-medium tracking-tight", className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
    return (
        <p
            data-slot="empty-description"
            className={cn("text-muted-foreground max-w-sm text-caption/5", className)}
            {...props}
        />
    );
}

export { Empty, EmptyDescription, EmptyMedia, EmptyTitle };

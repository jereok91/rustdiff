/*
 * Insignia (shadcn/ui) con las variantes de diff del prototipo: fondo del
 * tipo al 12–14% (`--diff-*-row`) y texto legible del tipo
 * (`--diff-*-foreground`), siempre con icono o palabra.
 */

import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-caption font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground border-transparent",
                secondary: "bg-secondary text-secondary-foreground border-transparent",
                outline: "text-foreground",
                added: "border-diff-added/25 bg-(--diff-added-row) text-diff-added-foreground",
                removed: "border-diff-removed/25 bg-(--diff-removed-row) text-diff-removed-foreground",
                changed: "border-diff-changed/30 bg-(--diff-changed-row) text-diff-changed-foreground",
            },
        },
        defaultVariants: { variant: "default" },
    },
);

function Badge({
    className,
    variant,
    asChild = false,
    ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot.Root : "span";
    return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

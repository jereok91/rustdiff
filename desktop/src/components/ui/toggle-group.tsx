/*
 * Grupo de toggles (shadcn/ui). La app lo usa como control segmentado del
 * prototipo (`segmentedGroup` / `segmentedItem`): fondo `muted`, el elemento
 * activo sube a la superficie con una sombra mínima.
 */

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { type VariantProps } from "class-variance-authority";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
    size: "default",
    variant: "default",
});

function ToggleGroup({
    className,
    variant,
    size,
    children,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants>) {
    return (
        <ToggleGroupPrimitive.Root
            data-slot="toggle-group"
            data-variant={variant}
            data-size={size}
            className={cn("group/toggle-group flex w-fit items-center rounded-md", className)}
            {...props}
        >
            <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
        </ToggleGroupPrimitive.Root>
    );
}

function ToggleGroupItem({
    className,
    children,
    variant,
    size,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
    const context = React.useContext(ToggleGroupContext);
    return (
        <ToggleGroupPrimitive.Item
            data-slot="toggle-group-item"
            data-variant={context.variant || variant}
            data-size={context.size || size}
            className={cn(
                toggleVariants({ variant: context.variant || variant, size: context.size || size }),
                "min-w-0 shrink-0 shadow-none focus-visible:z-10",
                className,
            )}
            {...props}
        >
            {children}
        </ToggleGroupPrimitive.Item>
    );
}

/** Clases del control segmentado del prototipo (cabecera y filtros del panel). */
const segmentedGroup = "bg-muted gap-0.5 rounded-lg p-0.5";
const segmentedItem =
    "text-muted-foreground hover:text-foreground hover:bg-transparent data-[state=on]:bg-card data-[state=on]:text-foreground h-7 gap-1.5 rounded-md px-2.5 text-caption data-[state=on]:shadow-xs";

export { segmentedGroup, segmentedItem, ToggleGroup, ToggleGroupItem };

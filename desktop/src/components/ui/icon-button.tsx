/*
 * Botón de solo icono con nombre accesible y tooltip obligatorios (el
 * `set_icon_button_label` + `set_tooltip_text` de la GTK).
 *
 * `label` es a la vez el `aria-label` y el texto del tooltip; `tooltip`
 * permite un texto más largo (con el atajo, por ejemplo). Deshabilitado, el
 * tooltip sigue funcionando porque el disparador es un `span` envolvente.
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type IconButtonProps = Omit<React.ComponentProps<typeof Button>, "size" | "aria-label" | "children"> & {
    label: string;
    tooltip?: string;
    children: React.ReactNode;
};

function IconButton({ label, tooltip, variant = "ghost", disabled, children, ...props }: IconButtonProps) {
    const button = (
        <Button variant={variant} size="icon-sm" aria-label={label} disabled={disabled} {...props}>
            {children}
        </Button>
    );
    return (
        <Tooltip>
            <TooltipTrigger asChild>{disabled ? <span className="inline-flex">{button}</span> : button}</TooltipTrigger>
            <TooltipContent>{tooltip ?? label}</TooltipContent>
        </Tooltip>
    );
}

export { IconButton };

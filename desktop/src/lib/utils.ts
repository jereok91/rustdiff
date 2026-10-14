import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge solo conoce la escala de tamaños de Tailwind (`text-sm`,
 * `text-lg`...). Los pasos propios (`--text-*` en `styles.css`) los tomaba
 * por colores y, en una misma lista, `text-caption` descartaba el color de
 * texto (o al revés): el tooltip perdía `text-background` y quedaba como una
 * caja oscura vacía. Registrarlos como tamaños separa los dos grupos.
 */
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            text: ["caption", "body", "code", "title", "display"],
        },
    },
});

/** Combina clases condicionales y resuelve conflictos de Tailwind (convención shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

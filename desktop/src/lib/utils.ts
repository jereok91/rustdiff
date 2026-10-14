import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina clases condicionales y resuelve conflictos de Tailwind (convención shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

/*
 * Avisos efímeros (el `adw::ToastOverlay` de la GTK), sin dependencias.
 *
 * Un store mínimo fuera de React: cualquier parte de la app llama a `toast()`
 * y `<Toaster />` se suscribe con `useSyncExternalStore`. Los mensajes son
 * `StatusMessage` (clave i18n + parámetros), así que se traducen al pintar.
 */

import type { StatusMessage } from "@/lib/errors";

export type ToastItem = {
    id: number;
    message: StatusMessage;
    variant: "default" | "error";
};

/** Duración por defecto, en milisegundos. */
export const TOAST_DURATION_MS = 4000;
/** Cuántos avisos se apilan como máximo (los más viejos se descartan). */
const MAX_TOASTS = 4;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) {
        listener();
    }
}

export function toast(
    message: StatusMessage,
    options: { variant?: ToastItem["variant"]; duration?: number } = {},
): number {
    const id = nextId++;
    const variant = options.variant ?? (message.error ? "error" : "default");
    items = [...items, { id, message, variant }].slice(-MAX_TOASTS);
    emit();
    const duration = options.duration ?? TOAST_DURATION_MS;
    if (duration > 0) {
        setTimeout(() => dismissToast(id), duration);
    }
    return id;
}

export function dismissToast(id: number): void {
    const before = items.length;
    items = items.filter((item) => item.id !== id);
    if (items.length !== before) {
        emit();
    }
}

export function subscribeToasts(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getToasts(): ToastItem[] {
    return items;
}

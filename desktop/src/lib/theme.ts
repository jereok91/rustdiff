/*
 * Tema claro / oscuro / sistema.
 *
 * `system` (por defecto) sigue `prefers-color-scheme`; `light` y `dark` lo
 * fijan. La elección vive en `localStorage`: las preferencias del backend
 * (`settings.json`) no tienen campo de tema y F7 no toca el backend.
 *
 * Aplicar un esquema = poner o sacar la clase `.dark` en `<html>` (la que
 * usan los tokens y shadcn/ui) y fijar `color-scheme` para que scrollbars y
 * controles nativos del WebView acompañen.
 */

export type ThemeSetting = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

export const THEME_STORAGE_KEY = "rustdiff.theme";
export const THEME_SETTINGS: readonly ThemeSetting[] = ["system", "light", "dark"];
export const DARK_QUERY = "(prefers-color-scheme: dark)";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        // WebView con almacenamiento bloqueado: el tema vale para la sesión.
        return null;
    }
}

export function normalizeThemeSetting(value: string | null | undefined): ThemeSetting {
    return value === "light" || value === "dark" ? value : "system";
}

export function readThemeSetting(storage: StorageLike | null = defaultStorage()): ThemeSetting {
    try {
        return normalizeThemeSetting(storage?.getItem(THEME_STORAGE_KEY));
    } catch {
        return "system";
    }
}

export function writeThemeSetting(setting: ThemeSetting, storage: StorageLike | null = defaultStorage()): void {
    try {
        storage?.setItem(THEME_STORAGE_KEY, setting);
    } catch {
        // Sin almacenamiento escribible el cambio vale para esta sesión.
    }
}

/** `true` si el sistema pide oscuro (sin `matchMedia`, claro). */
export function systemPrefersDark(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(DARK_QUERY).matches
        : false;
}

export function resolveScheme(setting: ThemeSetting, systemDark: boolean): ColorScheme {
    if (setting === "system") {
        return systemDark ? "dark" : "light";
    }
    return setting;
}

export function applyScheme(scheme: ColorScheme, root: HTMLElement | null = globalRoot()): void {
    if (!root) {
        return;
    }
    root.classList.toggle("dark", scheme === "dark");
    root.style.colorScheme = scheme;
}

function globalRoot(): HTMLElement | null {
    return typeof document !== "undefined" ? document.documentElement : null;
}

/** Antes del primer render: aplica el tema guardado sin parpadeo. */
export function applySavedTheme(): ColorScheme {
    const scheme = resolveScheme(readThemeSetting(), systemPrefersDark());
    applyScheme(scheme);
    return scheme;
}

/*
 * Atajos de teclado globales, los mismos que registra la GTK
 * (`connect_keyboard_shortcuts` + accels del menú).
 *
 * Se escuchan en fase de captura sobre `window` para ganarle a los keymaps de
 * CodeMirror (por ejemplo `Mod-Enter` inserta una línea en el editor).
 */

import { useEffect, useRef } from "react";

export type ShortcutAction =
    | "openLeft"
    | "openRight"
    | "compare"
    | "format"
    | "toggleDiffPanel"
    | "showShortcuts"
    | "search"
    | "findNext"
    | "findPrevious"
    | "saveSession"
    | "toggleHistory"
    | "exportTxt"
    | "fontIncrease"
    | "fontDecrease"
    | "fontReset";

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/** Traduce un evento de teclado a una acción; `null` si no es un atajo nuestro. */
export function matchShortcut(event: KeyLike): ShortcutAction | null {
    const mod = event.ctrlKey || event.metaKey;
    // F3 / Shift+F3: siguiente / anterior coincidencia de la búsqueda.
    if (event.key === "F3" && !mod && !event.altKey) {
        return event.shiftKey ? "findPrevious" : "findNext";
    }
    if (!mod || event.altKey) {
        return null;
    }
    const key = event.key.toLowerCase();
    if (key === "o") {
        return event.shiftKey ? "openRight" : "openLeft";
    }
    if (key === "enter" && !event.shiftKey) {
        return "compare";
    }
    if (key === "f") {
        // Ctrl+F es la barra de búsqueda propia (le gana al panel de CodeMirror).
        return event.shiftKey ? "format" : "search";
    }
    if (key === "d" && !event.shiftKey) {
        return "toggleDiffPanel";
    }
    if (key === "s" && !event.shiftKey) {
        return "saveSession";
    }
    if (key === "h" && !event.shiftKey) {
        return "toggleHistory";
    }
    if (key === "e" && !event.shiftKey) {
        return "exportTxt";
    }
    // Escala del texto. `=` cubre teclados donde `+` requiere Shift (igual que
    // los accels `<Control>equal` de la GTK); el teclado numérico también
    // reporta `+`, `-` y `0`.
    if (key === "+" || key === "=") {
        return "fontIncrease";
    }
    if (key === "-" || key === "_") {
        return "fontDecrease";
    }
    if (key === "0" && !event.shiftKey) {
        return "fontReset";
    }
    // Ctrl+? (Shift+/ en la mayoría de los teclados).
    if (key === "?" || (key === "/" && event.shiftKey)) {
        return "showShortcuts";
    }
    return null;
}

export function useShortcuts(handler: (action: ShortcutAction) => void): void {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const action = matchShortcut(event);
            if (action) {
                event.preventDefault();
                event.stopPropagation();
                handlerRef.current(action);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, []);
}

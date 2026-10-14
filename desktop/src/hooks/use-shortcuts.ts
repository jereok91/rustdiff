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
    | "showShortcuts";

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/** Traduce un evento de teclado a una acción; `null` si no es un atajo nuestro. */
export function matchShortcut(event: KeyLike): ShortcutAction | null {
    const mod = event.ctrlKey || event.metaKey;
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
    if (key === "f" && event.shiftKey) {
        return "format";
    }
    if (key === "d" && !event.shiftKey) {
        return "toggleDiffPanel";
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

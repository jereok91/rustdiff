/*
 * Claro/oscuro según `prefers-color-scheme` (provisorio: F7 decide el tema).
 * Sincroniza la clase `.dark` del documento, que es la que usa shadcn/ui.
 */

import { useEffect, useState } from "react";

export type ColorScheme = "light" | "dark";

const QUERY = "(prefers-color-scheme: dark)";

function current(): ColorScheme {
    if (typeof window === "undefined" || !window.matchMedia) {
        return "light";
    }
    return window.matchMedia(QUERY).matches ? "dark" : "light";
}

export function useColorScheme(): ColorScheme {
    const [scheme, setScheme] = useState<ColorScheme>(current);

    useEffect(() => {
        if (!window.matchMedia) {
            return;
        }
        const media = window.matchMedia(QUERY);
        const onChange = () => setScheme(media.matches ? "dark" : "light");
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        document.documentElement.style.colorScheme = scheme;
    }, [scheme]);

    return scheme;
}

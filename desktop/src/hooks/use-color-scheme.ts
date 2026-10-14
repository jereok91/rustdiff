/*
 * Tema activo de la app (ver `lib/theme`): la elección del usuario
 * (sistema / claro / oscuro, persistida en `localStorage`) y el esquema que
 * resulta de ella y de `prefers-color-scheme`.
 *
 * La clase `.dark` se mueve de forma síncrona al elegir (y al cambiar el
 * sistema), antes del re-render: así CodeMirror y el canvas del grafo, que
 * releen sus colores cuando cambia `scheme`, ya ven los tokens nuevos.
 */

import { useCallback, useEffect, useState } from "react";

import {
    applyScheme,
    type ColorScheme,
    DARK_QUERY,
    readThemeSetting,
    resolveScheme,
    systemPrefersDark,
    type ThemeSetting,
    writeThemeSetting,
} from "@/lib/theme";

export type { ColorScheme, ThemeSetting } from "@/lib/theme";

export type Theme = {
    /** Lo que eligió el usuario. */
    setting: ThemeSetting;
    /** El esquema efectivo. */
    scheme: ColorScheme;
    setSetting: (setting: ThemeSetting) => void;
};

export function useTheme(): Theme {
    const [setting, setSettingState] = useState<ThemeSetting>(readThemeSetting);
    const [systemDark, setSystemDark] = useState(systemPrefersDark);
    const scheme = resolveScheme(setting, systemDark);

    useEffect(() => {
        if (typeof window.matchMedia !== "function") {
            return;
        }
        const media = window.matchMedia(DARK_QUERY);
        const onChange = () => setSystemDark(media.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    // Aplicado en el render: los efectos de los hijos (editor, grafo) corren
    // antes que los del padre y tienen que leer ya el tema nuevo.
    applyScheme(scheme);

    const setSetting = useCallback((next: ThemeSetting) => {
        writeThemeSetting(next);
        applyScheme(resolveScheme(next, systemPrefersDark()));
        setSettingState(next);
    }, []);

    return { setting, scheme, setSetting };
}

/** Solo el esquema efectivo. */
export function useColorScheme(): ColorScheme {
    return useTheme().scheme;
}

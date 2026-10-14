/*
 * Preferencias de la UI: idioma y escala del texto (menú principal + atajos
 * Ctrl++ / Ctrl+- / Ctrl+0).
 *
 * Se leen una vez con `settingsGet` y cada cambio se persiste con
 * `settingsSave` mezclado sobre lo último conocido, así cambiar el idioma no
 * pisa la escala y viceversa. El disco lo escribe el backend (S8).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { commands, type Settings } from "@/bindings";
import { applyLanguageSetting } from "@/i18n";
import { toast } from "@/lib/toast";
import {
    applyUiScale,
    clampUiScale,
    nextUiScale,
    type ScaleStep,
    UI_SCALE_DEFAULT,
    uiScalePercent,
} from "@/lib/ui-scale";

export type LanguageSetting = "auto" | "en" | "es";

export function normalizeLanguageSetting(value: string | null | undefined): LanguageSetting {
    return value === "en" || value === "es" ? value : "auto";
}

export type Preferences = {
    language: LanguageSetting;
    uiScale: number;
    setLanguage: (language: LanguageSetting) => Promise<void>;
    stepUiScale: (step: ScaleStep) => Promise<void>;
};

export function usePreferences(): Preferences {
    const [language, setLanguageState] = useState<LanguageSetting>("auto");
    const [uiScale, setUiScaleState] = useState(UI_SCALE_DEFAULT);
    const settings = useRef<Settings>({});
    // Espejo síncrono: varios Ctrl++ seguidos no leen una escala vieja.
    const scaleRef = useRef(UI_SCALE_DEFAULT);

    useEffect(() => {
        let cancelled = false;
        commands
            .settingsGet()
            .then((loaded) => {
                if (cancelled) {
                    return;
                }
                settings.current = loaded;
                setLanguageState(normalizeLanguageSetting(loaded.language));
                const scale = clampUiScale(loaded.ui_scale);
                scaleRef.current = scale;
                setUiScaleState(scale);
                applyUiScale(scale);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const persist = useCallback(async (patch: Settings) => {
        const next = { ...settings.current, ...patch };
        settings.current = next;
        try {
            settings.current = await commands.settingsSave(next);
        } catch {
            // Sin preferencias escribibles el cambio vale para esta sesión.
        }
    }, []);

    const setLanguage = useCallback(
        async (value: LanguageSetting) => {
            setLanguageState(value);
            await applyLanguageSetting(value);
            await persist({ language: value });
            toast({ key: "toast.language_applied" });
        },
        [persist],
    );

    const stepUiScale = useCallback(
        async (step: ScaleStep) => {
            const scale = nextUiScale(scaleRef.current, step);
            scaleRef.current = scale;
            setUiScaleState(scale);
            applyUiScale(scale);
            toast({ key: "toast.font_scale", params: { percent: uiScalePercent(scale) } }, { duration: 2000 });
            await persist({ ui_scale: scale });
        },
        [persist],
    );

    return { language, uiScale, setLanguage, stepUiScale };
}

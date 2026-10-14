/*
 * i18next con las mismas claves planas que `locales/*.yml` (D3).
 *
 * `keySeparator: false` porque las claves son literales con puntos
 * (`"header.open_left"`), no objetos anidados; y la interpolación usa la
 * sintaxis `%{name}` de rust-i18n para que los textos se copien tal cual.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { commands } from "@/bindings";
import { FALLBACK_LANGUAGE, resolveLanguage, systemLanguages } from "@/lib/locale";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

void i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        es: { translation: es },
    },
    lng: resolveLanguage(null, systemLanguages()),
    fallbackLng: FALLBACK_LANGUAGE,
    keySeparator: false,
    nsSeparator: false,
    interpolation: {
        escapeValue: false, // React ya escapa.
        prefix: "%{",
        suffix: "}",
    },
    returnNull: false,
});

// `<html lang>` acompaña al idioma activo (lectores de pantalla, guionado).
const syncDocumentLanguage = (language: string) => {
    if (typeof document !== "undefined") {
        document.documentElement.lang = language;
    }
};
syncDocumentLanguage(i18n.language || FALLBACK_LANGUAGE);
i18n.on("languageChanged", syncDocumentLanguage);

/** Aplica el idioma guardado en las preferencias (`settingsGet`). */
export async function applySavedLanguage(): Promise<void> {
    try {
        const settings = await commands.settingsGet();
        const language = resolveLanguage(settings.language ?? null, systemLanguages());
        if (language !== i18n.language) {
            await i18n.changeLanguage(language);
        }
    } catch {
        // Sin preferencias legibles se queda el idioma del sistema.
    }
}

export default i18n;

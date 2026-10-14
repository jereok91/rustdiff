/*
 * Resolución del idioma de la UI.
 *
 * Mismo orden que `app.rs` de la GTK: la preferencia guardada (`en`/`es`)
 * manda; con `auto` (o sin preferencia) se usa el idioma del sistema, que en
 * el WebView es `navigator.languages`; si nada coincide, inglés.
 */

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: Language = "en";

/** `"es-AR"` -> `"es"`; `null` si no es un idioma soportado. */
export function normalizeLanguage(tag: string | null | undefined): Language | null {
    if (!tag) {
        return null;
    }
    const base = tag.trim().toLowerCase().split(/[-_.]/)[0];
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? (base as Language) : null;
}

export function resolveLanguage(setting: string | null | undefined, systemLanguages: readonly string[]): Language {
    const explicit = setting && setting !== "auto" ? normalizeLanguage(setting) : null;
    if (explicit) {
        return explicit;
    }
    for (const tag of systemLanguages) {
        const found = normalizeLanguage(tag);
        if (found) {
            return found;
        }
    }
    return FALLBACK_LANGUAGE;
}

/** Idiomas del sistema según el WebView. */
export function systemLanguages(): readonly string[] {
    if (typeof navigator === "undefined") {
        return [];
    }
    if (navigator.languages && navigator.languages.length > 0) {
        return navigator.languages;
    }
    return navigator.language ? [navigator.language] : [];
}

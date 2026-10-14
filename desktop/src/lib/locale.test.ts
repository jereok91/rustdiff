import { describe, expect, it } from "vitest";

import { normalizeLanguage, resolveLanguage } from "@/lib/locale";

describe("resolveLanguage", () => {
    it("la preferencia explícita manda sobre el sistema", () => {
        expect(resolveLanguage("es", ["en-US"])).toBe("es");
        expect(resolveLanguage("en", ["es-AR"])).toBe("en");
    });

    it("con auto o sin preferencia usa el primer idioma soportado del sistema", () => {
        expect(resolveLanguage("auto", ["es-AR", "en"])).toBe("es");
        expect(resolveLanguage(null, ["fr-FR", "es_ES.UTF-8"])).toBe("es");
        expect(resolveLanguage(undefined, ["en-GB"])).toBe("en");
    });

    it("cae a inglés si nada coincide", () => {
        expect(resolveLanguage("auto", ["fr", "de-DE"])).toBe("en");
        expect(resolveLanguage("auto", [])).toBe("en");
        // Una preferencia no soportada se trata como auto.
        expect(resolveLanguage("pt", ["fr"])).toBe("en");
        expect(resolveLanguage("pt", ["es"])).toBe("es");
    });

    it("normaliza etiquetas regionales", () => {
        expect(normalizeLanguage("ES-mx")).toBe("es");
        expect(normalizeLanguage("")).toBeNull();
        expect(normalizeLanguage("fr")).toBeNull();
    });
});

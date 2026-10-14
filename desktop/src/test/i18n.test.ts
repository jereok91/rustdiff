/*
 * Los dos catálogos tienen las mismas claves y la interpolación `%{x}` de
 * rust-i18n funciona con la configuración de i18next.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import i18n, { applyLanguageSetting } from "@/i18n";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

describe("i18n", () => {
    it("en y es tienen exactamente las mismas claves", () => {
        expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    });

    it("interpola con la sintaxis %{name} y claves con puntos literales", () => {
        const t = i18n.getFixedT("en");
        expect(t("diff.summary_counts", { total: 3, added: 1, removed: 0, changed: 2 })).toBe(
            "3 difference(s): 1 added, 0 removed, 2 changed",
        );
        expect(i18n.getFixedT("es")("app.file_open_error", { path: "/x" })).toBe(
            "No se pudo leer el archivo: /x",
        );
    });

    it("una clave faltante en es cae al inglés", () => {
        i18n.addResource("en", "translation", "test.only_en", "solo en inglés");
        expect(i18n.getFixedT("es")("test.only_en")).toBe("solo en inglés");
    });

    describe("cambio de idioma en caliente", () => {
        afterEach(async () => {
            await i18n.changeLanguage("en");
        });

        it("en/es explícitos se aplican sin reiniciar", async () => {
            expect(await applyLanguageSetting("es")).toBe("es");
            expect(i18n.t("history.load_more")).toBe("Ver más");
            expect(document.documentElement.lang).toBe("es");
            expect(await applyLanguageSetting("en")).toBe("en");
            expect(i18n.t("history.load_more")).toBe("Load more");
        });

        it("auto usa el idioma del sistema", async () => {
            vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-AR", "en"]);
            expect(await applyLanguageSetting("auto")).toBe("es");
        });
    });
});

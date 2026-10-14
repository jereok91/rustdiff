import { describe, expect, it } from "vitest";

import { matchShortcut } from "@/hooks/use-shortcuts";

const key = (k: string, mods: Partial<{ ctrl: boolean; shift: boolean; meta: boolean; alt: boolean }> = {}) => ({
    key: k,
    ctrlKey: mods.ctrl ?? true,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
});

describe("matchShortcut", () => {
    it("mapea los atajos de la GTK", () => {
        expect(matchShortcut(key("o"))).toBe("openLeft");
        expect(matchShortcut(key("O", { shift: true }))).toBe("openRight");
        expect(matchShortcut(key("Enter"))).toBe("compare");
        expect(matchShortcut(key("F", { shift: true }))).toBe("format");
        expect(matchShortcut(key("d"))).toBe("toggleDiffPanel");
        expect(matchShortcut(key("g"))).toBe("toggleGraph");
        expect(matchShortcut(key("G", { shift: true }))).toBeNull();
        expect(matchShortcut(key("?", { shift: true }))).toBe("showShortcuts");
        expect(matchShortcut(key("/", { shift: true }))).toBe("showShortcuts");
    });

    it("Ctrl+F abre la búsqueda propia y F3 navega sin modificador", () => {
        expect(matchShortcut(key("f"))).toBe("search");
        expect(matchShortcut(key("F3", { ctrl: false }))).toBe("findNext");
        expect(matchShortcut(key("F3", { ctrl: false, shift: true }))).toBe("findPrevious");
        expect(matchShortcut(key("F3", { ctrl: false, alt: true }))).toBeNull();
    });

    it("mapea los atajos de historial, export y tamaño de texto (F5)", () => {
        expect(matchShortcut(key("s"))).toBe("saveSession");
        expect(matchShortcut(key("h"))).toBe("toggleHistory");
        expect(matchShortcut(key("e"))).toBe("exportTxt");
        expect(matchShortcut(key("+", { shift: true }))).toBe("fontIncrease");
        expect(matchShortcut(key("="))).toBe("fontIncrease");
        expect(matchShortcut(key("-"))).toBe("fontDecrease");
        expect(matchShortcut(key("0"))).toBe("fontReset");
        // Sin Ctrl son teclas normales del editor.
        expect(matchShortcut(key("s", { ctrl: false }))).toBeNull();
        expect(matchShortcut(key("+", { ctrl: false }))).toBeNull();
        expect(matchShortcut(key("g", { ctrl: false }))).toBeNull();
    });

    it("acepta Cmd en macOS", () => {
        expect(matchShortcut(key("o", { ctrl: false, meta: true }))).toBe("openLeft");
    });

    it("ignora teclas sin modificador, con Alt o que no son nuestras", () => {
        expect(matchShortcut(key("o", { ctrl: false }))).toBeNull();
        expect(matchShortcut(key("o", { alt: true }))).toBeNull();
        expect(matchShortcut(key("x"))).toBeNull();
    });
});

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
        expect(matchShortcut(key("?", { shift: true }))).toBe("showShortcuts");
        expect(matchShortcut(key("/", { shift: true }))).toBe("showShortcuts");
    });

    it("acepta Cmd en macOS", () => {
        expect(matchShortcut(key("o", { ctrl: false, meta: true }))).toBe("openLeft");
    });

    it("ignora teclas sin modificador, con Alt o que no son nuestras", () => {
        expect(matchShortcut(key("o", { ctrl: false }))).toBeNull();
        expect(matchShortcut(key("o", { alt: true }))).toBeNull();
        // Ctrl+F sin Shift es la búsqueda de CodeMirror (F4 la reemplaza).
        expect(matchShortcut(key("f"))).toBeNull();
        expect(matchShortcut(key("x"))).toBeNull();
    });
});

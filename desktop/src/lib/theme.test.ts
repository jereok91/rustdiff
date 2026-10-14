/*
 * Tema: persistencia en `localStorage`, resolución contra el sistema y la
 * clase `.dark` del documento; el hook sigue al sistema en vivo y aplica la
 * elección del usuario antes del re-render.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "@/hooks/use-color-scheme";
import {
    applySavedTheme,
    applyScheme,
    DEFAULT_THEME_SETTING,
    normalizeThemeSetting,
    readThemeSetting,
    resolveScheme,
    THEME_STORAGE_KEY,
    writeThemeSetting,
} from "@/lib/theme";

/** `matchMedia` falso con un "sistema" que se puede poner oscuro. */
function mockSystem(dark: boolean) {
    const listeners = new Set<() => void>();
    const media = {
        get matches() {
            return state.dark;
        },
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    const state = { dark };
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => media),
    );
    return {
        set(next: boolean) {
            state.dark = next;
            listeners.forEach((cb) => cb());
        },
    };
}

const root = () => document.documentElement;

beforeEach(() => {
    localStorage.clear();
    root().classList.remove("dark");
    root().style.colorScheme = "";
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("lib/theme", () => {
    it("normaliza lo guardado: cualquier cosa desconocida es el predeterminado, 'dark'", () => {
        expect(DEFAULT_THEME_SETTING).toBe("dark");
        expect(normalizeThemeSetting("dark")).toBe("dark");
        expect(normalizeThemeSetting("light")).toBe("light");
        expect(normalizeThemeSetting("system")).toBe("system");
        expect(normalizeThemeSetting("purple")).toBe("dark");
        expect(normalizeThemeSetting(null)).toBe("dark");
    });

    it("persiste y relee la elección", () => {
        expect(readThemeSetting()).toBe("dark");
        writeThemeSetting("dark");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
        expect(readThemeSetting()).toBe("dark");
    });

    it("sin almacenamiento usable cae al predeterminado sin lanzar", () => {
        const broken = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        };
        expect(readThemeSetting(broken)).toBe("dark");
        expect(() => writeThemeSetting("dark", broken)).not.toThrow();
    });

    it("'system' sigue al sistema; claro y oscuro lo fijan", () => {
        expect(resolveScheme("system", true)).toBe("dark");
        expect(resolveScheme("system", false)).toBe("light");
        expect(resolveScheme("light", true)).toBe("light");
        expect(resolveScheme("dark", false)).toBe("dark");
    });

    it("aplicar un esquema mueve la clase .dark y color-scheme", () => {
        applyScheme("dark");
        expect(root().classList.contains("dark")).toBe(true);
        expect(root().style.colorScheme).toBe("dark");
        applyScheme("light");
        expect(root().classList.contains("dark")).toBe(false);
        expect(root().style.colorScheme).toBe("light");
    });

    it("sin nada guardado arranca en oscuro aunque el sistema sea claro", () => {
        mockSystem(false);
        expect(applySavedTheme()).toBe("dark");
        expect(root().classList.contains("dark")).toBe(true);
        expect(root().style.colorScheme).toBe("dark");
    });

    it("al arrancar aplica lo guardado por encima del sistema", () => {
        mockSystem(false);
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
        expect(applySavedTheme()).toBe("dark");
        expect(root().classList.contains("dark")).toBe(true);
    });
});

describe("useTheme", () => {
    it("por defecto es oscuro e ignora al sistema", () => {
        const system = mockSystem(false);
        const { result } = renderHook(() => useTheme());
        expect(result.current.setting).toBe("dark");
        expect(result.current.scheme).toBe("dark");
        act(() => system.set(true));
        act(() => system.set(false));
        expect(result.current.scheme).toBe("dark");
    });

    it("'system' sigue al sistema, también cuando cambia en vivo", () => {
        const system = mockSystem(false);
        localStorage.setItem(THEME_STORAGE_KEY, "system");
        const { result } = renderHook(() => useTheme());
        expect(result.current.setting).toBe("system");
        expect(result.current.scheme).toBe("light");

        act(() => system.set(true));
        expect(result.current.scheme).toBe("dark");
        expect(root().classList.contains("dark")).toBe(true);
    });

    it("elegir claro u oscuro persiste, aplica ya e ignora al sistema", () => {
        const system = mockSystem(true);
        const { result } = renderHook(() => useTheme());
        expect(result.current.scheme).toBe("dark");

        act(() => result.current.setSetting("light"));
        expect(result.current.setting).toBe("light");
        expect(result.current.scheme).toBe("light");
        expect(root().classList.contains("dark")).toBe(false);
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

        act(() => system.set(false));
        act(() => system.set(true));
        expect(result.current.scheme).toBe("light");

        act(() => result.current.setSetting("system"));
        expect(result.current.scheme).toBe("dark");
    });

    it("una instancia nueva arranca con lo guardado", () => {
        mockSystem(false);
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
        const { result } = renderHook(() => useTheme());
        expect(result.current.setting).toBe("dark");
        expect(result.current.scheme).toBe("dark");
    });
});

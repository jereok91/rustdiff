import { describe, expect, it } from "vitest";

import {
    applyUiScale,
    clampUiScale,
    nextUiScale,
    UI_SCALE_DEFAULT,
    UI_SCALE_MAX,
    UI_SCALE_MIN,
    uiScalePercent,
} from "@/lib/ui-scale";

describe("ui-scale", () => {
    it("acota a UI_SCALE_MIN..UI_SCALE_MAX y un valor inválido vuelve al default", () => {
        expect(clampUiScale(10)).toBe(UI_SCALE_MAX);
        expect(clampUiScale(0.1)).toBe(UI_SCALE_MIN);
        expect(clampUiScale(1.3)).toBe(1.3);
        expect(clampUiScale(Number.NaN)).toBe(UI_SCALE_DEFAULT);
        expect(clampUiScale(undefined)).toBe(UI_SCALE_DEFAULT);
    });

    it("pasos de 10% sin error flotante, con tope en los extremos y reset", () => {
        let scale = UI_SCALE_DEFAULT;
        for (let i = 0; i < 3; i++) {
            scale = nextUiScale(scale, "increase");
        }
        expect(scale).toBe(1.3);
        expect(nextUiScale(1.95, "increase")).toBe(UI_SCALE_MAX);
        expect(nextUiScale(UI_SCALE_MIN, "decrease")).toBe(UI_SCALE_MIN);
        expect(nextUiScale(0.7, "decrease")).toBe(0.6);
        expect(nextUiScale(1.7, "reset")).toBe(UI_SCALE_DEFAULT);
        expect(uiScalePercent(1.1)).toBe(110);
    });

    it("aplica la escala al font-size de la raíz y el 100% no deja estilo inline", () => {
        const root = document.createElement("html");
        applyUiScale(1.2, root);
        expect(root.style.fontSize).toBe("120%");
        applyUiScale(5, root);
        expect(root.style.fontSize).toBe("200%");
        applyUiScale(1, root);
        expect(root.style.fontSize).toBe("");
    });
});

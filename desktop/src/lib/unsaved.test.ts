import { describe, expect, it } from "vitest";

import { hasUnsavedContent } from "@/lib/unsaved";

describe("hasUnsavedContent", () => {
    it("editores vacíos (o solo espacios) no piden confirmación", () => {
        expect(hasUnsavedContent({ left: "", right: "  \n" }, null)).toBe(false);
    });

    it("texto nunca guardado sí, en cualquiera de los dos lados", () => {
        expect(hasUnsavedContent({ left: "{}", right: "" }, null)).toBe(true);
        expect(hasUnsavedContent({ left: "", right: "<a/>" }, null)).toBe(true);
    });

    it("igual a lo último guardado no; cualquier cambio posterior sí", () => {
        const saved = { left: "{}", right: "[]" };
        expect(hasUnsavedContent({ left: "{}", right: "[]" }, saved)).toBe(false);
        expect(hasUnsavedContent({ left: "{} ", right: "[]" }, saved)).toBe(true);
    });
});

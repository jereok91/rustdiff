import { describe, expect, it } from "vitest";

import { lineCount } from "@/lib/text-stats";

describe("lineCount", () => {
    it("cuenta como CodeMirror: el vacío es una línea y el salto final suma otra", () => {
        expect(lineCount("")).toBe(1);
        expect(lineCount("a")).toBe(1);
        expect(lineCount("a\nb")).toBe(2);
        expect(lineCount("a\nb\n")).toBe(3);
        expect(lineCount("a\r\nb")).toBe(2);
    });
});

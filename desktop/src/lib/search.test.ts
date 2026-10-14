import { describe, expect, it } from "vitest";

import { currentMatch, findMatches, pickIncremental, pickMatch } from "@/lib/search";

const text = "Foo bar foo baz FOO";
const matches = findMatches(text, "foo");

describe("findMatches", () => {
    it("encuentra todas las coincidencias sin distinguir mayúsculas", () => {
        expect(matches).toEqual([
            { from: 0, to: 3 },
            { from: 8, to: 11 },
            { from: 16, to: 19 },
        ]);
    });

    it("no solapa, respeta el tope y una consulta vacía no busca", () => {
        expect(findMatches("aaaa", "aa")).toEqual([
            { from: 0, to: 2 },
            { from: 2, to: 4 },
        ]);
        expect(findMatches("aaaa", "a", 2)).toHaveLength(2);
        expect(findMatches(text, "")).toEqual([]);
        expect(findMatches(text, "zzz")).toEqual([]);
    });
});

describe("pickMatch (siguiente / anterior con wrap-around)", () => {
    it("siguiente busca desde el final de la selección", () => {
        expect(pickMatch(matches, { from: 0, to: 0 }, "next")).toBe(0);
        expect(pickMatch(matches, { from: 0, to: 3 }, "next")).toBe(1);
        expect(pickMatch(matches, { from: 8, to: 11 }, "next")).toBe(2);
    });

    it("siguiente desde la última vuelve a la primera", () => {
        expect(pickMatch(matches, { from: 16, to: 19 }, "next")).toBe(0);
    });

    it("anterior busca hacia atrás desde el inicio de la selección", () => {
        expect(pickMatch(matches, { from: 16, to: 19 }, "prev")).toBe(1);
        expect(pickMatch(matches, { from: 8, to: 11 }, "prev")).toBe(0);
        expect(pickMatch(matches, { from: 12, to: 12 }, "prev")).toBe(1);
    });

    it("anterior desde la primera vuelve a la última", () => {
        expect(pickMatch(matches, { from: 0, to: 3 }, "prev")).toBe(2);
    });

    it("sin coincidencias devuelve -1", () => {
        expect(pickMatch([], { from: 0, to: 0 }, "next")).toBe(-1);
        expect(pickMatch([], { from: 0, to: 0 }, "prev")).toBe(-1);
    });
});

describe("búsqueda incremental y contador", () => {
    it("al escribir se queda en la coincidencia actual si sigue valiendo", () => {
        expect(pickIncremental(matches, { from: 8, to: 9 })).toBe(1);
        expect(pickIncremental(matches, { from: 17, to: 17 })).toBe(0);
        expect(pickIncremental([], { from: 0, to: 0 })).toBe(-1);
    });

    it("currentMatch reconoce la selección exacta", () => {
        expect(currentMatch(matches, { from: 8, to: 11 })).toBe(1);
        expect(currentMatch(matches, { from: 8, to: 10 })).toBe(-1);
    });
});

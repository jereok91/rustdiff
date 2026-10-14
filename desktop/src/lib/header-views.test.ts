import { describe, expect, it } from "vitest";

import { togglePanels } from "@/lib/header-views";

describe("togglePanels", () => {
    it("devuelve solo lo que cambió", () => {
        expect(togglePanels(["diff"], ["diff", "graph"])).toEqual(["graph"]);
        expect(togglePanels(["history", "diff"], ["diff"])).toEqual(["history"]);
        expect(togglePanels(["diff"], ["diff"])).toEqual([]);
    });

    it("varios cambios salen en orden estable", () => {
        expect(togglePanels([], ["diff", "history"])).toEqual(["history", "diff"]);
    });
});

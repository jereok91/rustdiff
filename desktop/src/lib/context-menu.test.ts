/*
 * El menú contextual nativo de WebKitGTK (Atrás, Adelante, Detener, Recargar) no
 * es de la app y "Recargar" se lleva el estado en memoria. La app lo cancela.
 */

import { describe, expect, it } from "vitest";

import { installContextMenuGuard } from "@/lib/context-menu";

function openContextMenu(host: EventTarget) {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    host.dispatchEvent(event);
    return event;
}

describe("installContextMenuGuard", () => {
    it("cancela el menú contextual nativo del destino", () => {
        const host = document.createElement("div");
        const remove = installContextMenuGuard(host);
        expect(openContextMenu(host).defaultPrevented).toBe(true);
        remove();
    });

    it("deja de cancelarlo cuando se desinstala", () => {
        const host = document.createElement("div");
        const remove = installContextMenuGuard(host);
        remove();
        expect(openContextMenu(host).defaultPrevented).toBe(false);
    });
});

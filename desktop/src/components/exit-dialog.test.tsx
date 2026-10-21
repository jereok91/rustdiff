/*
 * Diálogo de salida: Cancel recibe el foco al abrir, la última respuesta del Tab
 * es la acción segura (guardar) y la destructiva queda antes que ella, Escape
 * cancela sin elegir y Ctrl/Cmd+S elige guardar en el historial.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExitDialog } from "@/components/exit-dialog";
import "@/i18n";

afterEach(cleanup);

function renderOpen(pendingChanges?: number) {
    const onOpenChange = vi.fn();
    const onChoose = vi.fn();
    render(
        <ExitDialog open onOpenChange={onOpenChange} onChoose={onChoose} pendingChanges={pendingChanges} />,
    );
    return { onOpenChange, onChoose };
}

function answerOrder(dialog: HTMLElement) {
    return Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
        .filter((button) => button.tabIndex >= 0 && !button.disabled)
        .map((button) => button.getAttribute("aria-label") ?? button.textContent?.replace(/Esc|Ctrl\+S/, "").trim());
}

describe("ExitDialog", () => {
    it("enfoca Cancel al abrir", async () => {
        renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        expect(dialog.contains(document.activeElement)).toBe(true);
        expect(document.activeElement?.textContent).toContain("Cancel");
    });

    it("un Tab desde Cancel no llega a la respuesta destructiva, que es la última del orden de foco", async () => {
        renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        // Sin tabindex positivo, el orden del DOM ES el orden del Tab. Esta prueba no
        // simula la pulsacion (jsdom no mueve el foco): afirma la adyacencia, que es
        // lo que decide que hace un Tab real desde Cancel.
        const order = answerOrder(dialog);
        const cancel = order.indexOf("Cancel");
        expect(cancel).toBeGreaterThanOrEqual(0);
        expect(order[cancel + 1]).toBe("Save to History");
        expect(order.at(-1)).toBe("Close without saving");
        expect(order).toEqual([
            "Export .html",
            "Export .txt",
            "Cancel",
            "Save to History",
            "Close without saving",
        ]);
    });

    it("muestra la insignia sin guardar y el resumen de la sesión", async () => {
        renderOpen(3);
        const dialog = await screen.findByTestId("exit-dialog");
        expect(dialog.textContent).toContain("Unsaved");
        expect(dialog.textContent).toContain("Current session: 3 changes");
        // Nada se guarda solo: la franja lo dice en vez de prometer recuperación.
        expect(dialog.textContent).toContain("In memory only");
    });

    it("la franja usa el singular con una sola modificación", async () => {
        renderOpen(1);
        const dialog = await screen.findByTestId("exit-dialog");
        expect(dialog.textContent).toContain("Current session: 1 change");
    });

    it("Escape cierra sin elegir ninguna respuesta", async () => {
        const { onOpenChange, onChoose } = renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onChoose).not.toHaveBeenCalled();
    });

    it("Ctrl+S elige guardar en el historial", async () => {
        const { onChoose } = renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        fireEvent.keyDown(dialog, { key: "s", ctrlKey: true });
        expect(onChoose).toHaveBeenCalledWith("save_history");
    });

    it("cada respuesta dispara su elección", async () => {
        const { onChoose } = renderOpen(1);
        await screen.findByTestId("exit-dialog");
        fireEvent.click(screen.getByText("Export .html"));
        fireEvent.click(screen.getByText("Export .txt"));
        fireEvent.click(screen.getByText("Save to History"));
        fireEvent.click(screen.getByText("Close without saving"));
        expect(onChoose.mock.calls.map(([choice]) => choice)).toEqual([
            "export_html",
            "export_txt",
            "save_history",
            "close",
        ]);
    });
});

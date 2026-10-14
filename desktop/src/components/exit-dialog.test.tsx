/*
 * Diálogo de salida: Cancel recibe el foco al abrir, es el primero del orden
 * de Tab, la respuesta destructiva es la última, y Escape cancela sin elegir.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExitDialog } from "@/components/exit-dialog";
import "@/i18n";

afterEach(cleanup);

function renderOpen() {
    const onOpenChange = vi.fn();
    const onChoose = vi.fn();
    render(<ExitDialog open onOpenChange={onOpenChange} onChoose={onChoose} />);
    return { onOpenChange, onChoose };
}

describe("ExitDialog", () => {
    it("enfoca Cancel al abrir", async () => {
        renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        expect(dialog.contains(document.activeElement)).toBe(true);
        expect(document.activeElement?.textContent).toBe("Cancel");
    });

    it("orden de Tab: Cancel primero, la respuesta destructiva al final", async () => {
        renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        const order = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
            .filter((button) => button.tabIndex >= 0 && !button.disabled)
            .map((button) => button.textContent);
        expect(order).toEqual([
            "Cancel",
            "Export .html",
            "Export .txt",
            "Save to History",
            "Close without saving",
        ]);
    });

    it("Escape cierra sin elegir ninguna respuesta", async () => {
        const { onOpenChange, onChoose } = renderOpen();
        const dialog = await screen.findByTestId("exit-dialog");
        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onChoose).not.toHaveBeenCalled();
    });
});

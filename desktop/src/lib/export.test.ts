import { describe, expect, it, vi } from "vitest";

import { exportReport, exportStatus } from "@/lib/export";

const deps = (path: string | null) => ({
    pickPath: vi.fn(async () => path),
    exportTxt: vi.fn(async () => "TXT"),
    exportHtml: vi.fn(async () => "<html>"),
    writeTextFile: vi.fn(async () => null),
});
const input = { left: "{}", right: "[]", format: "Json" as const };

describe("exportReport", () => {
    it("sin comparación no abre el diálogo", async () => {
        const d = deps("/x.txt");
        const outcome = await exportReport("txt", { ...input, format: null }, d);
        expect(outcome).toEqual({ kind: "none" });
        expect(d.pickPath).not.toHaveBeenCalled();
        expect(exportStatus(outcome)).toEqual({ key: "export.none" });
    });

    it("cancelar el diálogo no escribe ni avisa", async () => {
        const d = deps(null);
        const outcome = await exportReport("txt", input, d);
        expect(outcome.kind).toBe("cancelled");
        expect(d.writeTextFile).not.toHaveBeenCalled();
        expect(exportStatus(outcome)).toBeNull();
    });

    it("renderiza en el backend y escribe en la ruta elegida", async () => {
        const d = deps("/tmp/r.html");
        const outcome = await exportReport("html", input, d);
        expect(d.exportHtml).toHaveBeenCalledWith("{}", "[]", "Json");
        expect(d.writeTextFile).toHaveBeenCalledWith("/tmp/r.html", "<html>");
        expect(exportStatus(outcome)).toEqual({ key: "export.write_success", params: { path: "/tmp/r.html" } });
    });

    it("un error del backend se reporta con su mensaje", async () => {
        const d = deps("/ro/r.txt");
        d.writeTextFile.mockRejectedValue({ code: "Io", message: "permiso denegado" });
        const outcome = await exportReport("txt", input, d);
        expect(exportStatus(outcome)).toEqual({
            key: "export.write_error",
            params: { error: "permiso denegado" },
            error: true,
        });
    });
});

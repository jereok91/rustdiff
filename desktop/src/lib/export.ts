/*
 * Exportar el resultado a .txt / .html (`export_to_file` de la GTK).
 *
 * El flujo: diálogo nativo de guardado (solo devuelve una ruta), el backend
 * renderiza el reporte (`exportTxt` / `exportHtml`) y el backend lo escribe
 * (`writeTextFile`). El frontend nunca toca el disco (S8).
 */

import type { Format } from "@/bindings";
import type { StatusMessage } from "@/lib/errors";

export type ExportKind = "txt" | "html";

export type ExportDeps = {
    /** `save()` de `@tauri-apps/plugin-dialog`: ruta elegida o `null` si se canceló. */
    pickPath: (kind: ExportKind) => Promise<string | null>;
    exportTxt: (left: string, right: string, format: Format | null) => Promise<string>;
    exportHtml: (left: string, right: string, format: Format | null) => Promise<string>;
    writeTextFile: (path: string, content: string) => Promise<null>;
};

export type ExportOutcome =
    | { kind: "none" }
    | { kind: "cancelled" }
    | { kind: "written"; path: string }
    | { kind: "error"; message: string };

export type ExportInput = {
    left: string;
    right: string;
    /** Formato de la última comparación; `null` si todavía no se comparó. */
    format: Format | null;
};

/** Nombre sugerido en el diálogo, igual que la GTK. */
export function defaultReportName(kind: ExportKind): string {
    return `rustdiff-report.${kind}`;
}

export async function exportReport(kind: ExportKind, input: ExportInput, deps: ExportDeps): Promise<ExportOutcome> {
    // Sin comparación no hay nada que exportar (`export.none`).
    if (input.format === null) {
        return { kind: "none" };
    }
    const path = await deps.pickPath(kind);
    if (!path) {
        return { kind: "cancelled" };
    }
    try {
        const render = kind === "txt" ? deps.exportTxt : deps.exportHtml;
        const content = await render(input.left, input.right, input.format);
        await deps.writeTextFile(path, content);
        return { kind: "written", path };
    } catch (error) {
        const message =
            typeof error === "object" && error !== null && "message" in error
                ? String((error as { message: unknown }).message)
                : String(error);
        return { kind: "error", message };
    }
}

/** Mensaje de estado del resultado; `null` cuando el usuario canceló. */
export function exportStatus(outcome: ExportOutcome): StatusMessage | null {
    switch (outcome.kind) {
        case "none":
            return { key: "export.none" };
        case "cancelled":
            return null;
        case "written":
            return { key: "export.write_success", params: { path: outcome.path } };
        case "error":
            return { key: "export.write_error", params: { error: outcome.message }, error: true };
    }
}

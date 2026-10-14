/*
 * Traducción de errores del backend a mensajes de la barra de estado.
 *
 * Los comandos rechazan con `CommandError { code, message }`. La barra de
 * estado guarda una clave i18n + parámetros (no texto ya traducido), así un
 * cambio de idioma vuelve a renderizar el mensaje correcto.
 */

import type { CommandError, ErrorCode } from "@/bindings";

export type StatusParams = Record<string, string | number>;

export type StatusMessage = {
    key: string;
    params?: StatusParams;
    /** Parámetros que son a su vez mensajes traducibles (ej. el resumen del diff). */
    nested?: Record<string, StatusMessage>;
    /** `true` para pintar el mensaje como error. */
    error?: boolean;
};

/** Traduce un mensaje de estado con la función `t` de i18next. */
export function renderStatus(
    message: StatusMessage,
    t: (key: string, params?: StatusParams) => string,
): string {
    const params: StatusParams = { ...message.params };
    for (const [name, inner] of Object.entries(message.nested ?? {})) {
        params[name] = renderStatus(inner, t);
    }
    return t(message.key, params);
}

const CODES: readonly ErrorCode[] = [
    "NeedInput",
    "UnknownFormat",
    "DetectFailed",
    "UnsupportedFormat",
    "InvalidDocument",
    "InvalidLeft",
    "InvalidRight",
    "TooLarge",
    "Io",
    "HistoryUnavailable",
    "NotFound",
];

/** Normaliza cualquier rechazo (IPC tipado, `Error`, string) a `CommandError`. */
export function toCommandError(error: unknown): CommandError {
    if (typeof error === "object" && error !== null) {
        const candidate = error as Partial<CommandError>;
        if (typeof candidate.code === "string" && CODES.includes(candidate.code as ErrorCode)) {
            return { code: candidate.code as ErrorCode, message: String(candidate.message ?? "") };
        }
        if (error instanceof Error) {
            return { code: "Io", message: error.message };
        }
    }
    return { code: "Io", message: typeof error === "string" ? error : String(error) };
}

function fallback(err: CommandError): StatusMessage {
    if (err.code === "TooLarge") {
        return { key: "errors.too_large", params: { error: err.message }, error: true };
    }
    return { key: "errors.generic", params: { error: err.message }, error: true };
}

/** Resumen de una comparación exitosa: "N difference(s): ... | FMT". */
export function summaryStatus(
    counts: { added: number; removed: number; changed: number },
    formatName: string,
): StatusMessage {
    const total = counts.added + counts.removed + counts.changed;
    const summary: StatusMessage =
        total === 0
            ? { key: "diff.summary_identical" }
            : { key: "diff.summary_counts", params: { total, ...counts } };
    return { key: "compare.summary_format", params: { fmt: formatName }, nested: { summary } };
}

/** Error de una comparación (`diffDocuments`). */
export function compareErrorStatus(err: CommandError): StatusMessage {
    switch (err.code) {
        case "NeedInput":
            // No es un fallo: es el estado "faltan documentos" de la GTK.
            return { key: "compare.need_input" };
        case "DetectFailed":
            return { key: "compare.detect_failed_hint", error: true };
        case "InvalidLeft":
            return { key: "compare.error_left", params: { error: err.message }, error: true };
        case "InvalidRight":
            return { key: "compare.error_right", params: { error: err.message }, error: true };
        default:
            return fallback(err);
    }
}

export type Side = "left" | "right";

/** Error del botón Format sobre un panel (`detectFormat` / `formatPretty`). */
export function formatErrorStatus(err: CommandError, side: Side): StatusMessage {
    switch (err.code) {
        case "DetectFailed":
        case "NeedInput":
            return { key: "format.detect_failed", error: true };
        case "InvalidDocument":
        case "InvalidLeft":
        case "InvalidRight":
            return { key: `format.format_error_${side}`, params: { error: err.message }, error: true };
        default:
            return fallback(err);
    }
}

/** Error al abrir un archivo (`readTextFile` / `startupFiles`). */
export function openErrorStatus(err: CommandError, path: string): StatusMessage {
    if (err.code === "TooLarge") {
        return fallback(err);
    }
    return { key: "app.file_open_error", params: { path }, error: true };
}

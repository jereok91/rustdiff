import { describe, expect, it } from "vitest";

import type { CommandError } from "@/bindings";
import {
    compareErrorStatus,
    formatErrorStatus,
    openErrorStatus,
    renderStatus,
    summaryStatus,
    toCommandError,
} from "@/lib/errors";

const err = (code: CommandError["code"], message = "boom"): CommandError => ({ code, message });

describe("toCommandError", () => {
    it("conserva un CommandError tipado", () => {
        expect(toCommandError({ code: "InvalidLeft", message: "x" })).toEqual({ code: "InvalidLeft", message: "x" });
    });

    it("normaliza rechazos desconocidos a Io", () => {
        expect(toCommandError("texto")).toEqual({ code: "Io", message: "texto" });
        expect(toCommandError(new Error("falló"))).toEqual({ code: "Io", message: "falló" });
        expect(toCommandError({ code: "Inventado", message: "x" }).code).toBe("Io");
    });
});

describe("compareErrorStatus", () => {
    it("traduce cada código a su clave i18n", () => {
        expect(compareErrorStatus(err("NeedInput"))).toEqual({ key: "compare.need_input" });
        expect(compareErrorStatus(err("DetectFailed")).key).toBe("compare.detect_failed_hint");
        expect(compareErrorStatus(err("InvalidLeft", "l"))).toMatchObject({
            key: "compare.error_left",
            params: { error: "l" },
            error: true,
        });
        expect(compareErrorStatus(err("InvalidRight")).key).toBe("compare.error_right");
        expect(compareErrorStatus(err("TooLarge")).key).toBe("errors.too_large");
        expect(compareErrorStatus(err("UnknownFormat")).key).toBe("errors.generic");
    });

    it("NeedInput no se pinta como error (es el estado de espera de la GTK)", () => {
        expect(compareErrorStatus(err("NeedInput")).error).toBeUndefined();
    });
});

describe("formatErrorStatus / openErrorStatus", () => {
    it("usa el lado del panel que falló", () => {
        expect(formatErrorStatus(err("InvalidDocument"), "left").key).toBe("format.format_error_left");
        expect(formatErrorStatus(err("InvalidDocument"), "right").key).toBe("format.format_error_right");
        expect(formatErrorStatus(err("DetectFailed"), "left").key).toBe("format.detect_failed");
    });

    it("al abrir muestra la ruta salvo que el archivo sea demasiado grande", () => {
        expect(openErrorStatus(err("Io"), "/a.json")).toMatchObject({
            key: "app.file_open_error",
            params: { path: "/a.json" },
        });
        expect(openErrorStatus(err("TooLarge"), "/a.json").key).toBe("errors.too_large");
    });
});

describe("summaryStatus + renderStatus", () => {
    const t = (key: string, params?: Record<string, string | number>) =>
        `${key}(${Object.entries(params ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join(",")})`;

    it("anida el resumen dentro de compare.summary_format", () => {
        const status = summaryStatus({ added: 1, removed: 0, changed: 2 }, "JSON");
        expect(renderStatus(status, t)).toBe(
            "compare.summary_format(fmt=JSON,summary=diff.summary_counts(total=3,added=1,removed=0,changed=2))",
        );
    });

    it("sin diferencias usa el mensaje de documentos idénticos", () => {
        const status = summaryStatus({ added: 0, removed: 0, changed: 0 }, "XML");
        expect(renderStatus(status, t)).toBe("compare.summary_format(fmt=XML,summary=diff.summary_identical())");
    });
});

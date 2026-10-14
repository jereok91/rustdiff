/*
 * Formatos de documento del lado del frontend.
 *
 * El selector de la cabecera tiene cinco opciones (igual que el dropdown de la
 * GTK): "auto" deja que el backend detecte el formato desde el documento
 * izquierdo; el resto lo fija.
 */

import type { Format } from "@/bindings";

export type FormatChoice = "auto" | Format;

export const FORMAT_CHOICES: FormatChoice[] = ["auto", "Json", "Xml", "Sql", "Text"];

/** Valor que viaja al backend: `null` = detección automática. */
export function formatArg(choice: FormatChoice): Format | null {
    return choice === "auto" ? null : choice;
}

/** Nombre visible del formato, igual que el `Display` de `Format` en el núcleo. */
export function formatDisplayName(format: Format): string {
    switch (format) {
        case "Json":
            return "JSON";
        case "Xml":
            return "XML";
        case "Sql":
            return "SQL";
        case "Text":
            return "Text";
    }
}

/** Lenguaje del editor: lo elegido manda; en "auto" se usa lo detectado. */
export type EditorLanguage = "json" | "xml" | "sql" | "plain";

export function editorLanguage(choice: FormatChoice, detected: Format | null): EditorLanguage {
    const format = choice === "auto" ? detected : choice;
    switch (format) {
        case "Json":
            return "json";
        case "Xml":
            return "xml";
        case "Sql":
            return "sql";
        default:
            return "plain";
    }
}

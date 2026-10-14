/*
 * Tema de CodeMirror construido sobre los tokens (`styles/tokens.css`).
 *
 * Los colores del editor son variables CSS, así que siguen solos a la clase
 * `.dark`; lo único que depende del esquema es la marca `dark` del tema (la
 * usan los paneles internos de CodeMirror) y el resaltado de sintaxis: en
 * claro queda el `defaultHighlightStyle` de `basicSetup`, en oscuro el de One
 * Dark (sus colores están pensados para fondo oscuro).
 */

import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";

import type { ColorScheme } from "@/lib/theme";

const chrome = {
    "&": { backgroundColor: "var(--background)", color: "var(--foreground)" },
    // El editor enfocado lleva el anillo de foco de la app, hacia adentro:
    // además marca en cuál de los dos editores va a buscar Ctrl+F.
    "&.cm-focused": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
    ".cm-content": { caretColor: "var(--foreground)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: "var(--editor-selection)" },
    ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
    ".cm-gutters": {
        backgroundColor: "var(--card)",
        color: "var(--muted-foreground)",
        borderRight: "1px solid var(--border)",
    },
    ".cm-activeLineGutter": { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" },
    ".cm-foldPlaceholder": {
        backgroundColor: "var(--muted)",
        color: "var(--muted-foreground)",
        border: "1px solid var(--border)",
    },
    ".cm-tooltip": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) - 2px)",
    },
    ".cm-panels": { backgroundColor: "var(--card)", color: "var(--card-foreground)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
        backgroundColor: "var(--accent)",
        outline: "1px solid var(--input)",
    },
    ".cm-searchMatch": { backgroundColor: "var(--diff-changed-line)", outline: "1px solid var(--diff-changed)" },
};

const lightTheme = EditorView.theme(chrome, { dark: false });
const darkTheme = [EditorView.theme(chrome, { dark: true }), syntaxHighlighting(oneDarkHighlightStyle)];

/** Extensión de tema del editor para un esquema. */
export function editorTheme(scheme: ColorScheme): Extension {
    return scheme === "dark" ? darkTheme : lightTheme;
}

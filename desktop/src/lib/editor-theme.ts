/*
 * Tema de CodeMirror construido sobre los tokens (`styles/tokens.css`).
 *
 * Todo color del editor es una variable CSS, así que sigue solo a la clase
 * `.dark`: superficie `--editor`, margen `--gutter`, selección y línea activa
 * derivadas, y el resaltado de sintaxis con los tokens `--syntax-*` del
 * sistema de diseño (los mismos en JSON, XML y SQL, sin verde/rojo/ámbar para
 * no confundirse con el diff). Lo único que depende del esquema es la marca
 * `dark` del tema, que usan los paneles internos de CodeMirror.
 */

import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

import type { ColorScheme } from "@/lib/theme";

const chrome = {
    "&": { backgroundColor: "var(--editor)", color: "var(--foreground)" },
    // El anillo de foco NO se dibuja acá: la gutter es `position: sticky` con
    // `z-index` propio, así que pinta encima del `outline` de `.cm-editor` y el
    // lado izquierdo (justo el de los números de línea) desaparece. Lo dibuja el
    // contenedor del editor, que incluye la gutter (ver `components/code-editor`).
    ".cm-content": { caretColor: "var(--primary)", padding: "0.5rem 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)", borderLeftWidth: "2px" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: "var(--editor-selection)" },
    ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
    ".cm-gutters": {
        backgroundColor: "var(--gutter)",
        color: "var(--gutter-foreground)",
        border: "none",
    },
    ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "2.75rem",
        paddingRight: "0.75rem",
        fontVariantNumeric: "tabular-nums",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)", fontWeight: "500" },
    ".cm-foldGutter .cm-gutterElement": { color: "var(--gutter-foreground)" },
    ".cm-foldPlaceholder": {
        backgroundColor: "var(--muted)",
        color: "var(--muted-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) - 4px)",
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
    ".cm-searchMatch": {
        backgroundColor: "var(--diff-changed-line)",
        outline: "1px solid var(--diff-changed)",
    },
};

/** Resaltado de sintaxis con los tokens `--syntax-*` (sirve para los dos temas). */
export const SYNTAX_HIGHLIGHT = HighlightStyle.define([
    { tag: [tags.propertyName, tags.tagName, tags.typeName], color: "var(--syntax-key)" },
    { tag: [tags.string, tags.attributeValue, tags.special(tags.string)], color: "var(--syntax-string)" },
    { tag: [tags.number, tags.integer, tags.float, tags.attributeName], color: "var(--syntax-number)" },
    { tag: [tags.bool, tags.null, tags.keyword, tags.atom, tags.literal], color: "var(--syntax-literal)" },
    {
        tag: [
            tags.punctuation,
            tags.bracket,
            tags.separator,
            tags.angleBracket,
            tags.operator,
            tags.definitionOperator,
        ],
        color: "var(--syntax-punct)",
    },
    { tag: [tags.comment, tags.meta, tags.processingInstruction], color: "var(--muted-foreground)", fontStyle: "italic" },
    { tag: tags.invalid, color: "var(--destructive)" },
]);

const highlighting = syntaxHighlighting(SYNTAX_HIGHLIGHT);
const lightTheme = [EditorView.theme(chrome, { dark: false }), highlighting];
const darkTheme = [EditorView.theme(chrome, { dark: true }), highlighting];

/** Extensión de tema del editor para un esquema. */
export function editorTheme(scheme: ColorScheme): Extension {
    return scheme === "dark" ? darkTheme : lightTheme;
}

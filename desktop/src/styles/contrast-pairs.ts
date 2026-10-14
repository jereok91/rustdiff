/*
 * Pares de tokens que tienen que cumplir WCAG AA en los dos temas.
 *
 * `fg` va sobre `bg`; si `bg` tiene alpha se compone sobre las capas `under`
 * (la última tiene que ser opaca). `min` es 4.5 para texto y 3 para
 * indicadores de UI (anillo de foco, bordes de campos, contornos del grafo).
 * `tokens.test.ts` recorre esta lista; `docs/design-system.md` publica los
 * resultados.
 *
 * Cada par sale de un uso real: la superficie donde se pinta el texto o el
 * indicador en la app (editor, margen, barra de título, panel, menús).
 */

import { AA_TEXT, AA_UI } from "@/lib/color";

export type ContrastPair = { fg: string; bg: string; under?: string[]; min: number; note: string };

const text = (fg: string, bg: string, note: string, under?: string[]): ContrastPair => ({
    fg,
    bg,
    under,
    min: AA_TEXT,
    note,
});
const ui = (fg: string, bg: string, note: string): ContrastPair => ({ fg, bg, min: AA_UI, note });

const KINDS = ["added", "removed", "changed"] as const;
const SYNTAX = ["--syntax-key", "--syntax-string", "--syntax-number", "--syntax-literal", "--syntax-punct"] as const;

export const CONTRAST_PAIRS: ContrastPair[] = [
    // Texto de la UI sobre sus superficies.
    text("--foreground", "--background", "body text"),
    text("--foreground", "--titlebar", "header and status bar text"),
    text("--card-foreground", "--card", "panel text (differences, history)"),
    text("--popover-foreground", "--popover", "menus, popovers, toasts"),
    text("--background", "--foreground", "tooltips"),
    text("--muted-foreground", "--background", "secondary text on content"),
    text("--muted-foreground", "--card", "secondary text on panels"),
    text("--muted-foreground", "--titlebar", "secondary text in header and status bar"),
    text("--muted-foreground", "--muted", "secondary text on muted fill (toggle groups, chips)"),
    text("--muted-foreground", "--popover", "shortcut hints in menus"),
    text("--muted-foreground", "--editor", "empty-pane hints"),
    text("--primary-foreground", "--primary", "primary button"),
    text("--secondary-foreground", "--secondary", "secondary button"),
    text("--accent-foreground", "--accent", "hovered / pressed items"),
    text("--foreground", "--accent", "selected row"),
    text("--primary", "--accent", "selected row number"),
    text("--primary", "--background", "link buttons"),
    text("--foreground", "--muted", "value chips"),
    text("--destructive-foreground", "--destructive", "destructive button"),
    text("--destructive", "--titlebar", "error text in the status bar"),
    text("--destructive", "--popover", "error toast"),

    // Editor: código, margen y selección.
    text("--foreground", "--editor", "code"),
    text("--gutter-foreground", "--gutter", "line numbers"),
    text("--foreground", "--gutter", "active line number"),
    ...SYNTAX.map((token) => text(token, "--editor", `${token.slice(2)} on the editor`)),
    text("--foreground", "--editor-selection", "selected code", ["--editor"]),
    ...SYNTAX.map((token) => text(token, "--editor-selection", `selected ${token.slice(9)}`, ["--editor"])),
    text("--foreground", "--editor-active-line", "code on the active line", ["--editor"]),
    ...SYNTAX.map((token) =>
        text(token, "--editor-active-line", `${token.slice(9)} on the active line`, ["--editor"]),
    ),

    // Indicadores de UI.
    ...["--background", "--card", "--popover", "--editor", "--gutter", "--titlebar"].map((bg) =>
        ui("--ring", bg, `focus ring on ${bg.slice(2)}`),
    ),
    ...["--background", "--card", "--popover", "--titlebar"].map((bg) =>
        ui("--input", bg, `input border on ${bg.slice(2)}`),
    ),

    // Diff, por tipo.
    ...KINDS.flatMap((kind) => [
        text(`--diff-${kind}-foreground`, "--editor", `${kind} text on the editor`),
        text(`--diff-${kind}-foreground`, "--card", `${kind} text on panels`),
        text(`--diff-${kind}-foreground`, "--gutter", `${kind} marker in the gutter`),
        text(`--diff-${kind}-foreground`, `--diff-${kind}-row`, `${kind} badge`, ["--card"]),
        text(`--diff-${kind}-foreground`, `--diff-${kind}-row`, `${kind} badge on the selected row`, ["--accent"]),
        text("--foreground", `--diff-${kind}-line`, `code on a ${kind} line`, ["--editor"]),
        ...SYNTAX.map((token) =>
            text(token, `--diff-${kind}-line`, `${token.slice(9)} on a ${kind} line`, ["--editor"]),
        ),
        text(`--diff-${kind}-foreground`, `--diff-${kind}-inline`, `${kind} characters in the editor`, [
            `--diff-${kind}-line`,
            "--editor",
        ]),
    ]),
    // Los chips de valor de la tabla resaltan con el tono "changed" a ambos lados.
    text("--diff-changed-foreground", "--diff-changed-inline", "changed characters in a value chip", ["--muted"]),

    // Grafo.
    text("--graph-text", "--graph-node-fill", "graph labels"),
    text("--graph-key", "--graph-node-fill", "graph keys"),
    text("--graph-string", "--graph-node-fill", "graph strings"),
    text("--graph-number", "--graph-node-fill", "graph numbers"),
    text("--graph-boolean", "--graph-node-fill", "graph booleans"),
    text("--graph-null", "--graph-node-fill", "graph nulls"),
    text("--graph-reference", "--graph-node-fill", "graph references"),
    ui("--graph-node-selected", "--graph-background", "selected node outline"),
    ui("--graph-node-match", "--graph-background", "search match outline"),
];

/*
 * Pares de tokens que tienen que cumplir WCAG AA en los dos temas.
 *
 * `fg` va sobre `bg`; si `bg` tiene alpha se compone sobre las capas `under`
 * (la última tiene que ser opaca). `min` es 4.5 para texto y 3 para
 * indicadores de UI (anillo de foco, bordes de campos, nodos del grafo).
 * `tokens.test.ts` recorre esta lista; `docs/design-system.md` publica los
 * resultados.
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

export const CONTRAST_PAIRS: ContrastPair[] = [
    // Texto de la UI sobre sus superficies.
    text("--foreground", "--background", "body text"),
    text("--card-foreground", "--card", "chrome text (header, toolbars, status bar)"),
    text("--popover-foreground", "--popover", "menus, popovers, toasts"),
    text("--muted-foreground", "--background", "secondary text on content"),
    text("--muted-foreground", "--card", "secondary text on chrome"),
    text("--muted-foreground", "--muted", "secondary text on muted fill"),
    text("--muted-foreground", "--popover", "shortcut hints in menus"),
    text("--primary-foreground", "--primary", "primary button"),
    text("--secondary-foreground", "--secondary", "secondary button"),
    text("--accent-foreground", "--accent", "hovered / pressed items"),
    text("--destructive-foreground", "--destructive", "destructive button"),
    text("--destructive", "--card", "error text in the status bar"),
    text("--destructive", "--popover", "error toast"),

    text("--foreground", "--editor-selection", "selected code", ["--background"]),
    text("--foreground", "--editor-active-line", "code on the active line", ["--background"]),

    // Indicadores de UI.
    ui("--ring", "--background", "focus ring on content"),
    ui("--ring", "--card", "focus ring on chrome"),
    ui("--ring", "--popover", "focus ring in popovers"),
    ui("--input", "--background", "input border on content"),
    ui("--input", "--card", "input border on chrome"),

    // Diff: texto del tipo y texto del documento sobre los fondos de diff.
    text("--diff-added", "--background", "Added label"),
    text("--diff-removed", "--background", "Removed label"),
    text("--diff-changed", "--background", "Changed label"),
    text("--diff-added", "--diff-added-row", "Added label on its row", ["--background"]),
    text("--diff-removed", "--diff-removed-row", "Removed label on its row", ["--background"]),
    text("--diff-changed", "--diff-changed-row", "Changed label on its row", ["--background"]),
    text("--diff-added", "--card", "Added filter on chrome"),
    text("--diff-removed", "--card", "Removed filter on chrome"),
    text("--diff-changed", "--card", "Changed filter on chrome"),
    text("--foreground", "--diff-added-line", "code on added line", ["--background"]),
    text("--foreground", "--diff-removed-line", "code on removed line", ["--background"]),
    text("--foreground", "--diff-changed-line", "code on changed line", ["--background"]),
    text("--foreground", "--diff-added-inline", "code on added chars", ["--diff-added-line", "--background"]),
    text("--foreground", "--diff-removed-inline", "code on removed chars", ["--diff-removed-line", "--background"]),
    text("--foreground", "--diff-changed-inline", "code on changed chars", ["--background"]),
    text("--foreground", "--diff-added-inline", "value on added chars (table)", ["--diff-added-row", "--background"]),
    text("--foreground", "--diff-removed-inline", "value on removed chars (table)", [
        "--diff-removed-row",
        "--background",
    ]),
    text("--accent-foreground", "--diff-added-inline", "selected row, added chars", ["--accent"]),
    text("--accent-foreground", "--diff-removed-inline", "selected row, removed chars", ["--accent"]),

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

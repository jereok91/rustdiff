/*
 * Diálogo de atajos (Ctrl+?), mismos grupos que `show_shortcuts_dialog` de la
 * GTK. Lista el set completo de la app; el único que todavía no tiene acción en
 * el shell Tauri es el grafo (Ctrl+G), que conecta F6.
 */

import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string[]][] }[] = [
    {
        title: "shortcuts.group_files",
        items: [
            ["shortcuts.open_left", ["Ctrl", "O"]],
            ["shortcuts.open_right", ["Ctrl", "Shift", "O"]],
        ],
    },
    {
        title: "shortcuts.group_compare",
        items: [
            ["shortcuts.compare", ["Ctrl", "Enter"]],
            ["shortcuts.format", ["Ctrl", "Shift", "F"]],
            ["shortcuts.search", ["Ctrl", "F"]],
            ["shortcuts.graph", ["Ctrl", "G"]],
            ["shortcuts.diff_panel", ["Ctrl", "D"]],
        ],
    },
    {
        title: "shortcuts.group_history",
        items: [
            ["shortcuts.save", ["Ctrl", "S"]],
            ["shortcuts.history", ["Ctrl", "H"]],
        ],
    },
    {
        title: "shortcuts.group_other",
        items: [
            ["shortcuts.export_txt", ["Ctrl", "E"]],
            ["shortcuts.font_increase", ["Ctrl", "+"]],
            ["shortcuts.font_decrease", ["Ctrl", "-"]],
            ["shortcuts.font_reset", ["Ctrl", "0"]],
            ["shortcuts.show", ["Ctrl", "?"]],
        ],
    },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{t("shortcuts.title")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                    {GROUPS.map((group) => (
                        <section key={group.title}>
                            <h3 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                                {t(group.title)}
                            </h3>
                            <ul className="grid gap-1 text-sm">
                                {group.items.map(([label, keys]) => (
                                    <li key={label} className="flex items-center justify-between gap-4">
                                        <span>{t(label)}</span>
                                        <span className="flex gap-1">
                                            {keys.map((key) => (
                                                <kbd
                                                    key={key}
                                                    className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

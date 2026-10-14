/*
 * Tabla simple de diferencias (provisoria): F4 la reemplaza por la versión con
 * filtros, click-to-jump y búsqueda. Mismas columnas que `diff_panel.rs`.
 */

import { useTranslation } from "react-i18next";

import type { DiffItem, DiffKind, DiffResult } from "@/bindings";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<DiffKind, string> = {
    Added: "diff.added_label",
    Removed: "diff.removed_label",
    Changed: "diff.changed_label",
};

const KIND_COLOR: Record<DiffKind, string> = {
    Added: "text-diff-added",
    Removed: "text-diff-removed",
    Changed: "text-diff-changed",
};

/** Mismo orden que el panel GTK: eliminados, añadidos, cambiados. */
export function diffRows(result: DiffResult | null): DiffItem[] {
    if (!result) {
        return [];
    }
    return [...result.removed, ...result.added, ...result.changed];
}

export function DiffTable({ result }: { result: DiffResult | null }) {
    const { t } = useTranslation();
    const rows = diffRows(result);

    if (rows.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                {t("panel.summary_none")}
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto">
            <table className="w-full border-collapse text-sm" data-testid="diff-table">
                <thead className="bg-card text-muted-foreground sticky top-0 text-left">
                    <tr>
                        <th className="border-b px-2 py-1 font-medium">{t("panel.col_type")}</th>
                        <th className="border-b px-2 py-1 font-medium">{t("panel.col_path")}</th>
                        <th className="border-b px-2 py-1 font-medium">{t("panel.col_left")}</th>
                        <th className="border-b px-2 py-1 font-medium">{t("panel.col_right")}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((item, index) => (
                        <tr key={`${item.kind}-${item.path}-${index}`} data-kind={item.kind} className="align-top">
                            <td className={cn("border-b px-2 py-1 whitespace-nowrap", KIND_COLOR[item.kind])}>
                                {t(KIND_LABEL[item.kind])}
                            </td>
                            <td className="border-b px-2 py-1 font-mono">{item.path}</td>
                            <td className="border-b px-2 py-1 font-mono break-all">{item.left ?? "—"}</td>
                            <td className="border-b px-2 py-1 font-mono break-all">{item.right ?? "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

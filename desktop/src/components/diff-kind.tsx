/*
 * Identidad visual de cada tipo de diferencia (el `diff-kind.tsx` del
 * prototipo): icono, marcador, insignia, punto y la ruta con sus tramos.
 * Verde/rojo/ámbar solo para diferencias, y siempre con marcador o palabra.
 */

import { Minus, PenLine, Plus, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DiffKind } from "@/bindings";
import { Badge } from "@/components/ui/badge";
import { pathSegments } from "@/lib/diff-rows";
import { cn } from "@/lib/utils";

export const KIND_META: Record<
    DiffKind,
    { label: string; filter: string; icon: LucideIcon; marker: string; variant: "added" | "removed" | "changed" }
> = {
    Added: { label: "diff.added_label", filter: "panel.filter_added", icon: Plus, marker: "+", variant: "added" },
    Removed: {
        label: "diff.removed_label",
        filter: "panel.filter_removed",
        icon: Minus,
        marker: "\u2212",
        variant: "removed",
    },
    Changed: {
        label: "diff.changed_label",
        filter: "panel.filter_changed",
        icon: PenLine,
        marker: "~",
        variant: "changed",
    },
};

/** Color base del tipo (puntos y barras: siempre acompañados de texto). */
const DOT: Record<DiffKind, string> = {
    Added: "bg-diff-added",
    Removed: "bg-diff-removed",
    Changed: "bg-diff-changed",
};

export function DiffKindBadge({ kind, className }: { kind: DiffKind; className?: string }) {
    const { t } = useTranslation();
    const { label, icon: Icon, variant } = KIND_META[kind];
    return (
        <Badge variant={variant} className={cn("gap-1 pl-1.5", className)}>
            <Icon strokeWidth={2.5} aria-hidden />
            {t(label)}
        </Badge>
    );
}

export function DiffDot({ kind, className }: { kind: DiffKind; className?: string }) {
    return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[kind], className)} />;
}

/**
 * Ruta con los ancestros atenuados y el último tramo resaltado. Los tramos
 * coloreados son decorativos; la ruta completa va como un único texto para
 * lectores de pantalla (y para buscarla tal cual).
 */
export function JsonPath({ path, className }: { path: string; className?: string }) {
    return (
        <span className={cn("font-mono text-code", className)}>
            <span className="sr-only">{path}</span>
            <span aria-hidden>
                {pathSegments(path).map((segment, index) => {
                    if (segment.kind === "root") {
                        return (
                            <span key={index} className="text-muted-foreground">
                                $
                            </span>
                        );
                    }
                    const tone = segment.last ? "text-foreground font-medium" : "text-muted-foreground";
                    if (segment.kind === "name" && segment.text.startsWith(".")) {
                        return (
                            <span key={index}>
                                <span className="text-muted-foreground">.</span>
                                <span className={tone}>{segment.text.slice(1)}</span>
                            </span>
                        );
                    }
                    return (
                        <span key={index} className={tone}>
                            {segment.text}
                        </span>
                    );
                })}
            </span>
        </span>
    );
}

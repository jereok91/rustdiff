/*
 * Barra de cabecera: mismas acciones y el mismo orden que la HeaderBar de la GTK.
 *
 * Export, History y Graph quedan como huecos deshabilitados que llenan F5/F6;
 * el toggle de Differences ya funciona porque la tabla simple existe desde F3.
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TextAlignStart, Download, FolderOpen, GitCompare, History, List, Network, SquareSplitHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FORMAT_CHOICES, type FormatChoice } from "@/lib/formats";
import { cn } from "@/lib/utils";

function WithTooltip({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export type AppHeaderProps = {
    /** `true` con los dos editores visibles (modo comparación). */
    comparing: boolean;
    /** `false` en la pantalla de bienvenida: las acciones sobre editores no aplican. */
    editorsVisible: boolean;
    formatChoice: FormatChoice;
    onFormatChoice: (choice: FormatChoice) => void;
    onOpenLeft: () => void;
    onOpenRight: () => void;
    onEnableComparison: () => void;
    onCompare: () => void;
    onFormat: () => void;
    diffPanelVisible: boolean;
    onToggleDiffPanel: () => void;
};

export function AppHeader(props: AppHeaderProps) {
    const { t } = useTranslation();
    const formatLabel = (choice: FormatChoice): string => {
        switch (choice) {
            case "auto":
                return t("header.format_auto");
            case "Text":
                return t("header.format_text");
            default:
                return choice.toUpperCase();
        }
    };

    return (
        <header className="bg-card flex h-12 shrink-0 items-center gap-1 border-b px-2">
            <WithTooltip label={t("header.open_left_tooltip")}>
                <Button variant="ghost" size="sm" onClick={props.onOpenLeft}>
                    <FolderOpen />
                    {t("header.open_left")}
                </Button>
            </WithTooltip>
            {props.comparing && (
                <WithTooltip label={t("header.open_right_tooltip")}>
                    <Button variant="ghost" size="sm" onClick={props.onOpenRight}>
                        <FolderOpen />
                        {t("header.open_right")}
                    </Button>
                </WithTooltip>
            )}
            {props.editorsVisible && !props.comparing && (
                <WithTooltip label={t("header.enable_comparison_tooltip")}>
                    <Button size="sm" onClick={props.onEnableComparison}>
                        <SquareSplitHorizontal />
                        {t("header.enable_comparison")}
                    </Button>
                </WithTooltip>
            )}
            {props.comparing && (
                <WithTooltip label={t("header.compare_tooltip")}>
                    <Button size="sm" onClick={props.onCompare}>
                        <GitCompare />
                        {t("header.compare")}
                    </Button>
                </WithTooltip>
            )}

            <div className="flex-1" />

            <Select value={props.formatChoice} onValueChange={(value) => props.onFormatChoice(value as FormatChoice)}>
                <SelectTrigger size="sm" aria-label={t("header.format_dropdown_tooltip")} className="w-36">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {FORMAT_CHOICES.map((choice) => (
                        <SelectItem key={choice} value={choice}>
                            {formatLabel(choice)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <WithTooltip label={t("header.format_tooltip")}>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("header.format")}
                    onClick={props.onFormat}
                    disabled={!props.editorsVisible}
                >
                    <TextAlignStart />
                </Button>
            </WithTooltip>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Huecos de F5 (export, historial) y F6 (grafo). */}
            <WithTooltip label={t("header.export_tooltip")}>
                <span>
                    <Button variant="ghost" size="icon-sm" aria-label={t("header.export")} disabled>
                        <Download />
                    </Button>
                </span>
            </WithTooltip>
            <WithTooltip label={t("header.history_tooltip")}>
                <span>
                    <Button variant="ghost" size="icon-sm" aria-label={t("header.history")} disabled>
                        <History />
                    </Button>
                </span>
            </WithTooltip>
            <WithTooltip label={t("graph.toggle_tooltip")}>
                <span>
                    <Button variant="ghost" size="icon-sm" aria-label={t("header.graph")} disabled>
                        <Network />
                    </Button>
                </span>
            </WithTooltip>
            <WithTooltip label={t("header.diff_panel_tooltip")}>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("header.diff_panel")}
                    aria-pressed={props.diffPanelVisible}
                    onClick={props.onToggleDiffPanel}
                    className={cn(props.diffPanelVisible && "bg-accent text-accent-foreground")}
                >
                    <List />
                </Button>
            </WithTooltip>
        </header>
    );
}

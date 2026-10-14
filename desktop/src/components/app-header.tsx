/*
 * Barra de cabecera: mismas acciones y el mismo orden que la HeaderBar de la GTK.
 *
 * Export (txt/html), History y el menú principal llegan en F5; el toggle de
 * la vista de grafo (Ctrl+G), en F6.
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TextAlignStart, Download, FolderOpen, GitCompare, History, List, Network, SquareSplitHorizontal } from "lucide-react";

import { MainMenu, type MainMenuProps } from "@/components/main-menu";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Estado "activado" de los toggles de la cabecera. */
const PRESSED = "bg-accent text-accent-foreground";

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
    historyVisible: boolean;
    onToggleHistory: () => void;
    graphVisible: boolean;
    onToggleGraph: () => void;
    /** Menú principal (formatear, exportar, atajos, idioma, tamaño de texto). */
    menu: Omit<MainMenuProps, "editorsVisible" | "onFormat">;
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
        <header className="bg-card text-card-foreground flex h-(--header-height) shrink-0 items-center gap-1 border-b px-2">
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

            <IconButton
                label={t("header.format")}
                tooltip={t("header.format_tooltip")}
                onClick={props.onFormat}
                disabled={!props.editorsVisible}
            >
                <TextAlignStart />
            </IconButton>

            <Separator orientation="vertical" className="mx-1 h-5" />

            <DropdownMenu>
                <WithTooltip label={t("header.export_tooltip")}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t("header.export")}>
                            <Download />
                        </Button>
                    </DropdownMenuTrigger>
                </WithTooltip>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => props.menu.onExport("txt")}>
                        {t("header.export_txt")}
                        <DropdownMenuShortcut>Ctrl+E</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => props.menu.onExport("html")}>
                        {t("header.export_html")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <IconButton
                label={t("header.history")}
                tooltip={t("header.history_tooltip")}
                aria-pressed={props.historyVisible}
                onClick={props.onToggleHistory}
                className={cn(props.historyVisible && PRESSED)}
            >
                <History />
            </IconButton>
            <IconButton
                label={t("header.graph")}
                tooltip={t("graph.toggle_tooltip")}
                aria-pressed={props.graphVisible}
                onClick={props.onToggleGraph}
                className={cn(props.graphVisible && PRESSED)}
            >
                <Network />
            </IconButton>
            <IconButton
                label={t("header.diff_panel")}
                tooltip={t("header.diff_panel_tooltip")}
                aria-pressed={props.diffPanelVisible}
                onClick={props.onToggleDiffPanel}
                className={cn(props.diffPanelVisible && PRESSED)}
            >
                <List />
            </IconButton>
            <MainMenu {...props.menu} editorsVisible={props.editorsVisible} onFormat={props.onFormat} />
        </header>
    );
}

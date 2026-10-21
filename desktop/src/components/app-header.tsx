/*
 * Barra de título de la app, con la composición del prototipo
 * (`docs/NuevaUX/rustdiff-ui/src/components/diff/app-header.tsx`):
 *
 *   marca | abrir A / B · formato + Format | (zona de arrastre) |
 *   vistas (historial, grafo, diferencias) | exportar, tema, menú | acción principal
 *
 * Es zona de arrastre de Tauri (`data-tauri-drag-region`) en la marca y el
 * hueco central; los controles no la heredan. La acción principal es una
 * sola: "Compare" (con su atajo) o, con un único editor, "Enable comparison".
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    Download,
    FolderOpen,
    History,
    List,
    Moon,
    Network,
    SquareSplitHorizontal,
    Sun,
    TextAlignStart,
} from "lucide-react";

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
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { segmentedGroup, segmentedItem, ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColorScheme } from "@/lib/theme";
import { FORMAT_CHOICES, type FormatChoice } from "@/lib/formats";
import { togglePanels, type PanelToggle } from "@/lib/header-views";

function WithTooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
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
    historyVisible: boolean;
    onToggleHistory: () => void;
    graphVisible: boolean;
    onToggleGraph: () => void;
    /** Esquema efectivo: el botón rápido alterna claro / oscuro (el menú tiene los tres). */
    scheme: ColorScheme;
    onToggleScheme: () => void;
    /** Menú principal (formatear, exportar, atajos, tema, idioma, tamaño de texto). */
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

    const views: { key: PanelToggle; label: string; tooltip: string; icon: ReactNode; on: boolean }[] = [
        {
            key: "history",
            label: t("header.history"),
            tooltip: t("header.history_tooltip"),
            icon: <History />,
            on: props.historyVisible,
        },
        {
            key: "graph",
            label: t("header.graph"),
            tooltip: t("graph.toggle_tooltip"),
            icon: <Network />,
            on: props.graphVisible,
        },
        {
            key: "diff",
            label: t("header.diff_panel"),
            tooltip: t("header.diff_panel_tooltip"),
            icon: <List />,
            on: props.diffPanelVisible,
        },
    ];
    const onViews = (next: string[]) => {
        for (const key of togglePanels(
            views.filter((v) => v.on).map((v) => v.key),
            next as PanelToggle[],
        )) {
            if (key === "history") props.onToggleHistory();
            else if (key === "graph") props.onToggleGraph();
            else props.onToggleDiffPanel();
        }
    };

    return (
        <header
            data-tauri-drag-region
            className="bg-titlebar text-foreground @container flex h-(--header-height) shrink-0 items-center gap-2 border-b px-3"
        >
            {/* Marca */}
            <div className="flex shrink-0 items-center gap-2" data-tauri-drag-region>
                {/* La marca es el icono de la app, el mismo de la bienvenida
                    (`public/com.digitalgex.RustDiff.svg`). */}
                <img src="/com.digitalgex.RustDiff.svg" alt="" aria-hidden className="size-6 shrink-0 rounded-md" />
                <span className="hidden text-body font-semibold tracking-tight @3xl:inline" data-tauri-drag-region>
                    {t("app.title")}
                </span>
            </div>

            <Separator orientation="vertical" className="mx-1 h-5!" />

            {/* Documentos */}
            <div className="flex shrink-0 items-center">
                <WithTooltip label={t("header.open_left_tooltip")}>
                    <Button variant="ghost" size="sm" onClick={props.onOpenLeft}>
                        <FolderOpen />
                        <span className="hidden @4xl:inline">{t("header.open_left")}</span>
                        <span className="@4xl:hidden" aria-hidden>
                            A
                        </span>
                    </Button>
                </WithTooltip>
                {props.comparing && (
                    <WithTooltip label={t("header.open_right_tooltip")}>
                        <Button variant="ghost" size="sm" onClick={props.onOpenRight}>
                            <FolderOpen />
                            <span className="hidden @4xl:inline">{t("header.open_right")}</span>
                            <span className="@4xl:hidden" aria-hidden>
                                B
                            </span>
                        </Button>
                    </WithTooltip>
                )}
            </div>

            <Select value={props.formatChoice} onValueChange={(value) => props.onFormatChoice(value as FormatChoice)}>
                <SelectTrigger
                    size="sm"
                    aria-label={t("header.format_dropdown_tooltip")}
                    className="h-8 shrink-0 justify-start gap-1.5 text-caption"
                >
                    <span className="text-muted-foreground hidden @5xl:inline">{t("header.format_prefix")}</span>
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

            {/* Zona de arrastre */}
            <div className="min-w-4 flex-1 self-stretch" data-tauri-drag-region />

            {/* Vistas: toggles independientes en un control segmentado */}
            <ToggleGroup
                type="multiple"
                size="sm"
                value={views.filter((v) => v.on).map((v) => v.key)}
                onValueChange={onViews}
                className={segmentedGroup}
                aria-label={t("header.views")}
            >
                {views.map((view) => (
                    <Tooltip key={view.key}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem value={view.key} aria-label={view.label} className={segmentedItem}>
                                {view.icon}
                                <span className="hidden @6xl:inline">{view.label}</span>
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>{view.tooltip}</TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>

            <div className="flex shrink-0 items-center">
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
                    label={t(props.scheme === "dark" ? "header.theme_to_light" : "header.theme_to_dark")}
                    onClick={props.onToggleScheme}
                >
                    {props.scheme === "dark" ? <Sun /> : <Moon />}
                </IconButton>
                <MainMenu {...props.menu} editorsVisible={props.editorsVisible} onFormat={props.onFormat} />
            </div>

            {/* Acción principal: una sola por vista */}
            {props.comparing && (
                <WithTooltip label={t("header.compare_tooltip")}>
                    <Button size="sm" onClick={props.onCompare} className="shrink-0 gap-2 pr-2">
                        {t("header.compare")}
                        <KbdGroup aria-hidden>
                            <Kbd>Ctrl</Kbd>
                            <Kbd>↵</Kbd>
                        </KbdGroup>
                    </Button>
                </WithTooltip>
            )}
            {props.editorsVisible && !props.comparing && (
                <WithTooltip label={t("header.enable_comparison_tooltip")}>
                    <Button size="sm" onClick={props.onEnableComparison} className="shrink-0">
                        <SquareSplitHorizontal />
                        {t("header.enable_comparison")}
                    </Button>
                </WithTooltip>
            )}
        </header>
    );
}

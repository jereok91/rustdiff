/*
 * Menú principal (el `MenuButton` "open-menu" de la GTK): formatear, exportar,
 * atajos, idioma (aplicado en caliente) y tamaño del texto.
 */

import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LanguageSetting } from "@/hooks/use-preferences";
import type { ExportKind } from "@/lib/export";
import type { ScaleStep } from "@/lib/ui-scale";

export type MainMenuProps = {
    editorsVisible: boolean;
    onFormat: () => void;
    onExport: (kind: ExportKind) => void;
    onShowShortcuts: () => void;
    language: LanguageSetting;
    onLanguage: (language: LanguageSetting) => void;
    uiScalePercent: number;
    onUiScale: (step: ScaleStep) => void;
};

export function MainMenu(props: MainMenuProps) {
    const { t } = useTranslation();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("menu.tooltip")} title={t("menu.tooltip")}>
                    <Menu />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem disabled={!props.editorsVisible} onSelect={props.onFormat}>
                    {t("menu.format_documents")}
                    <DropdownMenuShortcut>Ctrl+Shift+F</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => props.onExport("txt")}>
                    {t("menu.export_txt")}
                    <DropdownMenuShortcut>Ctrl+E</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => props.onExport("html")}>{t("menu.export_html")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onShowShortcuts}>
                    {t("menu.shortcuts")}
                    <DropdownMenuShortcut>Ctrl+?</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{t("menu.language")}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                            value={props.language}
                            onValueChange={(value) => props.onLanguage(value as LanguageSetting)}
                        >
                            <DropdownMenuRadioItem value="auto">{t("menu.language_auto")}</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="en">{t("menu.language_en")}</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="es">{t("menu.language_es")}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        {t("menu.font_size")}
                        <DropdownMenuShortcut>{props.uiScalePercent}%</DropdownMenuShortcut>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {/* `preventDefault` deja el menú abierto para encadenar pasos. */}
                        <DropdownMenuItem
                            onSelect={(event) => {
                                event.preventDefault();
                                props.onUiScale("increase");
                            }}
                        >
                            {t("menu.font_increase")}
                            <DropdownMenuShortcut>Ctrl++</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={(event) => {
                                event.preventDefault();
                                props.onUiScale("decrease");
                            }}
                        >
                            {t("menu.font_decrease")}
                            <DropdownMenuShortcut>Ctrl+-</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={(event) => {
                                event.preventDefault();
                                props.onUiScale("reset");
                            }}
                        >
                            {t("menu.font_reset")}
                            <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

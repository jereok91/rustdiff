/*
 * Diálogo de salida con contenido sin guardar (el `AlertDialog` de
 * `connect_close_request` en la GTK): las mismas cinco respuestas, "Close
 * without saving" en rojo y Cancel como respuesta por defecto y de cierre.
 *
 * La tarjeta sigue el diseño de referencia: barra ámbar de aviso, icono,
 * insignia "sin guardar", la franja con el resumen de la sesión, las dos
 * exportaciones agrupadas y el pie con los atajos reales (Escape cancela,
 * Ctrl/Cmd+S guarda en el historial, que es el único atajo que anuncia).
 *
 * Orden de foco: Cancel recibe el foco al abrir y la respuesta destructiva es la
 * última del Tab, detrás de las dos exportaciones y de guardar, así un Tab y un
 * Enter apurados nunca descartan el trabajo (el mockup ponía la destructiva
 * justo después de Cancel: eso es un Tab de distancia de perder datos). Escape
 * equivale a Cancel.
 */

import { FileCode2, FileText, HardDriveDownload, Info, Save, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ExitChoice = "save_history" | "export_txt" | "export_html" | "close";

export type ExitDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChoose: (choice: ExitChoice) => void;
    /** Modificaciones pendientes, para el resumen de la franja. */
    pendingChanges?: number;
};

export function ExitDialog({ open, onOpenChange, onChoose, pendingChanges = 0 }: ExitDialogProps) {
    const { t } = useTranslation();
    const choose = (choice: ExitChoice) => {
        onOpenChange(false);
        onChoose(choice);
    };
    // Ctrl/Cmd+S guarda en el historial: el atajo que anuncia el pie.
    const onKeyDown = (event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            choose("save_history");
        }
    };
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent
                data-testid="exit-dialog"
                onKeyDown={onKeyDown}
                className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
            >
                <div className="bg-warning h-1 w-full" aria-hidden />
                <div className="p-6 pb-5">
                    <div className="flex items-start gap-4">
                        <div className="bg-warning/15 text-warning-foreground grid size-12 shrink-0 place-items-center rounded-xl">
                            <HardDriveDownload className="size-6" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                                <AlertDialogTitle className="text-title">
                                    {t("exit.dialog_title")}
                                </AlertDialogTitle>
                                <span className="border-warning/40 bg-warning/10 text-warning-foreground text-caption rounded-full border px-3 py-1 font-medium whitespace-nowrap">
                                    {t("exit.unsaved_badge")}
                                </span>
                            </div>
                            <AlertDialogDescription className="text-muted-foreground text-body mt-2">
                                {t("exit.dialog_body")}
                            </AlertDialogDescription>
                        </div>
                    </div>

                    <div className="bg-muted/40 mt-5 flex items-center gap-3 rounded-lg border px-4 py-3">
                        <Info className="text-primary size-4 shrink-0" aria-hidden />
                        <span className="text-body">
                            {t("exit.session_summary", { count: pendingChanges })}
                        </span>
                        <span className="text-muted-foreground text-caption ml-auto whitespace-nowrap">
                            {t("exit.memory_only")}
                        </span>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                        <span className="text-muted-foreground text-body shrink-0">{t("exit.export_to")}</span>
                        <div className="grid flex-1 grid-cols-2 gap-3">
                            <Button variant="outline" onClick={() => choose("export_html")}>
                                <FileCode2 aria-hidden />
                                {t("exit.export_html")}
                            </Button>
                            <Button variant="outline" onClick={() => choose("export_txt")}>
                                <FileText aria-hidden />
                                {t("exit.export_txt")}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="bg-muted/30 flex flex-wrap items-center gap-2 border-t px-6 py-4">
                    <AlertDialogCancel autoFocus className="mt-0 mr-auto">
                        {t("exit.cancel")}
                        <kbd
                            aria-hidden
                            className="bg-background/60 text-muted-foreground text-caption ml-1 hidden rounded border px-1.5 py-0.5 font-sans sm:inline"
                        >
                            Esc
                        </kbd>
                    </AlertDialogCancel>
                    <Button onClick={() => choose("save_history")}>
                        <Save aria-hidden />
                        {t("exit.save_history")}
                        <kbd
                            aria-hidden
                            className="bg-primary-foreground/15 text-caption ml-1 hidden rounded px-1.5 py-0.5 font-sans sm:inline"
                        >
                            Ctrl+S
                        </kbd>
                    </Button>
                    {/* Última del Tab: un Tab y un Enter apurados desde Cancel nunca
                     * descartan el trabajo (hallazgos R2-1 y R3-TAB-DESTRUCTIVE). */}
                    <Button
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => choose("close")}
                    >
                        <Trash2 aria-hidden />
                        {t("exit.close_without_saving")}
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

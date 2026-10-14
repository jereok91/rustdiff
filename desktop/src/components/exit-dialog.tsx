/*
 * Diálogo de salida con contenido sin guardar (el `AlertDialog` de
 * `connect_close_request` en la GTK): las mismas cinco respuestas, "Close
 * without saving" destructivo y Cancel como respuesta por defecto y de cierre.
 */

import { useTranslation } from "react-i18next";

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ExitChoice = "save_history" | "export_txt" | "export_html" | "close";

export type ExitDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChoose: (choice: ExitChoice) => void;
};

export function ExitDialog({ open, onOpenChange, onChoose }: ExitDialogProps) {
    const { t } = useTranslation();
    const choose = (choice: ExitChoice) => {
        onOpenChange(false);
        onChoose(choice);
    };
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent data-testid="exit-dialog" className="sm:max-w-xl">
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("exit.dialog_title")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("exit.dialog_body")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-wrap">
                    <AlertDialogCancel autoFocus>{t("exit.cancel")}</AlertDialogCancel>
                    <Button variant="outline" onClick={() => choose("export_html")}>
                        {t("exit.export_html")}
                    </Button>
                    <Button variant="outline" onClick={() => choose("export_txt")}>
                        {t("exit.export_txt")}
                    </Button>
                    <Button onClick={() => choose("save_history")}>{t("exit.save_history")}</Button>
                    <Button variant="destructive" onClick={() => choose("close")}>
                        {t("exit.close_without_saving")}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

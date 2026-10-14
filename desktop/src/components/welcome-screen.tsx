/*
 * Pantalla de bienvenida (`build_welcome_screen` de la GTK): icono, título,
 * el flujo en tres pasos, dos acciones principales y enlaces secundarios,
 * en una tarjeta centrada.
 */

import { useTranslation } from "react-i18next";
import { FileText, GitCompare, History, Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";

export type WelcomeScreenProps = {
    onOpenDocument: () => void;
    onNewComparison: () => void;
    onShowShortcuts: () => void;
    onViewHistory: () => void;
};

/** Icono de la app (copia de `data/icons/com.digitalgex.RustDiff.svg` en `public/`). */
const APP_ICON = "/com.digitalgex.RustDiff.svg";

export function WelcomeScreen({ onOpenDocument, onNewComparison, onShowShortcuts, onViewHistory }: WelcomeScreenProps) {
    const { t } = useTranslation();
    const steps = [t("welcome.step1"), t("welcome.step2"), t("welcome.step3")];

    return (
        <section className="flex h-full items-center justify-center overflow-auto p-8" data-testid="welcome">
            <div className="bg-card text-card-foreground flex w-full max-w-xl flex-col items-center gap-6 rounded-xl border px-10 py-10 text-center shadow-sm">
                <img src={APP_ICON} alt="" width={80} height={80} className="size-20 drop-shadow-sm" />

                <div className="flex flex-col gap-1">
                    <h1 className="text-display font-bold tracking-tight">{t("app.title")}</h1>
                    <p className="text-muted-foreground text-body">{t("welcome.subtitle")}</p>
                </div>

                <ol className="grid w-full grid-cols-3 gap-3">
                    {steps.map((step, index) => (
                        <li
                            key={step}
                            className="bg-background flex flex-col items-center gap-2 rounded-lg border px-3 py-3"
                        >
                            <span
                                aria-hidden
                                className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-caption font-semibold"
                            >
                                {index + 1}
                            </span>
                            <span className="text-muted-foreground text-caption">{step}</span>
                        </li>
                    ))}
                </ol>

                <div className="flex flex-wrap justify-center gap-3">
                    <Button size="lg" className="min-w-48" onClick={onOpenDocument}>
                        <FileText />
                        {t("welcome.open_document")}
                    </Button>
                    <Button size="lg" variant="outline" className="min-w-48" onClick={onNewComparison}>
                        <GitCompare />
                        {t("welcome.new_comparison")}
                    </Button>
                </div>

                <div className="flex w-full flex-wrap justify-center gap-2 border-t pt-4">
                    <Button variant="ghost" size="sm" onClick={onViewHistory}>
                        <History />
                        {t("welcome.view_history")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onShowShortcuts}>
                        <Keyboard />
                        {t("welcome.shortcuts")}
                    </Button>
                </div>
            </div>
        </section>
    );
}

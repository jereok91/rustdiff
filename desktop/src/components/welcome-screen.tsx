/*
 * Pantalla de bienvenida (`build_welcome_screen` de la GTK): título, el flujo
 * en tres pasos, dos acciones principales y enlaces secundarios.
 */

import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { FileText, GitCompare } from "lucide-react";

import { Button } from "@/components/ui/button";

export type WelcomeScreenProps = {
    onOpenDocument: () => void;
    onNewComparison: () => void;
    onShowShortcuts: () => void;
    onViewHistory: () => void;
};

export function WelcomeScreen({ onOpenDocument, onNewComparison, onShowShortcuts, onViewHistory }: WelcomeScreenProps) {
    const { t } = useTranslation();
    const steps = [t("welcome.step1"), t("welcome.step2"), t("welcome.step3")];

    return (
        <section className="flex h-full flex-col items-center justify-center gap-2 p-10" data-testid="welcome">
            <h1 className="text-3xl font-bold">{t("app.title")}</h1>
            <p className="text-muted-foreground mb-5">{t("welcome.subtitle")}</p>

            <ol className="text-muted-foreground mb-6 flex items-center gap-2.5 text-xs">
                {steps.map((step, index) => (
                    <Fragment key={step}>
                        {index > 0 && <span aria-hidden>→</span>}
                        <li>{step}</li>
                    </Fragment>
                ))}
            </ol>

            <div className="mb-3 flex gap-3">
                <Button className="w-52 rounded-full" onClick={onOpenDocument}>
                    <FileText />
                    {t("welcome.open_document")}
                </Button>
                <Button variant="outline" className="w-52 rounded-full" onClick={onNewComparison}>
                    <GitCompare />
                    {t("welcome.new_comparison")}
                </Button>
            </div>

            <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onViewHistory}>
                    {t("welcome.view_history")}
                </Button>
                <Button variant="ghost" size="sm" onClick={onShowShortcuts}>
                    {t("welcome.shortcuts")}
                </Button>
            </div>
        </section>
    );
}

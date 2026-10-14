/* Barra de estado inferior: el `status_label` de la GTK. */

import { useTranslation } from "react-i18next";

import { renderStatus, type StatusMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function StatusBar({ message }: { message: StatusMessage }) {
    const { t } = useTranslation();
    return (
        <footer
            role="status"
            data-testid="status"
            className={cn(
                "bg-card shrink-0 truncate border-t px-3 py-1 text-caption",
                message.error ? "text-destructive" : "text-muted-foreground",
            )}
        >
            {renderStatus(message, (key, params) => t(key, params ?? {}))}
        </footer>
    );
}

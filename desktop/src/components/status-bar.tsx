/*
 * Barra de estado inferior: el `status_label` de la GTK con el aspecto del
 * prototipo (punto de estado, texto, y el formato detectado a la derecha).
 * Solo el mensaje está en la región `role="status"`; el resto es contexto.
 */

import { useTranslation } from "react-i18next";

import { renderStatus, type StatusMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type StatusTone = "idle" | "ok" | "error";

const DOT: Record<StatusTone, string> = {
    idle: "bg-muted-foreground",
    ok: "bg-diff-added",
    error: "bg-destructive",
};

export function StatusBar({ message, format }: { message: StatusMessage; format?: string | null }) {
    const { t } = useTranslation();
    const tone: StatusTone = message.error ? "error" : format ? "ok" : "idle";
    return (
        <footer className="bg-titlebar text-muted-foreground flex h-7 shrink-0 items-center gap-4 border-t px-3 text-caption">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
            <span
                role="status"
                data-testid="status"
                className={cn("-ml-2.5 min-w-0 flex-1 truncate", message.error ? "text-destructive" : "text-foreground")}
            >
                {renderStatus(message, (key, params) => t(key, params ?? {}))}
            </span>
            {format && <span className="shrink-0">{format} · UTF-8</span>}
        </footer>
    );
}

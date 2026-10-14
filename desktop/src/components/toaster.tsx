/* Pila de avisos efímeros abajo a la derecha (ver `lib/toast`). */

import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";

import { renderStatus } from "@/lib/errors";
import { dismissToast, getToasts, subscribeToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
    const { t } = useTranslation();
    const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
    if (toasts.length === 0) {
        return null;
    }
    return (
        <ol
            aria-live="polite"
            data-testid="toaster"
            className="pointer-events-none fixed right-4 bottom-10 z-[60] flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2"
        >
            {toasts.map((item) => (
                <li
                    key={item.id}
                    role={item.variant === "error" ? "alert" : "status"}
                    className={cn(
                        "bg-popover text-popover-foreground pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg",
                        item.variant === "error" && "border-destructive/50 text-destructive",
                    )}
                >
                    <span className="min-w-0 flex-1 break-words">
                        {renderStatus(item.message, (key, params) => t(key, params ?? {}))}
                    </span>
                    <button
                        type="button"
                        aria-label={t("toast.dismiss")}
                        className="opacity-60 hover:opacity-100"
                        onClick={() => dismissToast(item.id)}
                    >
                        <XIcon className="size-4" />
                    </button>
                </li>
            ))}
        </ol>
    );
}

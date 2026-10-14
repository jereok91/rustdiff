/*
 * Barra lateral del historial (`history_panel` de la GTK): título con
 * "Clear all", búsqueda, lista de sesiones (click = restaurar en los dos
 * editores, papelera = borrar esa sesión), estado vacío y "Load more".
 *
 * Borrar todo pide confirmación con el mismo diálogo destructivo que la GTK;
 * si el historial ya está vacío solo avisa.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Trash2, X } from "lucide-react";

import { commands, type Session } from "@/bindings";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { useHistory } from "@/hooks/use-history";
import { type StatusMessage, toCommandError } from "@/lib/errors";
import { formatDisplayName } from "@/lib/formats";
import { historyErrorStatus, summaryShort } from "@/lib/history";
import { cn } from "@/lib/utils";

export type HistorySidebarProps = {
    open: boolean;
    /** Cambia cuando la app guardó una sesión: la lista se recarga. */
    refreshToken: number;
    onRestore: (id: number) => void;
    onStatus: (message: StatusMessage) => void;
    onClose: () => void;
};

export function HistorySidebar({ open, refreshToken, onRestore, onStatus, onClose }: HistorySidebarProps) {
    const { t } = useTranslation();
    const history = useHistory(commands, open, refreshToken);
    const [confirmClear, setConfirmClear] = useState(false);

    const askClear = async () => {
        try {
            if ((await commands.historyCount()) === 0) {
                onStatus({ key: "history.status_already_empty" });
                return;
            }
            setConfirmClear(true);
        } catch (error) {
            onStatus(historyErrorStatus(toCommandError(error), { key: "history.status_clear_failed", error: true }));
        }
    };

    const clearAll = async () => {
        try {
            const count = await commands.historyClear();
            onStatus({ key: "history.status_cleared", params: { count } });
        } catch (error) {
            onStatus(historyErrorStatus(toCommandError(error), { key: "history.status_clear_failed", error: true }));
        }
        history.reload();
    };

    const remove = async (session: Session) => {
        try {
            await commands.historyDelete(session.id);
        } catch (error) {
            const err = toCommandError(error);
            onStatus(historyErrorStatus(err, { key: "errors.generic", params: { error: err.message }, error: true }));
        }
        history.reload();
    };

    if (!open) {
        return null;
    }

    return (
        <aside
            className="bg-card text-card-foreground flex h-full w-(--sidebar-width) shrink-0 flex-col border-r"
            aria-label={t("history.title")}
            data-testid="history-sidebar"
        >
            <div className="flex h-(--toolbar-height) shrink-0 items-center gap-1 border-b pr-1 pl-3">
                <h2 className="flex-1 truncate text-body font-semibold">{t("history.title")}</h2>
                <IconButton label={t("history.clear_tooltip")} onClick={() => void askClear()}>
                    <Trash2 />
                </IconButton>
                <IconButton label={t("history.close")} onClick={onClose}>
                    <X />
                </IconButton>
            </div>

            <div className="relative border-b p-2">
                <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
                    aria-hidden
                />
                <Input
                    type="search"
                    value={history.query}
                    onChange={(event) => history.setQuery(event.target.value)}
                    placeholder={t("history.search_placeholder")}
                    aria-label={t("history.search_placeholder")}
                    className="pl-8"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {history.sessions.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-6 text-center text-body" data-testid="history-empty">
                        {history.error?.code === "HistoryUnavailable"
                            ? t("history.status_unavailable")
                            : history.loading
                              ? ""
                              : t("history.empty")}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-px p-1" data-testid="history-list">
                        {history.sessions.map((session) => {
                            const short = summaryShort(session.diff_summary);
                            const summary = typeof short === "string" ? short : t(short.key);
                            return (
                                <li
                                    key={session.id}
                                    className="group hover:bg-accent hover:text-accent-foreground flex items-center gap-1 rounded-md pr-1 transition-colors"
                                >
                                    <button
                                        type="button"
                                        className="focus-ring-inset min-w-0 flex-1 rounded-md px-2 py-1.5 text-left"
                                        onClick={() => onRestore(session.id)}
                                    >
                                        <span className="block truncate text-body">
                                            #{session.id} {formatDisplayName(session.format)} {summary}
                                        </span>
                                        <span className="text-muted-foreground block truncate font-mono text-caption">
                                            {session.created_at}
                                        </span>
                                    </button>
                                    <IconButton
                                        label={t("history.delete_tooltip")}
                                        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                                        onClick={() => void remove(session)}
                                    >
                                        <Trash2 />
                                    </IconButton>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {history.hasMore && (
                    <div className="p-2">
                        <Button variant="outline" size="sm" className="w-full" onClick={history.loadMore}>
                            {t("history.load_more")}
                        </Button>
                    </div>
                )}
            </div>

            <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("history.clear_dialog_title")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("history.clear_dialog_body")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("history.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            className={cn(buttonVariants({ variant: "destructive" }))}
                            onClick={() => void clearAll()}
                        >
                            {t("history.clear_confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </aside>
    );
}

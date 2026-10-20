/*
 * Shell de la app: cabecera, bienvenida, dos editores CodeMirror, panel de
 * diferencias (F4), barra de búsqueda (F4) y barra de estado.
 *
 * Paridad con `src/ui/main_window.rs`:
 *   - Bienvenida hasta cargar un documento o pulsar "New comparison".
 *   - "Open document" abre un archivo en modo documento único; "Enable
 *     comparison" revela el editor derecho.
 *   - Auto-compare con debounce de 500 ms (`DEBOUNCE_MS`) + Compare manual.
 *   - Resaltado de líneas y caracteres en ambos editores (`lib/line-diff`).
 *   - Click en una fila de la tabla: salto y destello en los dos editores
 *     (`highlight_and_scroll_to_item`, ver `lib/locate`).
 *   - Ctrl+F: búsqueda en el último editor enfocado (`connect_search_bar`).
 *   - Historial (F5): barra lateral (Ctrl+H), guardar sesión (Ctrl+S),
 *     restaurar en los dos editores, borrar y vaciar con confirmación.
 *   - Export .txt/.html (Ctrl+E) por diálogo de guardado y el backend.
 *   - Menú principal: tema (sistema / claro / oscuro, F7), idioma en caliente
 *     y escala del texto (Ctrl++/-/0).
 *   - Diálogo de salida si hay contenido sin guardar (`connect_close_request`).
 *   - Vista de grafo del documento izquierdo (F6, Ctrl+G): ocupa el hueco del
 *     editor derecho, así que grafo y comparación se excluyen
 *     (`connect_graph_toggle`); abrirla oculta el panel de diferencias y
 *     cerrarla lo restaura si estaba visible.
 *
 * Todo el parseo, la detección y el disco pasan por `commands.*` (S8).
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileCode, FolderOpen, X } from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { commands, type DiffItem, type DiffResponse, type FileContents, type Format } from "@/bindings";
import { AppHeader } from "@/components/app-header";
import { CodeEditor, type CodeEditorHandle } from "@/components/code-editor";
import { DiffTable } from "@/components/diff-table";
import { type ExitChoice, ExitDialog } from "@/components/exit-dialog";
import { GraphView } from "@/components/graph-view";
import { HistorySidebar } from "@/components/history-sidebar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SearchBar, type SearchBarHandle } from "@/components/search-bar";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { StatusBar } from "@/components/status-bar";
import { Toaster } from "@/components/toaster";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeScreen } from "@/components/welcome-screen";
import { closeWindowNow, useCloseGuard } from "@/hooks/use-close-guard";
import { useTheme } from "@/hooks/use-color-scheme";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { usePreferences } from "@/hooks/use-preferences";
import { type ShortcutAction, useShortcuts } from "@/hooks/use-shortcuts";
import { DEFAULT_FILTERS, type KindFilters } from "@/lib/diff-rows";
import {
    compareErrorStatus,
    formatErrorStatus,
    openErrorStatus,
    type StatusMessage,
    summaryStatus,
    toCommandError,
} from "@/lib/errors";
import { defaultReportName, type ExportKind, exportReport, exportStatus } from "@/lib/export";
import { editorLanguage, formatArg, formatDisplayName, type FormatChoice } from "@/lib/formats";
import { MAX_GRAPH_NODES, truncationToastNeeded } from "@/lib/graph-view";
import { historyErrorStatus, restoredStatus } from "@/lib/history";
import { buildDiffDecorations, type DiffDecorations, EMPTY_DECORATIONS } from "@/lib/line-diff";
import { itemJumpTargets } from "@/lib/locate";
import { toast } from "@/lib/toast";
import { uiScalePercent } from "@/lib/ui-scale";
import { type EditorSnapshot, hasUnsavedContent } from "@/lib/unsaved";
import { lineCount } from "@/lib/text-stats";

type Side = "left" | "right";

const READY: StatusMessage = { key: "app.status_ready" };

export default function App() {
    const { t } = useTranslation();
    const theme = useTheme();
    const scheme = theme.scheme;

    const [view, setView] = useState<"welcome" | "editors">("welcome");
    const [comparing, setComparing] = useState(false);
    const [left, setLeft] = useState("");
    const [right, setRight] = useState("");
    const [formatChoice, setFormatChoice] = useState<FormatChoice>("auto");
    const [detected, setDetected] = useState<Format | null>(null);
    const [response, setResponse] = useState<DiffResponse | null>(null);
    const [decorations, setDecorations] = useState<DiffDecorations>(EMPTY_DECORATIONS);
    // JSON con comillas escapadas (pegado desde un log): el nodo se ofrece, no
    // se aplica solo. `escapedDismissed` recuerda el texto que el usuario ya
    // descartó para no volver a sugerirlo en cada comparación.
    const [escapedSuggestion, setEscapedSuggestion] = useState<{
        side: Side;
        source: string;
        text: string;
    } | null>(null);
    const escapedDismissed = useRef<string | null>(null);
    const [status, setStatus] = useState<StatusMessage>(READY);
    const [diffPanelVisible, setDiffPanelVisible] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [diffFilters, setDiffFilters] = useState<KindFilters>(DEFAULT_FILTERS);
    const [focusedSide, setFocusedSide] = useState<Side>("left");
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyRefresh, setHistoryRefresh] = useState(0);
    const [exitOpen, setExitOpen] = useState(false);
    const [graphOpen, setGraphOpen] = useState(false);
    // Nombre del archivo abierto en cada panel (solo para la cabecera del panel).
    const [fileNames, setFileNames] = useState<Record<Side, string | null>>({ left: null, right: null });
    const preferences = usePreferences();

    const leftEditor = useRef<CodeEditorHandle>(null);
    const rightEditor = useRef<CodeEditorHandle>(null);
    const searchBar = useRef<SearchBarHandle>(null);

    // Espejo síncrono del estado que leen las operaciones asíncronas.
    const latest = useRef({ left, right, comparing, formatChoice });
    latest.current = { left, right, comparing, formatChoice };
    // Cada comparación lleva un número; solo la última pinta resultados.
    const sequence = useRef(0);
    // Última comparación exitosa: la que se guarda o se exporta.
    const responseRef = useRef<DiffResponse | null>(null);
    responseRef.current = response;
    // Texto de los editores la última vez que se guardó o restauró del historial.
    const savedSnapshot = useRef<EditorSnapshot | null>(null);
    // Vista de grafo: espejos síncronos y la preferencia del panel de
    // diferencias que se restaura al cerrarla (`diff_panel_pref` de la GTK).
    const graphOpenRef = useRef(graphOpen);
    graphOpenRef.current = graphOpen;
    const diffPanelVisibleRef = useRef(diffPanelVisible);
    diffPanelVisibleRef.current = diffPanelVisible;
    const diffPanelPref = useRef(diffPanelVisible);
    // Si el último grafo construido estaba truncado (el aviso sale solo en la transición).
    const graphTruncated = useRef(false);

    const clearDiff = useCallback(() => {
        setResponse(null);
        setDecorations(EMPTY_DECORATIONS);
    }, []);

    /** `execute_diff` de la GTK. */
    const runCompare = useCallback(async () => {
        const { left: l, right: r, comparing: both, formatChoice: choice } = latest.current;
        const seq = ++sequence.current;

        if (!both || l.trim() === "" || r.trim() === "") {
            clearDiff();
            // Sin comparación posible, el lenguaje del editor sale del izquierdo.
            if (l.trim() !== "" && choice === "auto") {
                commands
                    .detectFormat(l)
                    .then((fmt) => seq === sequence.current && setDetected(fmt))
                    .catch(() => undefined);
            }
            if (both) {
                setStatus({ key: "compare.need_input" });
            }
            return;
        }

        // El parser rechaza la forma escapada y cae al diff de texto, así que
        // la sugerencia se calcula aparte de la comparación.
        void (async () => {
            const [leftEscaped, rightEscaped] = await Promise.all([
                commands.unescapeJson(l).catch(() => null),
                commands.unescapeJson(r).catch(() => null),
            ]);
            if (seq !== sequence.current) {
                return;
            }
            const suggestion = leftEscaped
                ? { side: "left" as const, source: l, text: leftEscaped }
                : rightEscaped
                  ? { side: "right" as const, source: r, text: rightEscaped }
                  : null;
            setEscapedSuggestion(suggestion && suggestion.source !== escapedDismissed.current ? suggestion : null);
        })();

        try {
            const resp = await commands.diffDocuments(l, r, formatArg(choice));
            const decos = await buildDiffDecorations(l, r, resp.result, commands.inlineCharRanges);
            if (seq !== sequence.current) {
                return;
            }
            setResponse(resp);
            setDetected(resp.format);
            const current = latest.current;
            // Si el texto cambió mientras viajaba el IPC, los offsets ya no
            // sirven: el próximo auto-compare los recalcula.
            setDecorations(current.left === l && current.right === r ? decos : EMPTY_DECORATIONS);
            setStatus(
                summaryStatus(
                    {
                        added: resp.result.added.length,
                        removed: resp.result.removed.length,
                        changed: resp.result.changed.length,
                    },
                    formatDisplayName(resp.format),
                ),
            );
        } catch (error) {
            if (seq !== sequence.current) {
                return;
            }
            clearDiff();
            setStatus(compareErrorStatus(toCommandError(error)));
        }
    }, [clearDiff]);

    const scheduleCompare = useDebouncedCallback(() => void runCompare());

    /** Aplica la sugerencia: reemplaza el documento y vuelve a comparar. */
    const applyEscapedSuggestion = useCallback(() => {
        const suggestion = escapedSuggestion;
        if (!suggestion) {
            return;
        }
        if (suggestion.side === "left") {
            setLeft(suggestion.text);
        } else {
            setRight(suggestion.text);
        }
        setEscapedSuggestion(null);
        scheduleCompare();
    }, [escapedSuggestion, scheduleCompare]);

    /** Descarta la sugerencia para este texto: no vuelve a aparecer. */
    const dismissEscapedSuggestion = useCallback(() => {
        escapedDismissed.current = escapedSuggestion?.source ?? null;
        setEscapedSuggestion(null);
    }, [escapedSuggestion]);

    /** Muestra u oculta el panel de diferencias (Ctrl+D). */
    const toggleDiffPanel = useCallback(() => {
        const next = !diffPanelVisibleRef.current;
        diffPanelVisibleRef.current = next;
        // Con el grafo abierto el panel está oculto a la fuerza: solo cuenta
        // como preferencia si el usuario lo vuelve a mostrar.
        if (!graphOpenRef.current || next) {
            diffPanelPref.current = next;
        }
        setDiffPanelVisible(next);
    }, []);

    const closeGraph = useCallback(() => {
        if (!graphOpenRef.current) {
            return;
        }
        graphOpenRef.current = false;
        setGraphOpen(false);
        if (diffPanelPref.current) {
            diffPanelVisibleRef.current = true;
            setDiffPanelVisible(true);
        }
    }, []);

    /** Abre el grafo en el hueco del editor derecho (desactiva la comparación). */
    const openGraph = useCallback(() => {
        if (graphOpenRef.current) {
            return;
        }
        graphOpenRef.current = true;
        diffPanelPref.current = diffPanelVisibleRef.current;
        diffPanelVisibleRef.current = false;
        setDiffPanelVisible(false);
        if (latest.current.comparing) {
            // El texto derecho se conserva: "Enable comparison" lo vuelve a mostrar.
            latest.current.comparing = false;
            setComparing(false);
            scheduleCompare();
        }
        setView("editors");
        setGraphOpen(true);
    }, [scheduleCompare]);

    const toggleGraph = useCallback(() => {
        if (graphOpenRef.current) {
            closeGraph();
        } else {
            openGraph();
        }
    }, [closeGraph, openGraph]);

    const onGraphTruncated = useCallback((truncated: boolean) => {
        if (truncationToastNeeded(graphTruncated.current, truncated)) {
            toast({ key: "graph.truncated_toast", params: { max: MAX_GRAPH_NODES } });
        }
        graphTruncated.current = truncated;
    }, []);

    const compareNow = useCallback(() => {
        scheduleCompare.cancel();
        void runCompare();
    }, [runCompare, scheduleCompare]);

    const onLeftChange = useCallback(
        (value: string) => {
            if (value !== latest.current.left) {
                latest.current.left = value;
                setLeft(value);
                scheduleCompare();
            }
        },
        [scheduleCompare],
    );

    const onRightChange = useCallback(
        (value: string) => {
            if (value !== latest.current.right) {
                latest.current.right = value;
                setRight(value);
                scheduleCompare();
            }
        },
        [scheduleCompare],
    );

    const enableComparison = useCallback(() => {
        closeGraph();
        latest.current.comparing = true;
        setComparing(true);
        setView("editors");
        setStatus({ key: "compare.need_input" });
        scheduleCompare();
    }, [closeGraph, scheduleCompare]);

    /** Carga un documento ya leído por el backend en un panel. */
    const loadFile = useCallback(
        (side: Side, file: FileContents) => {
            setView("editors");
            setFileNames((names) => ({ ...names, [side]: file.name }));
            if (side === "left") {
                latest.current.left = file.content;
                setLeft(file.content);
            } else {
                latest.current.right = file.content;
                setRight(file.content);
                closeGraph();
                latest.current.comparing = true;
                setComparing(true);
            }
            if (side === "left" && !latest.current.comparing) {
                setStatus({ key: "app.single_file_loaded", params: { name: file.name } });
            }
            scheduleCompare();
        },
        [closeGraph, scheduleCompare],
    );

    const openInto = useCallback(
        async (side: Side) => {
            const picked = await openDialog({
                title: t("export.open_dialog_title"),
                multiple: false,
                directory: false,
                filters: [
                    { name: "JSON, XML & SQL", extensions: ["json", "xml", "sql"] },
                    { name: t("dialog.all_files"), extensions: ["*"] },
                ],
            });
            if (typeof picked !== "string") {
                return;
            }
            try {
                loadFile(side, await commands.readTextFile(picked));
            } catch (error) {
                setStatus(openErrorStatus(toCommandError(error), picked));
            }
        },
        [loadFile, t],
    );

    /** `format_both_panels` de la GTK: un formato para los dos lados. */
    const formatDocuments = useCallback(async () => {
        const { left: l, right: r, formatChoice: choice } = latest.current;
        let fmt = formatArg(choice);
        if (fmt === null) {
            try {
                fmt = await commands.detectFormat(l);
            } catch {
                setStatus({ key: "format.detect_failed", error: true });
                return;
            }
        }

        let prettyLeft = l;
        let prettyRight = r;
        try {
            if (l.trim() !== "") {
                prettyLeft = await commands.formatPretty(l, fmt);
            }
        } catch (error) {
            setStatus(formatErrorStatus(toCommandError(error), "left"));
            return;
        }
        try {
            if (r.trim() !== "") {
                prettyRight = await commands.formatPretty(r, fmt);
            }
        } catch (error) {
            onLeftChange(prettyLeft);
            setStatus(formatErrorStatus(toCommandError(error), "right"));
            return;
        }
        onLeftChange(prettyLeft);
        onRightChange(prettyRight);
        setStatus({ key: "format.formatted_ok", params: { fmt: formatDisplayName(fmt) } });
    }, [onLeftChange, onRightChange]);

    const onFormatChoice = useCallback(
        (choice: FormatChoice) => {
            latest.current.formatChoice = choice;
            setFormatChoice(choice);
            scheduleCompare();
        },
        [scheduleCompare],
    );

    /** Mensaje en la barra de estado y, además, como aviso efímero. */
    const notify = useCallback((message: StatusMessage) => {
        setStatus(message);
        toast(message);
    }, []);

    /** `save_session_from_shortcut` de la GTK (Ctrl+S). `true` si se guardó. */
    const saveSession = useCallback(async (): Promise<boolean> => {
        const resp = responseRef.current;
        if (!resp) {
            notify({ key: "history.no_comparison" });
            return false;
        }
        const { left: l, right: r } = latest.current;
        try {
            const id = await commands.historySave(l, r, resp.format);
            savedSnapshot.current = { left: l, right: r };
            notify({ key: "history.status_saved", params: { id } });
            setHistoryRefresh((n) => n + 1);
            // Igual que la GTK: al guardar se muestra el historial.
            setHistoryOpen(true);
            return true;
        } catch (error) {
            const err = toCommandError(error);
            notify(
                historyErrorStatus(err, {
                    key: "history.status_save_error",
                    params: { error: err.message },
                    error: true,
                }),
            );
            return false;
        }
    }, [notify]);

    /** Restaura una sesión en los dos editores (`connect_history_selection`). */
    const restoreSession = useCallback(
        async (id: number) => {
            try {
                const session = await commands.historyGet(id);
                setView("editors");
                closeGraph();
                latest.current.comparing = true;
                setComparing(true);
                latest.current.left = session.left_content;
                latest.current.right = session.right_content;
                setLeft(session.left_content);
                setRight(session.right_content);
                setFileNames({ left: null, right: null });
                savedSnapshot.current = { left: session.left_content, right: session.right_content };
                scheduleCompare();
                notify(restoredStatus(session));
            } catch (error) {
                const err = toCommandError(error);
                notify(
                    historyErrorStatus(err, {
                        key: "history.status_load_error",
                        params: { error: err.message },
                        error: true,
                    }),
                );
            }
        },
        [closeGraph, notify, scheduleCompare],
    );

    /** `export_to_file` de la GTK. `true` si el reporte quedó escrito. */
    const exportTo = useCallback(
        async (kind: ExportKind): Promise<boolean> => {
            const { left: l, right: r } = latest.current;
            const outcome = await exportReport(
                kind,
                { left: l, right: r, format: responseRef.current?.format ?? null },
                {
                    pickPath: async (k) =>
                        saveDialog({
                            title: t("export.dialog_title"),
                            defaultPath: defaultReportName(k),
                            filters: [{ name: t("export.filter_name", { ext: k }), extensions: [k] }],
                        }),
                    exportTxt: commands.exportTxt,
                    exportHtml: commands.exportHtml,
                    writeTextFile: commands.writeTextFile,
                },
            );
            const message = exportStatus(outcome);
            if (message) {
                notify(message);
            }
            return outcome.kind === "written";
        },
        [notify, t],
    );

    // Diálogo de salida: solo con texto en los editores que no se guardó.
    const shouldBlockClose = useCallback(
        () => hasUnsavedContent({ left: latest.current.left, right: latest.current.right }, savedSnapshot.current),
        [],
    );
    const onCloseBlocked = useCallback(() => setExitOpen(true), []);
    useCloseGuard(shouldBlockClose, onCloseBlocked);

    /**
     * Respuesta del diálogo de salida. A diferencia de la GTK, si guardar o
     * exportar falla (o se cancela el diálogo de archivo) la ventana sigue
     * abierta: cerrar igual perdería justo lo que se quiso conservar.
     */
    const onExitChoice = useCallback(
        async (choice: ExitChoice) => {
            let close = false;
            switch (choice) {
                case "save_history":
                    close = await saveSession();
                    break;
                case "export_txt":
                    close = await exportTo("txt");
                    break;
                case "export_html":
                    close = await exportTo("html");
                    break;
                case "close":
                    close = true;
                    break;
            }
            if (close) {
                await closeWindowNow().catch(() => undefined);
            }
        },
        [exportTo, saveSession],
    );

    const viewHistory = useCallback(() => {
        setView("editors");
        setStatus(READY);
        setHistoryOpen(true);
    }, []);

    /** Click en una fila: `highlight_and_scroll_to_item` de la GTK. */
    const onActivateItem = useCallback((item: DiffItem) => {
        const leftHandle = leftEditor.current;
        const rightHandle = latest.current.comparing ? rightEditor.current : null;
        const targets = itemJumpTargets(item, leftHandle?.getText() ?? "", rightHandle?.getText() ?? "");
        if (leftHandle && targets.left) {
            leftHandle.reveal(targets.left, { flash: true });
        }
        if (rightHandle && targets.right) {
            rightHandle.reveal(targets.right, { flash: true });
        }
    }, []);

    // La búsqueda va al último editor enfocado (el derecho solo si existe).
    const searchSide: Side = comparing && focusedSide === "right" ? "right" : "left";
    const getSearchEditor = useCallback(
        () => (searchSide === "right" ? rightEditor.current : leftEditor.current),
        [searchSide],
    );

    const openSearch = useCallback(() => {
        setSearchOpen(true);
        // Si ya estaba abierta, solo se re-enfoca el campo.
        searchBar.current?.focus();
    }, []);

    const onShortcut = useCallback(
        (action: ShortcutAction) => {
            switch (action) {
                case "openLeft":
                    void openInto("left");
                    break;
                case "openRight":
                    void openInto("right");
                    break;
                case "compare":
                    if (view === "editors") {
                        compareNow();
                    }
                    break;
                case "format":
                    if (view === "editors") {
                        void formatDocuments();
                    }
                    break;
                case "toggleDiffPanel":
                    toggleDiffPanel();
                    break;
                case "toggleGraph":
                    toggleGraph();
                    break;
                case "showShortcuts":
                    setShortcutsOpen(true);
                    break;
                case "search":
                    if (view === "editors") {
                        openSearch();
                    }
                    break;
                case "findNext":
                case "findPrevious":
                    if (view !== "editors") {
                        break;
                    }
                    if (searchOpen && searchBar.current) {
                        searchBar.current.go(action === "findNext" ? "next" : "prev");
                    } else {
                        openSearch();
                    }
                    break;
                case "saveSession":
                    void saveSession();
                    break;
                case "toggleHistory":
                    setHistoryOpen((open) => !open);
                    break;
                case "exportTxt":
                    void exportTo("txt");
                    break;
                case "fontIncrease":
                    void preferences.stepUiScale("increase");
                    break;
                case "fontDecrease":
                    void preferences.stepUiScale("decrease");
                    break;
                case "fontReset":
                    void preferences.stepUiScale("reset");
                    break;
            }
        },
        [
            compareNow,
            exportTo,
            formatDocuments,
            openInto,
            openSearch,
            preferences,
            saveSession,
            searchOpen,
            toggleDiffPanel,
            toggleGraph,
            view,
        ],
    );
    useShortcuts(onShortcut);

    // Arranque: `rustdiff a.json [b.json]` llega por `startupFiles`.
    useEffect(() => {
        let cancelled = false;
        commands
            .startupFiles()
            .then((files) => {
                if (cancelled || files.length === 0) {
                    return;
                }
                if (files.length >= 2) {
                    closeGraph();
                    latest.current.comparing = true;
                    setComparing(true);
                    loadFile("right", files[1]);
                }
                loadFile("left", files[0]);
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    const err = toCommandError(error);
                    setStatus(openErrorStatus(err, err.message));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [closeGraph, loadFile]);

    const language = useMemo(() => editorLanguage(formatChoice, detected), [formatChoice, detected]);
    const leftLines = useMemo(() => lineCount(left), [left]);
    const rightLines = useMemo(() => lineCount(right), [right]);
    const formatName = detected ? formatDisplayName(detected) : null;

    return (
        <TooltipProvider>
            <div className="bg-background text-foreground flex h-full flex-col">
                <AppHeader
                    comparing={comparing}
                    editorsVisible={view === "editors"}
                    formatChoice={formatChoice}
                    onFormatChoice={onFormatChoice}
                    onOpenLeft={() => void openInto("left")}
                    onOpenRight={() => void openInto("right")}
                    onEnableComparison={enableComparison}
                    onCompare={compareNow}
                    onFormat={() => void formatDocuments()}
                    diffPanelVisible={diffPanelVisible}
                    onToggleDiffPanel={toggleDiffPanel}
                    historyVisible={historyOpen}
                    onToggleHistory={() => setHistoryOpen((open) => !open)}
                    graphVisible={graphOpen}
                    onToggleGraph={toggleGraph}
                    scheme={scheme}
                    onToggleScheme={() => theme.setSetting(scheme === "dark" ? "light" : "dark")}
                    menu={{
                        onExport: (kind) => void exportTo(kind),
                        onShowShortcuts: () => setShortcutsOpen(true),
                        theme: theme.setting,
                        onTheme: theme.setSetting,
                        language: preferences.language,
                        onLanguage: (language) => void preferences.setLanguage(language),
                        uiScalePercent: uiScalePercent(preferences.uiScale),
                        onUiScale: (step) => void preferences.stepUiScale(step),
                    }}
                />

                <div className="flex min-h-0 flex-1">
                    <HistorySidebar
                        open={historyOpen}
                        refreshToken={historyRefresh}
                        onRestore={(id) => void restoreSession(id)}
                        onStatus={notify}
                        onClose={() => setHistoryOpen(false)}
                    />
                    <main className="min-h-0 min-w-0 flex-1">
                        {view === "welcome" ? (
                            <WelcomeScreen
                                onOpenDocument={() => void openInto("left")}
                                onNewComparison={enableComparison}
                                onShowShortcuts={() => setShortcutsOpen(true)}
                                onViewHistory={viewHistory}
                            />
                        ) : (
                            <div className="flex h-full min-h-0 flex-col">
                                {searchOpen && (
                                    <SearchBar
                                        ref={searchBar}
                                        text={searchSide === "right" ? right : left}
                                        targetLabel={t(
                                            searchSide === "right" ? "editor.right_label" : "editor.left_label",
                                        )}
                                        getEditor={getSearchEditor}
                                        onClose={() => setSearchOpen(false)}
                                    />
                                )}
                                {escapedSuggestion && (
                                    <div
                                        role="status"
                                        className="bg-muted/40 text-muted-foreground flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-body"
                                    >
                                        <AlertTriangle className="size-4 shrink-0" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate">{t("escaped.message")}</span>
                                        <Button size="sm" onClick={applyEscapedSuggestion}>
                                            {t("escaped.action")}
                                        </Button>
                                        <IconButton
                                            label={t("escaped.dismiss")}
                                            className="size-7"
                                            onClick={dismissEscapedSuggestion}
                                        >
                                            <X />
                                        </IconButton>
                                    </div>
                                )}
                                <div className="min-h-0 flex-1">
                                    <ResizablePanelGroup orientation="vertical">
                                        <ResizablePanel id="editors" defaultSize="70" minSize="20">
                                            <ResizablePanelGroup orientation="horizontal">
                                                <ResizablePanel id="left" defaultSize="50" minSize="15">
                                                    <EditorPane
                                                        side="left"
                                                        label={t("editor.left_label")}
                                                        fileName={fileNames.left}
                                                        meta={{ format: formatName, lines: leftLines }}
                                                        openLabel={t("header.open_left_tooltip")}
                                                        onOpen={() => void openInto("left")}
                                                    >
                                                        <CodeEditor
                                                            ref={leftEditor}
                                                            onFocus={() => setFocusedSide("left")}
                                                            value={left}
                                                            onChange={onLeftChange}
                                                            language={language}
                                                            scheme={scheme}
                                                            decorations={decorations.left}
                                                            ariaLabel={t("editor.left_label")}
                                                        />
                                                    </EditorPane>
                                                </ResizablePanel>
                                                {comparing && (
                                                    <>
                                                        <ResizableHandle />
                                                        <ResizablePanel id="right" defaultSize="50" minSize="15">
                                                            <EditorPane
                                                                side="right"
                                                                label={t("editor.right_label")}
                                                                fileName={fileNames.right}
                                                                meta={{ format: formatName, lines: rightLines }}
                                                                openLabel={t("header.open_right_tooltip")}
                                                                onOpen={() => void openInto("right")}
                                                            >
                                                                <CodeEditor
                                                                    ref={rightEditor}
                                                                    onFocus={() => setFocusedSide("right")}
                                                                    value={right}
                                                                    onChange={onRightChange}
                                                                    language={language}
                                                                    scheme={scheme}
                                                                    decorations={decorations.right}
                                                                    ariaLabel={t("editor.right_label")}
                                                                />
                                                            </EditorPane>
                                                        </ResizablePanel>
                                                    </>
                                                )}
                                                {!comparing && graphOpen && (
                                                    <>
                                                        <ResizableHandle />
                                                        <ResizablePanel id="graph" defaultSize="50" minSize="15">
                                                            <GraphView
                                                                text={left}
                                                                format={formatArg(formatChoice)}
                                                                uiScale={preferences.uiScale}
                                                                scheme={scheme}
                                                                onTruncatedChange={onGraphTruncated}
                                                            />
                                                        </ResizablePanel>
                                                    </>
                                                )}
                                            </ResizablePanelGroup>
                                        </ResizablePanel>
                                        {diffPanelVisible && (
                                            <>
                                                <ResizableHandle />
                                                <ResizablePanel id="diff" defaultSize="30" minSize="10">
                                                    <DiffTable
                                                        result={response?.result ?? null}
                                                        onActivate={onActivateItem}
                                                        filters={diffFilters}
                                                        onFiltersChange={setDiffFilters}
                                                    />
                                                </ResizablePanel>
                                            </>
                                        )}
                                    </ResizablePanelGroup>
                                </div>
                            </div>
                        )}
                    </main>
                </div>

                <StatusBar message={status} format={response ? formatName : null} />
                <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
                <ExitDialog
                    open={exitOpen}
                    onOpenChange={setExitOpen}
                    onChoose={(choice) => void onExitChoice(choice)}
                />
                <Toaster />
            </div>
        </TooltipProvider>
    );
}

/**
 * Panel de un documento con la cabecera del `code-pane.tsx` del prototipo:
 * letra A/B, archivo (o el nombre del panel), formato y líneas, y "abrir".
 */
function EditorPane({
    side,
    label,
    fileName,
    meta,
    openLabel,
    onOpen,
    children,
}: {
    side: Side;
    label: string;
    fileName: string | null;
    meta: { format: string | null; lines: number };
    openLabel: string;
    onOpen: () => void;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    return (
        <section className="bg-editor @container flex h-full min-h-0 flex-col" aria-label={label}>
            <header className="flex h-10 shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
                <span
                    aria-hidden
                    className="bg-muted text-muted-foreground grid size-5 shrink-0 place-items-center rounded font-mono text-caption font-semibold"
                >
                    {side === "left" ? "A" : "B"}
                </span>
                <FileCode className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate text-body font-medium" title={fileName ?? label}>
                    {fileName ?? label}
                </span>
                <span className="text-muted-foreground hidden shrink-0 text-caption tabular @md:inline">
                    {meta.format ? `${meta.format} · ` : ""}
                    {t("editor.lines", { count: meta.lines })}
                </span>
                <div className="ml-auto flex shrink-0 items-center">
                    <IconButton label={openLabel} className="size-7" onClick={onOpen}>
                        <FolderOpen />
                    </IconButton>
                </div>
            </header>
            <div className="min-h-0 flex-1">{children}</div>
        </section>
    );
}

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
 *
 * Todo el parseo, la detección y el disco pasan por `commands.*` (S8).
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { commands, type DiffItem, type DiffResponse, type FileContents, type Format } from "@/bindings";
import { AppHeader } from "@/components/app-header";
import { CodeEditor, type CodeEditorHandle } from "@/components/code-editor";
import { DiffTable } from "@/components/diff-table";
import { SearchBar, type SearchBarHandle } from "@/components/search-bar";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { StatusBar } from "@/components/status-bar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
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
import { editorLanguage, formatArg, formatDisplayName, type FormatChoice } from "@/lib/formats";
import { buildDiffDecorations, type DiffDecorations, EMPTY_DECORATIONS } from "@/lib/line-diff";
import { itemJumpTargets } from "@/lib/locate";

type Side = "left" | "right";

const READY: StatusMessage = { key: "app.status_ready" };

export default function App() {
    const { t } = useTranslation();
    const scheme = useColorScheme();

    const [view, setView] = useState<"welcome" | "editors">("welcome");
    const [comparing, setComparing] = useState(false);
    const [left, setLeft] = useState("");
    const [right, setRight] = useState("");
    const [formatChoice, setFormatChoice] = useState<FormatChoice>("auto");
    const [detected, setDetected] = useState<Format | null>(null);
    const [response, setResponse] = useState<DiffResponse | null>(null);
    const [decorations, setDecorations] = useState<DiffDecorations>(EMPTY_DECORATIONS);
    const [status, setStatus] = useState<StatusMessage>(READY);
    const [diffPanelVisible, setDiffPanelVisible] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [diffFilters, setDiffFilters] = useState<KindFilters>(DEFAULT_FILTERS);
    const [focusedSide, setFocusedSide] = useState<Side>("left");

    const leftEditor = useRef<CodeEditorHandle>(null);
    const rightEditor = useRef<CodeEditorHandle>(null);
    const searchBar = useRef<SearchBarHandle>(null);

    // Espejo síncrono del estado que leen las operaciones asíncronas.
    const latest = useRef({ left, right, comparing, formatChoice });
    latest.current = { left, right, comparing, formatChoice };
    // Cada comparación lleva un número; solo la última pinta resultados.
    const sequence = useRef(0);

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
        latest.current.comparing = true;
        setComparing(true);
        setView("editors");
        setStatus({ key: "compare.need_input" });
        scheduleCompare();
    }, [scheduleCompare]);

    /** Carga un documento ya leído por el backend en un panel. */
    const loadFile = useCallback(
        (side: Side, file: FileContents) => {
            setView("editors");
            if (side === "left") {
                latest.current.left = file.content;
                setLeft(file.content);
            } else {
                latest.current.right = file.content;
                setRight(file.content);
                latest.current.comparing = true;
                setComparing(true);
            }
            if (side === "left" && !latest.current.comparing) {
                setStatus({ key: "app.single_file_loaded", params: { name: file.name } });
            }
            scheduleCompare();
        },
        [scheduleCompare],
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
                    setDiffPanelVisible((visible) => !visible);
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
            }
        },
        [compareNow, formatDocuments, openInto, openSearch, searchOpen, view],
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
    }, [loadFile]);

    const language = useMemo(() => editorLanguage(formatChoice, detected), [formatChoice, detected]);

    return (
        <TooltipProvider>
            <div className="flex h-full flex-col">
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
                    onToggleDiffPanel={() => setDiffPanelVisible((visible) => !visible)}
                />

                <main className="min-h-0 flex-1">
                    {view === "welcome" ? (
                        <WelcomeScreen
                            onOpenDocument={() => void openInto("left")}
                            onNewComparison={enableComparison}
                            onShowShortcuts={() => setShortcutsOpen(true)}
                        />
                    ) : (
                        <div className="flex h-full min-h-0 flex-col">
                            {searchOpen && (
                                <SearchBar
                                    ref={searchBar}
                                    text={searchSide === "right" ? right : left}
                                    targetLabel={t(searchSide === "right" ? "editor.right_label" : "editor.left_label")}
                                    getEditor={getSearchEditor}
                                    onClose={() => setSearchOpen(false)}
                                />
                            )}
                            <div className="min-h-0 flex-1">
                                <ResizablePanelGroup orientation="vertical">
                                    <ResizablePanel id="editors" defaultSize="70" minSize="20">
                                        <ResizablePanelGroup orientation="horizontal">
                                            <ResizablePanel id="left" defaultSize="50" minSize="15">
                                                <EditorPane label={t("editor.left_label")}>
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
                                                        <EditorPane label={t("editor.right_label")}>
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

                <StatusBar message={status} />
                <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            </div>
        </TooltipProvider>
    );
}

function EditorPane({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="text-muted-foreground shrink-0 py-1 text-center text-xs font-semibold">{label}</div>
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    );
}

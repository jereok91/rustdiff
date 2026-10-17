/*
 * Editor CodeMirror 6 (D1) controlado desde React.
 *
 * El `EditorView` se crea una sola vez; lenguaje y tema viven en
 * `Compartment`s para cambiarlos sin recrear el editor (se conservan cursor,
 * scroll e historial de deshacer). Un `value` externo distinto del documento
 * (abrir archivo, Format) reemplaza el contenido entero.
 *
 * El padre recibe un `CodeEditorHandle` por `ref` para saltar a un rango
 * (click en la tabla, búsqueda) sin pasar por el estado de React.
 */

import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";

import type { ColorScheme } from "@/hooks/use-color-scheme";
import { editorTheme } from "@/lib/editor-theme";
import type { EditorLanguage } from "@/lib/formats";
import { diffDecorations, setDiffDecorations, setFlashRange } from "@/lib/editor-decorations";
import type { TextRange } from "@/lib/locate";
import type { SideDecorations } from "@/lib/line-diff";

function languageExtension(language: EditorLanguage): Extension {
    switch (language) {
        case "json":
            return json();
        case "xml":
            return xml();
        case "sql":
            return sql();
        default:
            return [];
    }
}

function themeExtension(scheme: ColorScheme): Extension {
    return editorTheme(scheme);
}

/** Duración del destello tras un salto (coincide con la animación CSS). */
const FLASH_MS = 1200;

/** API imperativa del editor para el padre. */
export type CodeEditorHandle = {
    /** Texto actual del documento (puede ir por delante del `value` de React). */
    getText: () => string;
    /** Selección principal actual. */
    getSelection: () => TextRange;
    /** Selecciona `range`, lo centra en pantalla y opcionalmente lo destella. */
    reveal: (range: TextRange, options?: { flash?: boolean }) => void;
    focus: () => void;
};

export type CodeEditorProps = {
    value: string;
    onChange: (value: string) => void;
    language: EditorLanguage;
    scheme: ColorScheme;
    decorations: SideDecorations;
    ariaLabel: string;
    /** Se llama cuando el editor gana el foco (la búsqueda usa el último enfocado). */
    onFocus?: () => void;
    ref?: Ref<CodeEditorHandle>;
};

export function CodeEditor({
    value,
    onChange,
    language,
    scheme,
    decorations,
    ariaLabel,
    onFocus,
    ref,
}: CodeEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const languageConf = useRef(new Compartment());
    const themeConf = useRef(new Compartment());

    const onFocusRef = useRef(onFocus);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        onChangeRef.current = onChange;
        onFocusRef.current = onFocus;
    }, [onChange, onFocus]);

    useImperativeHandle(
        ref,
        () => ({
            getText: () => viewRef.current?.state.doc.toString() ?? "",
            getSelection: () => {
                const main = viewRef.current?.state.selection.main;
                return main ? { from: main.from, to: main.to } : { from: 0, to: 0 };
            },
            reveal: (range, options) => {
                const view = viewRef.current;
                if (!view) {
                    return;
                }
                const length = view.state.doc.length;
                const from = Math.max(0, Math.min(range.from, length));
                const to = Math.max(from, Math.min(range.to, length));
                view.dispatch({
                    selection: EditorSelection.single(from, to),
                    effects: [
                        EditorView.scrollIntoView(from, { y: "center" }),
                        setFlashRange.of(options?.flash ? { from, to } : null),
                    ],
                });
                if (flashTimer.current) {
                    clearTimeout(flashTimer.current);
                    flashTimer.current = null;
                }
                if (options?.flash) {
                    flashTimer.current = setTimeout(() => {
                        flashTimer.current = null;
                        viewRef.current?.dispatch({ effects: setFlashRange.of(null) });
                    }, FLASH_MS);
                }
            },
            focus: () => viewRef.current?.focus(),
        }),
        [],
    );

    // Creación única; los efectos de abajo sincronizan el resto de las props.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        const view = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: value,
                extensions: [
                    basicSetup,
                    languageConf.current.of(languageExtension(language)),
                    themeConf.current.of(themeExtension(scheme)),
                    diffDecorations(),
                    EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            onChangeRef.current(update.state.doc.toString());
                        }
                        if (update.focusChanged && update.view.hasFocus) {
                            onFocusRef.current?.();
                        }
                    }),
                ],
            }),
        });
        viewRef.current = view;
        return () => {
            if (flashTimer.current) {
                clearTimeout(flashTimer.current);
            }
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (view && view.state.doc.toString() !== value) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
        }
    }, [value]);

    useEffect(() => {
        viewRef.current?.dispatch({ effects: languageConf.current.reconfigure(languageExtension(language)) });
    }, [language]);

    useEffect(() => {
        viewRef.current?.dispatch({ effects: themeConf.current.reconfigure(themeExtension(scheme)) });
    }, [scheme]);

    useEffect(() => {
        viewRef.current?.dispatch({ effects: setDiffDecorations.of(decorations) });
    }, [decorations]);

    // El anillo de foco va acá y no en `.cm-editor` (ver `lib/editor-theme.ts`):
    // la gutter de CodeMirror es `sticky` con z-index propio y taparía el lado
    // izquierdo del outline, que es justo el de los números de línea. El
    // `::after` pinta por encima y el contenedor incluye la gutter.
    return (
        <div
            ref={hostRef}
            className="relative h-full min-h-0 overflow-hidden focus-within:after:pointer-events-none focus-within:after:absolute focus-within:after:inset-0 focus-within:after:z-[250] focus-within:after:outline-2 focus-within:after:-outline-offset-2 focus-within:after:outline-ring"
            data-testid="code-editor"
        />
    );
}

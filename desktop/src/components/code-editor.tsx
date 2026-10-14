/*
 * Editor CodeMirror 6 (D1) controlado desde React.
 *
 * El `EditorView` se crea una sola vez; lenguaje y tema viven en
 * `Compartment`s para cambiarlos sin recrear el editor (se conservan cursor,
 * scroll e historial de deshacer). Un `value` externo distinto del documento
 * (abrir archivo, Format) reemplaza el contenido entero.
 */

import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";

import type { ColorScheme } from "@/hooks/use-color-scheme";
import type { EditorLanguage } from "@/lib/formats";
import { diffDecorations, setDiffDecorations } from "@/lib/editor-decorations";
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
    return scheme === "dark" ? oneDark : [];
}

export type CodeEditorProps = {
    value: string;
    onChange: (value: string) => void;
    language: EditorLanguage;
    scheme: ColorScheme;
    decorations: SideDecorations;
    ariaLabel: string;
};

export function CodeEditor({ value, onChange, language, scheme, decorations, ariaLabel }: CodeEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const languageConf = useRef(new Compartment());
    const themeConf = useRef(new Compartment());

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

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
                    }),
                ],
            }),
        });
        viewRef.current = view;
        return () => {
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

    return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
}

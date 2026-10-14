/*
 * Barra de búsqueda propia (Ctrl+F): el `search_revealer` de la GTK.
 *
 * Busca en el último editor enfocado, sin distinguir mayúsculas. Enter /
 * F3 = siguiente, Shift+Enter / Shift+F3 = anterior, con wrap-around en los
 * dos sentidos; Escape la cierra y devuelve el foco al editor. La lógica
 * pura vive en `lib/search`; acá solo el cableado con el editor.
 */

import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CodeEditorHandle } from "@/components/code-editor";
import {
    currentMatch,
    findMatches,
    MAX_MATCHES,
    pickIncremental,
    pickMatch,
    type SearchDirection,
} from "@/lib/search";

export type SearchBarHandle = {
    /** Enfoca el campo y selecciona su texto (Ctrl+F con la barra ya abierta). */
    focus: () => void;
    /** Salta a la coincidencia siguiente/anterior (F3 / Shift+F3). */
    go: (direction: SearchDirection) => void;
};

export type SearchBarProps = {
    /** Texto del editor objetivo; recalcula el contador cuando cambia. */
    text: string;
    /** Etiqueta del editor en el que se busca. */
    targetLabel: string;
    /** Editor objetivo (el último enfocado). */
    getEditor: () => CodeEditorHandle | null;
    onClose: () => void;
    ref?: Ref<SearchBarHandle>;
};

export function SearchBar({ text, targetLabel, getEditor, onClose, ref }: SearchBarProps) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(-1);

    const matches = useMemo(() => findMatches(text, query), [text, query]);

    const reveal = (target: number) => {
        const editor = getEditor();
        setIndex(target);
        if (editor && target >= 0) {
            editor.reveal(matches[target], { flash: false });
        }
    };

    const go = (direction: SearchDirection) => {
        const editor = getEditor();
        if (!editor || query === "") {
            return;
        }
        reveal(pickMatch(matches, editor.getSelection(), direction));
    };

    // Búsqueda incremental: al escribir salta a la primera coincidencia desde
    // la selección; si cambia el documento solo se recalcula el contador.
    const lastQuery = useRef(query);
    useEffect(() => {
        const editor = getEditor();
        if (!editor) {
            return;
        }
        const selection = editor.getSelection();
        if (query !== lastQuery.current) {
            lastQuery.current = query;
            reveal(pickIncremental(matches, selection));
        } else {
            setIndex(currentMatch(matches, selection));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matches]);

    useImperativeHandle(ref, () => ({
        focus: () => {
            inputRef.current?.focus();
            inputRef.current?.select();
        },
        go,
    }));

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const close = () => {
        onClose();
        getEditor()?.focus();
    };

    const counter =
        query === ""
            ? ""
            : matches.length === 0
              ? t("search.no_results")
              : index >= 0
                ? t("search.counter", {
                      current: index + 1,
                      total: matches.length >= MAX_MATCHES ? `${MAX_MATCHES}+` : matches.length,
                  })
                : t("search.count", { total: matches.length >= MAX_MATCHES ? `${MAX_MATCHES}+` : matches.length });

    return (
        <div className="bg-card flex shrink-0 items-center gap-1 border-b px-2 py-1" data-testid="search-bar">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        go(event.shiftKey ? "prev" : "next");
                    } else if (event.key === "Escape") {
                        event.preventDefault();
                        close();
                    }
                }}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                className="border-input focus-visible:ring-ring/50 h-7 w-64 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
            />
            <span
                className="text-muted-foreground min-w-24 text-xs tabular-nums"
                role="status"
                aria-live="polite"
                data-testid="search-counter"
            >
                {counter}
            </span>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => go("prev")}
                disabled={matches.length === 0}
                aria-label={t("search.prev")}
                title={`${t("search.prev")} (Shift+Enter)`}
            >
                <ChevronUp />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => go("next")}
                disabled={matches.length === 0}
                aria-label={t("search.next")}
                title={`${t("search.next")} (Enter)`}
            >
                <ChevronDown />
            </Button>
            <span className="text-muted-foreground ml-1 flex-1 truncate text-xs">{targetLabel}</span>
            <Button variant="ghost" size="icon-sm" onClick={close} aria-label={t("search.close")} title={t("search.close")}>
                <X />
            </Button>
        </div>
    );
}

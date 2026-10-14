import * as React from "react"
import {
  CheckIcon,
  CircleAlertIcon,
  ClipboardPasteIcon,
  CopyIcon,
  FileJsonIcon,
  FolderOpenIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { DIFF_META, diffTone } from "./diff-kind"
import type { DocLine } from "./engine"
import { JsonLine } from "./syntax"

export type PaneState =
  | { kind: "empty" }
  | { kind: "ready"; lines: DocLine[] }
  | { kind: "error"; text: string; message: string; line: number; column: number }

interface CodePaneProps {
  side: "left" | "right"
  fileName?: string
  format?: string
  state: PaneState
  selectedId?: string
  /** cambia cada vez que se navega a una diferencia: vuelve a disparar el destello */
  arrival?: number
  wrap?: boolean
  onSelectEntry?: (id: string) => void
  onRevealEntry?: (id: string) => void
  onOpenFile?: (file: File) => void
  onPasteText?: (text: string) => void
  onClear?: () => void
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: React.UIEventHandler<HTMLDivElement>
}

const ACCEPT = ".json,.txt,application/json,text/plain"

/* ------------------------------------------------------------- Acción -- */
function PaneAction({
  label,
  onClick,
  children,
}: {
  label: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={onClick}
          aria-label={typeof label === "string" ? label : undefined}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/* ------------------------------------------------------- Panel vacío -- */
function EmptyPane({
  side,
  dragging,
  pasteHint,
  onBrowse,
  onPaste,
}: {
  side: "left" | "right"
  dragging: boolean
  pasteHint: boolean
  onBrowse: () => void
  onPaste: () => void
}) {
  return (
    <div className="flex h-full p-3">
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 text-center transition-colors duration-200",
          dragging ? "border-primary bg-primary/6" : "border-border"
        )}
      >
        <div
          className={cn(
            "grid size-11 place-items-center rounded-lg border transition-colors duration-200",
            dragging ? "border-primary/40 bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          <FileJsonIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {dragging ? "Suelta para abrir" : side === "left" ? "Documento original" : "Documento a comparar"}
          </p>
          <p className="text-muted-foreground max-w-64 text-xs/5 text-balance">
            {pasteHint ? (
              <>
                Este panel está listo: pega con{" "}
                <KbdGroup className="align-middle">
                  <Kbd>⌘</Kbd>
                  <Kbd>V</Kbd>
                </KbdGroup>
              </>
            ) : (
              "Suelta un archivo .json aquí, ábrelo desde el disco o pega su contenido."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBrowse}>
            <FolderOpenIcon /> Abrir archivo
          </Button>
          <Button variant="ghost" size="sm" onClick={onPaste}>
            <ClipboardPasteIcon /> Pegar
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------- Mapa de cambios -- */
function OverviewRuler({
  lines,
  selectedId,
  onReveal,
}: {
  lines: DocLine[]
  selectedId?: string
  onReveal?: (id: string) => void
}) {
  const marks = React.useMemo(() => {
    const out: { id: string; kind: NonNullable<DocLine["status"]>; start: number; end: number }[] = []
    for (const l of lines) {
      if (!l.status || !l.entryId) continue
      const last = out[out.length - 1]
      if (last && last.id === l.entryId && last.end === l.n - 1) last.end = l.n
      else out.push({ id: l.entryId, kind: l.status, start: l.n, end: l.n })
    }
    return out
  }, [lines])
  const total = Math.max(lines.length, 1)

  return (
    <div
      aria-label="Mapa de cambios"
      className="bg-gutter/80 pointer-events-none absolute inset-y-0 right-0 z-[2] w-2.5 border-l"
    >
      {marks.map((m) => (
        <button
          key={m.id + m.start}
          type="button"
          tabIndex={-1}
          aria-label={`Ir a ${DIFF_META[m.kind].label.toLowerCase()} en línea ${m.start}`}
          onClick={() => onReveal?.(m.id)}
          className={cn(
            "pointer-events-auto absolute right-0.5 left-0.5 min-h-[3px] cursor-pointer rounded-[1px] transition-[opacity,left,right] duration-150",
            diffTone[m.kind].bar,
            m.id === selectedId ? "right-0 left-0 opacity-100" : "opacity-70 hover:opacity-100"
          )}
          style={{
            top: `${((m.start - 1) / total) * 100}%`,
            height: `${((m.end - m.start + 1) / total) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- Panel -- */
export function CodePane({
  side,
  fileName,
  format = "JSON",
  state,
  selectedId,
  arrival = 0,
  wrap,
  onSelectEntry,
  onRevealEntry,
  onOpenFile,
  onPasteText,
  onClear,
  scrollRef,
  onScroll,
}: CodePaneProps) {
  const fileInput = React.useRef<HTMLInputElement>(null)
  const localScroll = React.useRef<HTMLDivElement>(null)
  const scroller = scrollRef ?? localScroll
  const [dragging, setDragging] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [pasteHint, setPasteHint] = React.useState(false)
  const paneRef = React.useRef<HTMLElement>(null)

  const lines: DocLine[] =
    state.kind === "ready"
      ? state.lines
      : state.kind === "error"
        ? state.text.split("\n").map((text, i) => ({ n: i + 1, text }))
        : []

  /* Con error, llevar la línea culpable a la vista */
  React.useEffect(() => {
    if (state.kind !== "error" || !scroller.current) return
    const row = scroller.current.querySelector<HTMLElement>(`[data-line="${state.line}"]`)
    if (row) scroller.current.scrollTop = row.offsetTop - scroller.current.clientHeight / 3
  }, [state, scroller])

  const browse = () => fileInput.current?.click()
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) onPasteText?.(text)
    } catch {
      setPasteHint(true)
      paneRef.current?.focus()
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.map((l) => l.text).join("\n"))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* portapapeles no disponible */
    }
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onOpenFile?.(file)
    },
  }

  return (
    <section
      ref={paneRef}
      tabIndex={-1}
      aria-label={side === "left" ? "Documento izquierdo" : "Documento derecho"}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text")
        if (text.trim() && state.kind !== "ready") {
          e.preventDefault()
          setPasteHint(false)
          onPasteText?.(text)
        }
      }}
      className="bg-editor @container flex h-full min-w-0 flex-col outline-none"
      {...dropProps}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onOpenFile?.(f)
          e.target.value = ""
        }}
      />

      {/* Encabezado */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <span
          className="bg-muted text-muted-foreground grid size-5 shrink-0 place-items-center rounded font-mono text-[10px] font-semibold"
          aria-hidden
        >
          {side === "left" ? "A" : "B"}
        </span>
        {state.kind === "empty" ? (
          <span className="text-muted-foreground text-sm">Sin documento</span>
        ) : (
          <>
            <FileJsonIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium" title={fileName}>
              {fileName}
            </span>
            {state.kind === "error" ? (
              <Badge variant="removed" className="shrink-0">
                <CircleAlertIcon /> JSON inválido
              </Badge>
            ) : (
              <span className="text-muted-foreground hidden shrink-0 text-xs tabular @md:inline">
                {format} · {lines.length} líneas
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          {state.kind !== "empty" && (
            <>
              <PaneAction label="Abrir otro archivo" onClick={browse}>
                <FolderOpenIcon />
              </PaneAction>
              <PaneAction label={copied ? "Copiado" : "Copiar contenido"} onClick={copy}>
                {copied ? <CheckIcon className="text-diff-added-foreground" /> : <CopyIcon />}
              </PaneAction>
              <PaneAction label="Quitar documento" onClick={onClear}>
                <XIcon />
              </PaneAction>
            </>
          )}
        </div>
      </header>

      {state.kind === "empty" ? (
        <EmptyPane
          side={side}
          dragging={dragging}
          pasteHint={pasteHint}
          onBrowse={browse}
          onPaste={paste}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {state.kind === "error" && (
            <div
              role="alert"
              className="bg-destructive/8 text-foreground flex items-start gap-2.5 border-b px-3 py-2.5 text-xs/5"
            >
              <CircleAlertIcon className="text-diff-removed-foreground mt-0.5 size-4 shrink-0" />
              <p>
                <span className="font-medium">
                  Línea {state.line}, columna {state.column}:
                </span>{" "}
                {state.message}.{" "}
                <span className="text-muted-foreground">Corrige el archivo y vuelve a abrirlo para comparar.</span>
              </p>
            </div>
          )}

          <div className="relative min-h-0 flex-1">
          <div
            ref={scroller}
            onScroll={onScroll}
            className="absolute inset-0 overflow-auto pr-2.5 font-mono text-[12.5px] leading-5"
          >
            <div className={cn("min-w-max py-2", wrap && "min-w-0")}>
              {lines.map((l) => {
                const isError = state.kind === "error" && l.n === state.line
                const tone = l.status ? diffTone[l.status] : undefined
                const selected = !!l.entryId && l.entryId === selectedId
                return (
                  <div
                    key={selected ? `${l.n}-${arrival}` : l.n}
                    data-line={l.n}
                    data-entry={l.entryId}
                    onClick={l.entryId ? () => onSelectEntry?.(l.entryId!) : undefined}
                    className={cn(
                      "relative grid grid-cols-[3.25rem_1.25rem_1fr]",
                      tone && (selected ? tone.rowStrong : tone.row),
                      selected && arrival > 0 && "animate-arrive",
                      isError && "bg-destructive/12",
                      l.entryId && "cursor-pointer"
                    )}
                  >
                    <span
                      className={cn(
                        "text-gutter-foreground bg-gutter sticky left-0 z-[1] pr-3 text-right tabular select-none",
                        (selected || isError) && "text-foreground font-medium"
                      )}
                    >
                      {tone && <span className={cn("absolute inset-0", selected ? tone.rowStrong : tone.row)} />}
                      {isError && <span className="bg-destructive/12 absolute inset-0" />}
                      <span className="relative">{l.n}</span>
                    </span>
                    <span
                      className={cn("grid place-items-center font-semibold select-none", tone?.marker)}
                      aria-label={l.status ? DIFF_META[l.status].label : isError ? "Error" : undefined}
                    >
                      {isError ? (
                        <CircleAlertIcon className="text-diff-removed-foreground size-3" />
                      ) : l.status ? (
                        DIFF_META[l.status].marker
                      ) : (
                        ""
                      )}
                    </span>
                    <code className={cn("pr-6", wrap ? "break-all whitespace-pre-wrap" : "whitespace-pre")}>
                      {state.kind === "error" ? (
                        <span className={isError ? "text-foreground" : "text-muted-foreground"}>{l.text || " "}</span>
                      ) : (
                        <JsonLine text={l.text} emphasis={l.emphasis} emphasisClassName={tone?.emphasis} />
                      )}
                    </code>
                  </div>
                )
              })}
            </div>
          </div>

          {state.kind === "ready" && (
            <OverviewRuler lines={lines} selectedId={selectedId} onReveal={onRevealEntry} />
          )}
          </div>
        </div>
      )}
    </section>
  )
}

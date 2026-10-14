import * as React from "react"

import { AppHeader, type CompareOptions, type ViewMode } from "@/components/diff/app-header"
import { CodePane, type PaneState } from "@/components/diff/code-pane"
import { DiffPanel, type DiffFilter, type PanelStatus } from "@/components/diff/diff-panel"
import { DiffTree } from "@/components/diff/diff-tree"
import { computeDiff, parseDocument, type DiffResult, type ParseResult } from "@/components/diff/engine"
import { leftDoc, rightDoc } from "@/components/diff/sample"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type Side = "left" | "right"
type Doc = { name: string; text: string }

const SAMPLE: Record<Side, Doc> = {
  left: { name: "ajuste_original.json", text: JSON.stringify(leftDoc, null, 2) },
  right: { name: "ajuste_corregido.json", text: JSON.stringify(rightDoc, null, 2) },
}

/** Latencia simulada del motor (en Tauri: `await invoke("compare", …)`). */
const ENGINE_DELAY = 320

function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">(() => {
    const el = document.documentElement
    return el.classList.contains("dark") || el.dataset.theme === "dark" ? "dark" : "light"
  })
  React.useEffect(() => {
    const el = document.documentElement
    el.classList.toggle("dark", theme === "dark")
    if (el.dataset.theme) el.dataset.theme = theme
    try {
      localStorage.setItem("rustdiff-theme", theme)
    } catch {
      /* almacenamiento no disponible */
    }
  }, [theme])
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export default function App({ startEmpty }: { startEmpty?: boolean }) {
  const [theme, toggleTheme] = useTheme()
  const [format, setFormat] = React.useState("auto")
  const [view, setView] = React.useState<ViewMode>("split")
  const [options, setOptions] = React.useState<CompareOptions>({
    ignoreArrayOrder: false,
    ignoreWhitespace: false,
    syncScroll: true,
    wrap: false,
  })

  const [docs, setDocs] = React.useState<Record<Side, Doc | null>>(() =>
    startEmpty || new URLSearchParams(location.search).has("vacio") ? { left: null, right: null } : SAMPLE
  )
  const parsed = React.useMemo<Record<Side, ParseResult | null>>(
    () => ({
      left: docs.left ? parseDocument(docs.left.text) : null,
      right: docs.right ? parseDocument(docs.right.text) : null,
    }),
    [docs]
  )
  const bothValid = parsed.left?.ok === true && parsed.right?.ok === true

  /* ----------------------------------------------- Comparación (asíncrona) */
  const [run, setRun] = React.useState<{ res: DiffResult; for: typeof parsed } | null>(null)
  /* El último resultado sigue visible mientras se recalcula con otras reglas,
     pero nunca se muestra sobre documentos distintos. */
  const result = run && run.for === parsed ? run.res : null
  const [comparing, setComparing] = React.useState(false)
  const runId = React.useRef(0)
  const { ignoreArrayOrder, ignoreWhitespace } = options

  const compare = React.useCallback(() => {
    if (!(parsed.left?.ok && parsed.right?.ok)) return
    const id = ++runId.current
    const [a, b] = [parsed.left.data, parsed.right.data]
    setComparing(true)
    window.setTimeout(() => {
      if (id !== runId.current) return
      setRun({ res: computeDiff(a, b, { ignoreArrayOrder, ignoreWhitespace }), for: parsed })
      setComparing(false)
    }, ENGINE_DELAY)
  }, [parsed, ignoreArrayOrder, ignoreWhitespace])

  /* Compara de nuevo cuando cambian los documentos o las reglas */
  React.useEffect(() => {
    if (bothValid) compare()
    else {
      runId.current++
      setComparing(false)
    }
  }, [compare, bothValid])

  /* ------------------------------------------------------- Selección */
  const [selectedId, setSelectedId] = React.useState<string>()
  const [arrival, setArrival] = React.useState(0)
  const [filter, setFilter] = React.useState<DiffFilter>("all")
  const [query, setQuery] = React.useState("")
  const entries = React.useMemo(() => result?.entries ?? [], [result])

  React.useEffect(() => {
    setSelectedId(entries[0]?.id)
  }, [entries])

  const leftRef = React.useRef<HTMLDivElement>(null)
  const rightRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const syncFrom = (src: React.RefObject<HTMLDivElement | null>, dst: React.RefObject<HTMLDivElement | null>) => () => {
    if (!options.syncScroll || !src.current || !dst.current) return
    if (Math.abs(dst.current.scrollTop - src.current.scrollTop) > 1) dst.current.scrollTop = src.current.scrollTop
    if (Math.abs(dst.current.scrollLeft - src.current.scrollLeft) > 1) dst.current.scrollLeft = src.current.scrollLeft
  }

  /* Lleva la diferencia a un tercio de la altura. Con scroll sincronizado mueve
     un solo panel y el otro lo sigue, así no compiten dos animaciones. */
  const reveal = React.useCallback(
    (id: string) => {
      const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth"
      const targets = [leftRef, rightRef]
        .map((ref) => ({ box: ref.current, row: ref.current?.querySelector<HTMLElement>(`[data-entry="${id}"]`) }))
        .filter((t): t is { box: HTMLDivElement; row: HTMLElement } => !!t.box && !!t.row)
      for (const t of options.syncScroll ? targets.slice(0, 1) : targets)
        t.box.scrollTo({ top: t.row.offsetTop - t.box.clientHeight / 3, behavior })
    },
    [options.syncScroll]
  )

  const select = React.useCallback(
    (id: string) => {
      setSelectedId(id)
      setArrival((n) => n + 1)
      requestAnimationFrame(() => reveal(id))
    },
    [reveal]
  )

  const visible = entries.filter(
    (e) => (filter === "all" || e.kind === filter) && e.path.toLowerCase().includes(query.trim().toLowerCase())
  )
  /* Al filtrar o buscar, la selección salta a la primera coincidencia */
  const visibleKey = visible.map((e) => e.id).join()
  React.useEffect(() => {
    if (visible.length && !visible.some((e) => e.id === selectedId)) select(visible[0].id)
  }, [visibleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = (dir: 1 | -1) => {
    if (!visible.length) return
    const i = visible.findIndex((e) => e.id === selectedId)
    const next = visible[i < 0 ? (dir === 1 ? 0 : visible.length - 1) : (i + dir + visible.length) % visible.length]
    select(next.id)
  }

  /* ------------------------------------------------------------ Atajos */
  const keys = React.useRef({ step, compare })
  keys.current = { step, compare }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault()
        keys.current.step(1)
      } else if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault()
        keys.current.step(-1)
      } else if (mod && e.key === "Enter") {
        e.preventDefault()
        keys.current.compare()
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ------------------------------------------------------- Documentos */
  const setDoc = (side: Side, doc: Doc | null) => setDocs((d) => ({ ...d, [side]: doc }))
  const openFile = (side: Side) => async (file: File) => setDoc(side, { name: file.name, text: await file.text() })
  const pasteText = (side: Side) => (text: string) =>
    setDoc(side, { name: side === "left" ? "pegado-a.json" : "pegado-b.json", text })
  const loadSample = () => setDocs(SAMPLE)
  const noDocs = !docs.left && !docs.right

  const paneState = (side: Side): PaneState => {
    const p = parsed[side]
    const doc = docs[side]
    if (!p || !doc) return { kind: "empty" }
    if (!p.ok) return { kind: "error", text: doc.text, message: p.message, line: p.line, column: p.column }
    if (result) return { kind: "ready", lines: side === "left" ? result.left : result.right }
    return { kind: "ready", lines: computeDiff(p.data, p.data).left }
  }

  const panelStatus: PanelStatus = (() => {
    if (!docs.left || !docs.right) return { kind: "waiting" }
    const bad = (["left", "right"] as const).find((s) => parsed[s] && !parsed[s]!.ok)
    if (bad) {
      const p = parsed[bad] as Extract<ParseResult, { ok: false }>
      return {
        kind: "blocked",
        reason: `El documento ${bad === "left" ? "A" : "B"} no es JSON válido (línea ${p.line}, columna ${p.column}). Corrígelo o abre otro archivo.`,
      }
    }
    if (comparing || !result) return { kind: "loading" }
    return { kind: "ready" }
  })()

  const statusLine = {
    waiting: { tone: "bg-muted-foreground/60", text: "Esperando documentos" },
    blocked: { tone: "bg-diff-removed", text: "Documento con errores" },
    loading: { tone: "bg-primary animate-pulse", text: "Comparando…" },
    ready: {
      tone: "bg-diff-added",
      text: entries.length
        ? `${entries.length} ${entries.length === 1 ? "diferencia" : "diferencias"}`
        : "Sin diferencias",
    },
  }[panelStatus.kind]

  const pane = (side: Side) => (
    <CodePane
      side={side}
      fileName={docs[side]?.name}
      state={paneState(side)}
      selectedId={selectedId}
      arrival={arrival}
      wrap={options.wrap}
      onSelectEntry={setSelectedId}
      onRevealEntry={select}
      onOpenFile={openFile(side)}
      onPasteText={pasteText(side)}
      onClear={() => setDoc(side, null)}
      scrollRef={side === "left" ? leftRef : rightRef}
      onScroll={side === "left" ? syncFrom(leftRef, rightRef) : syncFrom(rightRef, leftRef)}
    />
  )

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <AppHeader
          format={format}
          onFormatChange={setFormat}
          view={view}
          onViewChange={setView}
          options={options}
          onOptionsChange={setOptions}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSwap={() => setDocs((d) => ({ left: d.right, right: d.left }))}
          onCompare={compare}
          comparing={comparing}
          canCompare={bothValid}
        />

        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1 flex-col">
          <ResizablePanel defaultSize="64" minSize="25">
            {view === "split" || !result ? (
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel defaultSize="50" minSize="20">
                  {pane("left")}
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize="50" minSize="20">
                  {pane("right")}
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <DiffTree entries={entries} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="36" minSize="15">
            <DiffPanel
              entries={entries}
              status={panelStatus}
              selectedId={selectedId}
              onSelect={view === "split" ? select : setSelectedId}
              filter={filter}
              onFilterChange={setFilter}
              query={query}
              onQueryChange={setQuery}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onLoadSample={noDocs ? loadSample : undefined}
              searchRef={searchRef}
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Barra de estado */}
        <footer className="bg-titlebar text-muted-foreground flex h-7 shrink-0 items-center gap-4 border-t px-3 text-[11px]">
          <span className="text-foreground/80 flex items-center gap-1.5" aria-live="polite">
            <span className={cn("size-1.5 rounded-full", statusLine.tone)} />
            {statusLine.text}
          </span>
          <span className="hidden sm:inline">
            Orden de arreglos: {options.ignoreArrayOrder ? "ignorado" : "estricto"}
          </span>
          <span className="hidden md:inline">
            Desplazamiento {options.syncScroll ? "sincronizado" : "independiente"}
          </span>
          <span className="ml-auto">JSON · UTF-8</span>
        </footer>
      </div>
    </TooltipProvider>
  )
}

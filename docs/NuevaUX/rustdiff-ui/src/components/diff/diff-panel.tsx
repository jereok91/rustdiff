import * as React from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  GitCompareArrowsIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { DIFF_META, DiffDot, DiffKindBadge, diffTone } from "./diff-kind"
import { changedSpan, type DiffEntry, type DiffKind } from "./engine"

export type DiffFilter = "all" | DiffKind
export type PanelStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "waiting" }
  | { kind: "blocked"; reason: string }

/* ------------------------------------------------------------ Ruta JSON -- */
export function JsonPath({ path, className }: { path: string; className?: string }) {
  const parts = path.match(/^\$|\.[^.[]+|\[[^\]]+\]/g) ?? [path]
  return (
    <span className={cn("font-mono text-[12.5px]", className)}>
      {parts.map((p, i) => {
        const last = i === parts.length - 1
        if (p === "$")
          return (
            <span key={i} className="text-muted-foreground/70">
              $
            </span>
          )
        if (p.startsWith("["))
          return (
            <span key={i} className={last ? "text-foreground font-medium" : "text-muted-foreground"}>
              {p}
            </span>
          )
        return (
          <span key={i}>
            <span className="text-muted-foreground/60">.</span>
            <span className={last ? "text-foreground font-medium" : "text-muted-foreground"}>{p.slice(1)}</span>
          </span>
        )
      })}
    </span>
  )
}

/* ------------------------------------------------------- Valor en tabla -- */
export function ValueChip({ value, other, kind }: { value?: string; other?: string; kind: DiffKind }) {
  if (value === undefined)
    return (
      <span className="text-muted-foreground/60" aria-label="Sin valor">
        —
      </span>
    )
  const truncated = value.length > 48 ? value.slice(0, 47) + "…" : value
  let body: React.ReactNode = truncated
  if (kind === "changed" && other !== undefined && value.length <= 48) {
    const [a, b] = changedSpan(value, other).a
    if (b > a)
      body = (
        <>
          {value.slice(0, a)}
          <mark className={cn("rounded-[3px] px-px", diffTone.changed.emphasis)}>{value.slice(a, b)}</mark>
          {value.slice(b)}
        </>
      )
  }
  return (
    <span
      title={value}
      className="bg-muted/70 text-foreground/90 inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 align-middle font-mono text-xs"
    >
      {body}
    </span>
  )
}

function LineRef({ e }: { e: DiffEntry }) {
  const l = e.leftLines?.[0]
  const r = e.rightLines?.[0]
  const text = l && r ? (l === r ? `${l}` : `${l} → ${r}`) : `${l ?? r}`
  return <span className="text-muted-foreground font-mono text-xs tabular">{text}</span>
}

/* ----------------------------------------------------- Estados vacíos -- */
function PanelState({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone?: "ok" | "error"
  title: string
  children?: React.ReactNode
}) {
  return (
    <Empty className="h-full gap-3 p-6">
      <EmptyMedia
        className={cn(
          tone === "ok" && "bg-diff-added/12 text-diff-added-foreground",
          tone === "error" && "bg-diff-removed/12 text-diff-removed-foreground"
        )}
      >
        {icon}
      </EmptyMedia>
      <EmptyTitle className="text-sm">{title}</EmptyTitle>
      {children && <EmptyDescription className="text-xs/5">{children}</EmptyDescription>}
    </Empty>
  )
}

/* -------------------------------------------------------------- Panel -- */
interface DiffPanelProps {
  entries: DiffEntry[]
  status?: PanelStatus
  selectedId?: string
  onSelect: (id: string) => void
  filter: DiffFilter
  onFilterChange: (f: DiffFilter) => void
  query: string
  onQueryChange: (q: string) => void
  onPrev: () => void
  onNext: () => void
  onLoadSample?: () => void
  searchRef?: React.Ref<HTMLInputElement>
}

export function DiffPanel({
  entries,
  status = { kind: "ready" },
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  onPrev,
  onNext,
  onLoadSample,
  searchRef,
}: DiffPanelProps) {
  const counts = React.useMemo(
    () => ({
      all: entries.length,
      added: entries.filter((e) => e.kind === "added").length,
      removed: entries.filter((e) => e.kind === "removed").length,
      changed: entries.filter((e) => e.kind === "changed").length,
    }),
    [entries]
  )

  const ready = status.kind === "ready"
  const visible = entries.filter(
    (e) => (filter === "all" || e.kind === filter) && e.path.toLowerCase().includes(query.trim().toLowerCase())
  )
  const position = visible.findIndex((e) => e.id === selectedId)
  const canNavigate = ready && visible.length > 0

  let body: React.ReactNode
  if (status.kind === "loading") {
    body = (
      <div className="space-y-px p-3" aria-busy="true" aria-label="Comparando documentos">
        {[64, 48, 56, 40, 52].map((w, i) => (
          <div key={i} className="flex h-9 items-center gap-4 px-1">
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3" style={{ width: `${w * 4}px` }} />
            <Skeleton className="ml-auto h-5 w-28" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
    )
  } else if (status.kind === "waiting") {
    body = (
      <PanelState icon={<GitCompareArrowsIcon />} title="Abre dos documentos para comparar">
        Suelta un archivo en cada panel, o pégalo. Las diferencias aparecerán aquí, ordenadas por línea.
        {onLoadSample && (
          <Button variant="link" size="xs" className="mt-1 block w-full" onClick={onLoadSample}>
            Cargar documentos de ejemplo
          </Button>
        )}
      </PanelState>
    )
  } else if (status.kind === "blocked") {
    body = (
      <PanelState icon={<CircleAlertIcon />} tone="error" title="No se puede comparar todavía">
        {status.reason}
      </PanelState>
    )
  } else if (entries.length === 0) {
    body = (
      <PanelState icon={<CircleCheckIcon />} tone="ok" title="Los documentos son idénticos">
        No hay diferencias estructurales entre A y B.
      </PanelState>
    )
  } else if (visible.length === 0) {
    body = (
      <PanelState icon={<SearchXIcon />} title="Sin resultados">
        Ninguna diferencia coincide con el filtro o la búsqueda.
      </PanelState>
    )
  } else {
    body = (
      <Table className="table-fixed">
        <TableHeader className="bg-card sticky top-0 z-10 [&_tr]:border-b">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-8 w-10 pl-4 text-xs font-medium">#</TableHead>
            <TableHead className="text-muted-foreground h-8 w-32 text-xs font-medium">Tipo</TableHead>
            <TableHead className="text-muted-foreground h-8 text-xs font-medium">Ruta</TableHead>
            <TableHead className="text-muted-foreground hidden h-8 w-20 text-xs font-medium @2xl:table-cell">
              Línea
            </TableHead>
            <TableHead className="text-muted-foreground h-8 w-[22%] text-xs font-medium">Izquierdo</TableHead>
            <TableHead className="text-muted-foreground h-8 w-[22%] text-xs font-medium">Derecho</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((e) => {
            const selected = e.id === selectedId
            return (
              <TableRow
                key={e.id}
                tabIndex={0}
                aria-selected={selected}
                data-state={selected ? "selected" : undefined}
                onClick={() => onSelect(e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault()
                    onSelect(e.id)
                  }
                }}
                className="data-[state=selected]:bg-accent focus-visible:outline-ring border-border/60 cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <TableCell
                  className={cn(
                    "py-1.5 pl-4 text-xs tabular",
                    selected ? "text-primary font-semibold" : "text-muted-foreground"
                  )}
                >
                  {entries.indexOf(e) + 1}
                </TableCell>
                <TableCell className="py-1.5">
                  <DiffKindBadge kind={e.kind} />
                </TableCell>
                <TableCell className="truncate py-1.5" title={e.path}>
                  <JsonPath path={e.path} />
                </TableCell>
                <TableCell className="hidden py-1.5 @2xl:table-cell">
                  <LineRef e={e} />
                </TableCell>
                <TableCell className="py-1.5">
                  <ValueChip value={e.left} other={e.right} kind={e.kind} />
                </TableCell>
                <TableCell className="py-1.5">
                  <ValueChip value={e.right} other={e.left} kind={e.kind} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <section aria-label="Diferencias" className="bg-card @container flex h-full min-h-0 flex-col">
      {/* Barra del panel */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <h2 className="hidden text-sm font-semibold @xl:block">Diferencias</h2>

        <ToggleGroup
          type="single"
          size="sm"
          value={filter}
          disabled={!ready || entries.length === 0}
          onValueChange={(v) => v && onFilterChange(v as DiffFilter)}
          className="bg-muted/60 gap-0.5 rounded-lg p-0.5"
          aria-label="Filtrar por tipo"
        >
          {(["all", "added", "removed", "changed"] as const).map((k) => (
            <ToggleGroupItem
              key={k}
              value={k}
              aria-label={`${k === "all" ? "Todas" : DIFF_META[k].plural}: ${counts[k]}`}
              className="data-[state=on]:bg-background h-7 gap-1.5 rounded-md! px-2.5 text-xs data-[state=on]:shadow-xs"
            >
              {k !== "all" && <DiffDot kind={k} />}
              <span className={cn(k !== "all" && "hidden @4xl:inline")}>
                {k === "all" ? "Todas" : DIFF_META[k].plural}
              </span>
              <span className="text-muted-foreground tabular">{ready ? counts[k] : "–"}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              ref={searchRef}
              value={query}
              disabled={!ready || entries.length === 0}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.preventDefault(), e.shiftKey ? onPrev() : onNext())
                if (e.key === "Escape") onQueryChange("")
              }}
              placeholder="Buscar ruta…"
              aria-label="Buscar ruta"
              className="peer h-8 w-36 pr-7 pl-8 text-xs md:text-xs @4xl:w-56 @4xl:pr-12"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="Limpiar búsqueda"
                className="text-muted-foreground hover:text-foreground hover:bg-accent absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-sm transition-colors"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : (
              <KbdGroup className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 transition-opacity peer-focus:opacity-0 @4xl:inline-flex">
                <Kbd>⌘</Kbd>
                <Kbd>F</Kbd>
              </KbdGroup>
            )}
          </div>
          <span className="text-muted-foreground hidden min-w-10 text-right text-xs tabular @lg:inline" aria-live="polite">
            {canNavigate ? `${position + 1 || "–"} / ${visible.length}` : ""}
          </span>
          <div className="flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-r-none"
                  onClick={onPrev}
                  disabled={!canNavigate}
                  aria-label="Diferencia anterior"
                >
                  <ChevronUpIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Diferencia anterior
                <KbdGroup>
                  <Kbd>⌥</Kbd>
                  <Kbd>↑</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="-ml-px rounded-l-none"
                  onClick={onNext}
                  disabled={!canNavigate}
                  aria-label="Siguiente diferencia"
                >
                  <ChevronDownIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Siguiente diferencia
                <KbdGroup>
                  <Kbd>⌥</Kbd>
                  <Kbd>↓</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </section>
  )
}

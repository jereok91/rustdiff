import * as React from "react"
import { ArrowRightIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { DIFF_META, DiffDot, diffTone } from "./diff-kind"
import { ValueChip } from "./diff-panel"
import type { DiffEntry, DiffKind } from "./engine"

interface Node {
  id: string
  label: string
  children: Node[]
  entry?: DiffEntry
  counts: Record<DiffKind, number>
}

const segments = (path: string) => path.match(/\.[^.[]+|\[[^\]]+\]/g) ?? []

function buildTree(entries: DiffEntry[]): Node {
  const root: Node = { id: "$", label: "$", children: [], counts: { added: 0, removed: 0, changed: 0 } }
  for (const e of entries) {
    let node = root
    let id = "$"
    node.counts[e.kind]++
    for (const seg of segments(e.path)) {
      id += seg
      let child = node.children.find((c) => c.id === id)
      if (!child) {
        child = {
          id,
          label: seg.startsWith(".") ? seg.slice(1) : seg,
          children: [],
          counts: { added: 0, removed: 0, changed: 0 },
        }
        node.children.push(child)
      }
      child.counts[e.kind]++
      node = child
    }
    node.entry = e
  }
  return root
}

function Counts({ counts }: { counts: Record<DiffKind, number> }) {
  return (
    <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-2.5 pl-4 text-xs tabular">
      {(["added", "removed", "changed"] as const).map((k) =>
        counts[k] ? (
          <span key={k} className="flex items-center gap-1" title={`${counts[k]} ${DIFF_META[k].plural.toLowerCase()}`}>
            <DiffDot kind={k} className="size-1.5" />
            {counts[k]}
          </span>
        ) : null
      )}
    </span>
  )
}

/** Vista de árbol: solo las ramas del documento que contienen diferencias. */
export function DiffTree({
  entries,
  selectedId,
  onSelect,
}: {
  entries: DiffEntry[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const root = React.useMemo(() => buildTree(entries), [entries])
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const rows: React.ReactNode[] = []
  const walk = (node: Node, depth: number) => {
    for (const child of node.children) {
      const isLeaf = !!child.entry && child.children.length === 0
      const open = !collapsed.has(child.id)
      const selected = child.entry?.id === selectedId
      const pad = { paddingLeft: `${12 + depth * 18}px` }
      if (isLeaf) {
        const e = child.entry!
        rows.push(
          <div
            key={child.id}
            role="treeitem"
            aria-selected={selected}
            tabIndex={0}
            onClick={() => onSelect(e.id)}
            onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onSelect(e.id))}
            style={pad}
            className={cn(
              "focus-visible:outline-ring flex h-9 cursor-pointer items-center gap-2 pr-3 outline-none hover:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2",
              selected && "bg-accent hover:bg-accent"
            )}
          >
            <span className={cn("w-4 text-center font-mono text-sm font-semibold", diffTone[e.kind].marker)} aria-hidden>
              {DIFF_META[e.kind].marker}
            </span>
            <span className="font-mono text-[12.5px] font-medium">{child.label}</span>
            <span className="sr-only">{DIFF_META[e.kind].label}</span>
            <span className="ml-auto flex min-w-0 items-center gap-2 pl-4">
              <ValueChip value={e.left} other={e.right} kind={e.kind} />
              <ArrowRightIcon className="text-muted-foreground size-3.5 shrink-0" />
              <ValueChip value={e.right} other={e.left} kind={e.kind} />
            </span>
          </div>
        )
      } else {
        rows.push(
          <div
            key={child.id}
            role="treeitem"
            aria-expanded={open}
            tabIndex={0}
            onClick={() => toggle(child.id)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") (ev.preventDefault(), toggle(child.id))
              if (ev.key === "ArrowLeft" && open) toggle(child.id)
              if (ev.key === "ArrowRight" && !open) toggle(child.id)
            }}
            style={pad}
            className="focus-visible:outline-ring hover:bg-accent/60 flex h-8 cursor-pointer items-center gap-2 pr-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            <ChevronRightIcon
              className={cn("text-muted-foreground size-4 transition-transform duration-150", open && "rotate-90")}
            />
            <span className="text-muted-foreground font-mono text-[12.5px]">{child.label}</span>
            <Counts counts={child.counts} />
          </div>
        )
        if (open) walk(child, depth + 1)
      }
    }
  }
  walk(root, 0)

  return (
    <div role="tree" aria-label="Diferencias por estructura" className="bg-editor h-full overflow-auto py-2">
      <div className="mx-auto max-w-5xl">{rows}</div>
    </div>
  )
}

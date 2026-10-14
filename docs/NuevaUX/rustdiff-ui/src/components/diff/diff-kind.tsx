import { MinusIcon, PenLineIcon, PlusIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DiffKind } from "./engine"

export const DIFF_META: Record<DiffKind, { label: string; plural: string; icon: LucideIcon; marker: string }> = {
  added: { label: "Agregado", plural: "Agregados", icon: PlusIcon, marker: "+" },
  removed: { label: "Eliminado", plural: "Eliminados", icon: MinusIcon, marker: "−" },
  changed: { label: "Modificado", plural: "Modificados", icon: PenLineIcon, marker: "~" },
}

/** Clases por tipo de diff — una sola fuente para filas, puntos y marcadores. */
export const diffTone = {
  added: {
    row: "bg-diff-added/10",
    rowStrong: "bg-diff-added/20",
    emphasis: "bg-diff-added/30 text-diff-added-foreground",
    marker: "text-diff-added-foreground",
    bar: "bg-diff-added",
    dot: "bg-diff-added",
  },
  removed: {
    row: "bg-diff-removed/10",
    rowStrong: "bg-diff-removed/20",
    emphasis: "bg-diff-removed/30 text-diff-removed-foreground",
    marker: "text-diff-removed-foreground",
    bar: "bg-diff-removed",
    dot: "bg-diff-removed",
  },
  changed: {
    row: "bg-diff-changed/10",
    rowStrong: "bg-diff-changed/20",
    emphasis: "bg-diff-changed/35 text-diff-changed-foreground",
    marker: "text-diff-changed-foreground",
    bar: "bg-diff-changed",
    dot: "bg-diff-changed",
  },
} satisfies Record<DiffKind, Record<string, string>>

export function DiffKindBadge({ kind, className }: { kind: DiffKind; className?: string }) {
  const { label, icon: Icon } = DIFF_META[kind]
  return (
    <Badge variant={kind} className={cn("gap-1 pl-1.5", className)}>
      <Icon strokeWidth={2.5} />
      {label}
    </Badge>
  )
}

export function DiffDot({ kind, className }: { kind: DiffKind; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", diffTone[kind].dot, className)} />
}

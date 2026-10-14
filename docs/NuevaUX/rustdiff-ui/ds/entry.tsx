/* Paquete IIFE para la guía visual: expone los componentes en window.RustDiffUI
   e incluye su propio React 19 (los componentes shadcn v4 usan `ref` como prop). */
import "./bundle.entry.css"
import * as React from "react"
import { createRoot } from "react-dom/client"

import App from "@/App"
import { TooltipProvider } from "@/components/ui/tooltip"
import { computeDiff, parseDocument } from "@/components/diff/engine"
import { leftDoc, rightDoc } from "@/components/diff/sample"

export { Button } from "@/components/ui/button"
export { Badge } from "@/components/ui/badge"
export { Kbd, KbdGroup } from "@/components/ui/kbd"
export { Input } from "@/components/ui/input"
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
export { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
export { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
export { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
export { Separator } from "@/components/ui/separator"
export { Skeleton } from "@/components/ui/skeleton"
export { Spinner } from "@/components/ui/spinner"
export { DiffTree } from "@/components/diff/diff-tree"
export { DiffKindBadge, DiffDot } from "@/components/diff/diff-kind"
export { CodePane } from "@/components/diff/code-pane"
export { DiffPanel, JsonPath, ValueChip } from "@/components/diff/diff-panel"
export { AppHeader } from "@/components/diff/app-header"
export { App as RustDiffApp, computeDiff, parseDocument }

export const demo = computeDiff(leftDoc, rightDoc)
export const h = React.createElement
export { React }

/** Monta un árbol en `el` con el TooltipProvider ya puesto. */
export function mount(el: Element, node: React.ReactNode) {
  createRoot(el).render(React.createElement(TooltipProvider, null, node))
}

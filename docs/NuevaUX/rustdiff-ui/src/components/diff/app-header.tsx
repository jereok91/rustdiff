import {
  ArrowLeftRightIcon,
  Columns2Icon,
  GitCompareArrowsIcon,
  ListTreeIcon,
  MoonIcon,
  Settings2Icon,
  SunIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type ViewMode = "split" | "tree"
export interface CompareOptions {
  ignoreArrayOrder: boolean
  ignoreWhitespace: boolean
  syncScroll: boolean
  wrap: boolean
}

interface AppHeaderProps {
  format: string
  onFormatChange: (f: string) => void
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  options: CompareOptions
  onOptionsChange: (o: CompareOptions) => void
  theme: "light" | "dark"
  onToggleTheme: () => void
  onSwap: () => void
  onCompare: () => void
  comparing?: boolean
  canCompare?: boolean
  /** Espacio reservado para los semáforos de macOS (Tauri con titleBarStyle "Overlay"). */
  trafficLightInset?: boolean
}

function IconAction({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function AppHeader(p: AppHeaderProps) {
  const set = (k: keyof CompareOptions) => (v: boolean) => p.onOptionsChange({ ...p.options, [k]: v })

  return (
    <header
      data-tauri-drag-region
      className="bg-titlebar flex h-12 shrink-0 items-center gap-3 border-b pr-3 pl-3 data-[inset=true]:pl-20"
      data-inset={p.trafficLightInset}
    >
      {/* Marca */}
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <div className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md shadow-xs">
          <GitCompareArrowsIcon className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold tracking-tight">RustDiff</span>
      </div>

      <Separator orientation="vertical" className="h-5!" />

      <Select value={p.format} onValueChange={p.onFormatChange}>
        <SelectTrigger size="sm" className="h-8 justify-start gap-1.5 text-xs" aria-label="Formato">
          <span className="text-muted-foreground">Formato:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto</SelectItem>
          <SelectItem value="json">JSON</SelectItem>
          <SelectItem value="yaml">YAML</SelectItem>
          <SelectItem value="xml">XML</SelectItem>
          <SelectItem value="toml">TOML</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      <ToggleGroup
        type="single"
        size="sm"
        value={p.view}
        onValueChange={(v) => v && p.onViewChange(v as ViewMode)}
        className="bg-muted/60 gap-0.5 rounded-lg p-0.5"
        aria-label="Vista"
      >
        <ToggleGroupItem
          value="split"
          className="data-[state=on]:bg-background h-7 gap-1.5 rounded-md! px-2.5 text-xs data-[state=on]:shadow-xs"
        >
          <Columns2Icon /> Lado a lado
        </ToggleGroupItem>
        <ToggleGroupItem
          value="tree"
          className="data-[state=on]:bg-background h-7 gap-1.5 rounded-md! px-2.5 text-xs data-[state=on]:shadow-xs"
        >
          <ListTreeIcon /> Árbol
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-center">
        <IconAction label="Intercambiar documentos" onClick={p.onSwap}>
          <ArrowLeftRightIcon />
        </IconAction>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Opciones de comparación">
                  <Settings2Icon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Opciones de comparación</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Comparación</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={p.options.ignoreArrayOrder} onCheckedChange={set("ignoreArrayOrder")}>
              Ignorar orden de arreglos
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={p.options.ignoreWhitespace} onCheckedChange={set("ignoreWhitespace")}>
              Ignorar espacios en valores
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Editor</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={p.options.syncScroll} onCheckedChange={set("syncScroll")}>
              Sincronizar desplazamiento
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={p.options.wrap} onCheckedChange={set("wrap")}>
              Ajustar líneas largas
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <IconAction label={p.theme === "dark" ? "Tema claro" : "Tema oscuro"} onClick={p.onToggleTheme}>
          {p.theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </IconAction>
      </div>

      <Button
        size="sm"
        onClick={p.onCompare}
        disabled={p.comparing || p.canCompare === false}
        aria-busy={p.comparing}
        className="min-w-34 gap-2 pr-2"
      >
        {p.comparing ? (
          <>
            <Spinner /> Comparando…
          </>
        ) : (
          <>
            Comparar
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>
          </>
        )}
      </Button>
    </header>
  )
}

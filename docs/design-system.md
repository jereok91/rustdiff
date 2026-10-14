# RustDiff design system

Reference for the Tauri + React frontend (`desktop/`). It covers the tokens, the theme behaviour, the type scale, the component inventory and the rules for adding UI. The values themselves live in code. This page explains them and does not override them.

| What | Where |
|------|-------|
| Every color, size and duration | `desktop/src/styles/tokens.css` (the only source of truth) |
| Tailwind wiring, fonts, focus utilities, base styles | `desktop/src/styles.css` |
| Contrast pairs that must pass WCAG AA | `desktop/src/styles/contrast-pairs.ts` |
| Contrast and token tests | `desktop/src/styles/tokens.test.ts` |
| OKLCH / `color-mix` → sRGB conversion and contrast math | `desktop/src/lib/color.ts` |
| Theme logic (dark by default, system / light / dark) | `desktop/src/lib/theme.ts`, `desktop/src/hooks/use-color-scheme.ts`, inline script in `desktop/index.html` |
| CodeMirror theme and syntax colors | `desktop/src/lib/editor-theme.ts` |
| Diff decorations, gutter markers, arrival flash | `desktop/src/lib/editor-decorations.ts` |
| Primitives (shadcn/ui, new-york) | `desktop/src/components/ui/` |
| Reference prototype | `docs/NuevaUX/rustdiff-ui/` (read-only) |

## The reference prototype

The look comes from a standalone prototype built on the same stack (Vite, React 19, Tailwind CSS v4, shadcn/ui): `docs/NuevaUX/rustdiff-ui/`. Its `src/index.css` holds the palette, `src/App.tsx` the screen composition, and `src/components/diff/` the header, code panes and differences panel. Its `README.md` explains what to take from it.

The prototype is a reference, not a dependency. Nothing in `desktop/` imports from it, and it is never edited to fit the app. The app took its tokens (merged into `tokens.css`, see below), its primitives (`Badge`, `ToggleGroup`, `Empty`, `Kbd`) and its visual language, and wired them to the real IPC data. Its demo diff engine (`engine.ts`) and sample documents were not ported.

## Tokens

All colors are written in OKLCH. `:root` holds the light theme. `.dark` overrides the values that change. Components use Tailwind classes such as `bg-card`, `text-muted-foreground` and `bg-diff-added`, or `var(--token)`. They never contain raw color values.

Translucent tints are **derived**, not hand-written: `color-mix(in oklch, var(--base) p%, transparent)`. Changing a base color moves its tints with it. `lib/color.ts` evaluates that form (premultiplied alpha, shorter hue arc), so the contrast test measures the real tint.

### UI (shadcn/ui convention)

Values are the prototype's unless the **Adjusted** column says otherwise (see [Contrast adjustments](#contrast-adjustments)).

| Token | Role | Light | Dark |
|-------|------|-------|------|
| `--background` / `--foreground` | App background, body text | `oklch(0.985 0.002 260)` / `oklch(0.21 0.015 262)` | `oklch(0.155 0.008 265)` / `oklch(0.95 0.005 262)` |
| `--card` / `--card-foreground` | Panels: differences, history, search and graph toolbars | `oklch(1 0 0)` | `oklch(0.185 0.009 265)` |
| `--popover` / `--popover-foreground` | Menus, dialogs, popovers, toasts | `oklch(1 0 0)` | `oklch(0.21 0.01 265)` |
| `--primary` / `--primary-foreground` | Main action, focus, selection (cobalt blue) | `oklch(0.53 0.19 262)` | `oklch(0.67 0.16 262)` |
| `--secondary` / `--secondary-foreground` | Secondary buttons | `oklch(0.955 0.006 262)` | `oklch(0.245 0.01 265)` |
| `--muted` / `--muted-foreground` | Quiet fills (segmented controls, chips), secondary text | `oklch(0.96 0.005 262)` / `oklch(0.52 0.018 262)` | `oklch(0.235 0.01 265)` / `oklch(0.68 0.015 262)` |
| `--accent` / `--accent-foreground` | Hover, pressed items, selected row | `oklch(0.948 0.014 262)` | `oklch(0.255 0.016 265)` |
| `--destructive` / `--destructive-foreground` | Destructive actions and errors. The foreground is app-only (the prototype uses white) | `oklch(0.577 0.215 25)` / `oklch(0.985 0.005 25)` | `oklch(0.68 0.19 22)` / `oklch(0.16 0.03 22)` |
| `--border` | Decorative 1px separators | `oklch(0.915 0.007 262)` | `oklch(0.26 0.009 265)` |
| `--input` | Borders of form fields and outline buttons (≥ 3:1). **Adjusted** | `oklch(0.65 0.009 262)` | `oklch(0.505 0.01 265)` |
| `--ring` | Focus ring (≥ 3:1 on every surface) | `oklch(0.6 0.17 262)` | `oklch(0.62 0.15 262)` |
| `--radius` | Base corner radius. `rounded-sm/md/lg/xl` derive from it | `0.5rem` | — |

### Surfaces

| Token | Role | Light | Dark |
|-------|------|-------|------|
| `--titlebar` | Header and status bar | `oklch(0.975 0.004 262)` | `oklch(0.135 0.008 265)` |
| `--editor` | Code panes, graph view | `oklch(1 0 0)` | `oklch(0.175 0.008 265)` |
| `--gutter` / `--gutter-foreground` | Editor margin and line numbers | `oklch(0.975 0.004 262)` / `oklch(0.54 0.014 262)` | `oklch(0.165 0.008 265)` / `oklch(0.62 0.012 262)` |
| `--editor-selection` | Text selection. Derived from `--primary` | 16% | 20% |
| `--editor-active-line` | Active line. Derived from `--foreground` | 4% | 4% |

### Diff

Each kind (`added`, `removed`, `changed`) has two base tokens from the prototype and three derived tints:

| Token | Used for | Value |
|-------|----------|-------|
| `--diff-<kind>` | Base color: dots, bars. Always next to a word or marker | Prototype |
| `--diff-<kind>-foreground` | Readable text of the kind: badges, `+ − ~` markers, emphasized characters | Prototype (light ones adjusted) |
| `--diff-<kind>-line` | Tint of the whole line in the editor | base at 10% |
| `--diff-<kind>-inline` | Emphasis of the exact changed characters (editor and value chips) | base at 30% (changed 35%) |
| `--diff-<kind>-row` | Badge fill | base at 12% (changed 14%) |

Green, red and amber mean a difference and nothing else. They always come with a marker (`+`, `−`, `~`) or a word, never color alone.

### Syntax

`--syntax-key`, `--syntax-string`, `--syntax-number`, `--syntax-literal` (booleans, null, SQL keywords) and `--syntax-punct`. They avoid the diff hues on purpose. CodeMirror uses them for JSON, XML and SQL through one `HighlightStyle` (`SYNTAX_HIGHLIGHT` in `editor-theme.ts`), the same in both themes because the values are CSS variables.

### Graph

`--graph-background`, `--graph-node-fill`, `--graph-node-border`, `--graph-node-selected`, `--graph-node-match`, `--graph-edge`, `--graph-key`, `--graph-string`, `--graph-number`, `--graph-boolean`, `--graph-null`, `--graph-reference` and `--graph-text`.

Most are aliases of the palette, so the canvas speaks the same language as the editor: background `--gutter` (light) / `--editor` (dark), nodes `--card` / `--popover`, selection `--primary`, search match `--diff-changed-foreground` / `--diff-changed`, keys `--muted-foreground`, values the `--syntax-*` tokens (null uses `--syntax-key`, references `--syntax-punct`). Border and edge are their own neutral greys.

`lib/graph-view.ts` reads them with `getComputedStyle` and converts OKLCH to hex for the 2D canvas. Its `LIGHT_PALETTE` and `DARK_PALETTE` hold the same values already converted. They are the fallback when a variable is missing or comes back in a form the canvas helper does not parse (an unresolved `var()`, or the `lab()` that the production build emits). A test fails if they drift from the tokens.

### Layout, type and motion

| Token | Value |
|-------|-------|
| `--header-height` | `3rem` |
| `--toolbar-height` | `2.75rem` (differences panel bar, search bar, graph toolbar, history header) |
| `--control-height` | `2rem` (text inputs) |
| `--sidebar-width` | `18rem` |
| `--duration-fast` | `150ms` (hover and color transitions) |
| `--duration-arrive` / `--ease-arrive` | `700ms` / `cubic-bezier(0.16, 1, 0.3, 1)` (the arrival flash) |
| `--duration-flash` | `1.2s` (how long the jumped range stays outlined; matches `FLASH_MS` in `code-editor.tsx`) |

Use these tokens with arbitrary-value classes, for example `h-(--toolbar-height)` and `w-(--sidebar-width)`.

## Theme

- The default is **Dark**. With nothing saved (or an unreadable value) the app starts dark, whatever the system says.
- The user can pick **Main menu → Theme → System / Light / Dark**. **System** follows `prefers-color-scheme` and keeps following it live. The sun/moon button in the header is a shortcut that switches between Light and Dark.
- The choice is stored in `localStorage` under `rustdiff.theme`. The backend `settings.json` has no theme field. If storage is blocked, the choice lasts for the session only.
- To apply a theme, the app toggles the `.dark` class on `<html>` and sets `color-scheme`, so native scrollbars follow. An inline script in `index.html` resolves the theme before the first paint, and `<html>` ships with `class="dark"`, so the window never flashes light. `main.tsx` applies it again before React renders.
- The `dark:` variant matches `.dark` (the app) and `[data-theme="dark"]` (the prototype's visual guide).
- The class switches synchronously, before React re-renders. Because of that, CodeMirror and the graph canvas read the new tokens on the same change:
  - Every editor color, including syntax, is a CSS variable, so the editor follows the class by itself. The theme extension only swaps CodeMirror's `dark` flag.
  - The graph view drops its cached palette whenever `scheme` changes, then redraws.

## Typography

**Geist** for the interface and **Geist Mono** for code, both variable fonts, self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`. The `.woff2` files are bundled into `desktop/dist` and embedded in the binary, so there is no CDN request and the fonts work inside the Flatpak sandbox. The body enables Geist's `ss01` and `cv11` features.

| Class | Size / line height | Use |
|-------|--------------------|-----|
| `text-caption` | 12 / 16 px | Metadata, counters, status bar, tooltips, kbd, table header, badges |
| `text-body` | 14 / 20 px | Default UI text, menus, buttons, table |
| `text-code` | 12.5 / 20 px | Editors, paths, graph node detail |
| `text-title` | 18 / 24 px | Dialog titles |
| `text-display` | 28 / 36 px | Welcome title |

- **Sans stack** (`--font-family-sans`, `font-sans`): `"Geist Variable", ui-sans-serif, system-ui, sans-serif`.
- **Mono stack** (`--font-family-mono`, `font-mono`): `"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace`. The graph canvas uses the same stack (a test checks it) and measures it again once `document.fonts.ready` resolves.
- All sizes are in `rem`. The **Text Size** setting (`ui_scale`) scales the root font size, so it scales the whole scale proportionally.
- Use the `tabular` utility (tabular numbers) for counters, line numbers and positions.

## Accessibility

- **Focus.** There is one focus ring everywhere: a 2px outline in `--ring`, shown only on `:focus-visible`. Use `focus-ring` for controls and `focus-ring-inset` for surfaces that fill their panel (table, canvas, list rows, menu items). A base rule gives the same ring to any focusable element that has no style of its own. The focused editor shows the ring inset, which also tells you which editor Ctrl+F will search.
- **Icon-only buttons** go through `IconButton`, which requires `label`. The label becomes the `aria-label` and the tooltip.
- **Paths.** `JsonPath` paints the segments (ancestors dimmed, last segment emphasized) as decoration and exposes the full path once as plain text to screen readers.
- **Exit dialog.** Cancel gets focus on open and is first in the Tab order. "Close without saving" is last. Escape cancels.
- **Graph.** The canvas is focusable and described by a screen-reader hint. `+`/`-` zoom, `0` fits, arrows pan, Escape closes the node detail. Ctrl shortcuts stay with the app.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, all animations and transitions are turned off, including the arrival flash. The jumped range keeps its static outline for the same time, so no information is lost.
- **Keys on colored fills.** `Kbd` inside the primary button and inside tooltips drops its translucent fill and uses an outline instead, so its text stays on the measured pair (`--primary-foreground` on `--primary`, `--background` on `--foreground`).

## Contrast results

WCAG 2.x ratios computed by `tokens.test.ts` from the token values. Translucent layers are composited first, in the order they are painted (for example, emphasized characters: `--diff-*-inline` over `--diff-*-line` over `--editor`). The thresholds are 4.5:1 for text and 3:1 for UI indicators (ring, input borders, graph outlines). All 97 pairs pass in both themes. To print the full table, run `PRINT_CONTRAST=1 pnpm test tokens`.

| Pair | Tokens | Light | Dark |
|------|--------|------:|-----:|
| Body text | `--foreground` on `--background` | 16.97 | 16.89 |
| Header and status bar text | `--foreground` on `--titlebar` | 16.49 | 17.30 |
| Secondary text on muted fill (lowest) | `--muted-foreground` on `--muted` | 4.90 | 5.79 |
| Primary button | `--primary-foreground` on `--primary` | 5.24 | 6.39 |
| Selected row number | `--primary` on `--accent` | 4.70 | 5.19 |
| Destructive button | `--destructive-foreground` on `--destructive` | 4.63 | 6.20 |
| Error text in status bar | `--destructive` on `--titlebar` | 4.50 | 6.36 |
| Line numbers | `--gutter-foreground` on `--gutter` | 4.71 | 5.29 |
| Code | `--foreground` on `--editor` | 17.72 | 16.39 |
| Lowest syntax color on the editor | `--syntax-number` (light) / `--syntax-punct` (dark) on `--editor` | 5.74 | 6.10 |
| Selected punctuation (lowest selection pair) | `--syntax-punct` on `--editor-selection` | 4.78 | 4.59 |
| Punctuation on a changed line | `--syntax-punct` on `--diff-changed-line` | 5.56 | 5.17 |
| Added characters in the editor | `--diff-added-foreground` on `--diff-added-inline` | 5.04 | 5.12 |
| Removed characters in the editor | `--diff-removed-foreground` on `--diff-removed-inline` | 4.60 | 5.34 |
| Changed characters in a value chip | `--diff-changed-foreground` on `--diff-changed-inline` | 4.55 | 4.88 |
| Changed badge on the selected row | `--diff-changed-foreground` on `--diff-changed-row` | 5.08 | 7.69 |
| Focus ring (lowest surface, UI) | `--ring` on `--titlebar` / `--popover` | 3.76 | 4.79 |
| Input border (lowest surface, UI) | `--input` on `--titlebar` / `--popover` | 3.01 | 3.02 |
| Graph references | `--graph-reference` on `--graph-node-fill` | 6.00 | 5.70 |
| Selected node outline (UI) | `--graph-node-selected` on `--graph-background` | 5.09 | 6.24 |
| Search match outline (UI) | `--graph-node-match` on `--graph-background` | 6.03 | 10.00 |

`--border` is decorative: it separates regions that are already identified by their content and position. It is exempt from the 3:1 rule on purpose. Use `--input` for any border that identifies a control. The diff base colors (`--diff-*`) only paint dots and bars that always sit next to a word, a count or a marker, so they are not measured either.

### Contrast adjustments

The prototype's palette was kept wherever it passes. Every value that changed, with the ratio before and after:

| Token | Before → after | Why |
|-------|----------------|-----|
| `--input` (light) | `oklch(0.885 0.009 262)` → `oklch(0.65 0.009 262)` | Input border on `--titlebar` 1.31 → 3.01 (all four surfaces now ≥ 3.01) |
| `--input` (dark) | `oklch(0.3 0.01 265)` → `oklch(0.505 0.01 265)` | Input border on `--popover` 1.30 → 3.02. Outline controls no longer use the prototype's `bg-input/30` fill, which would brighten with the new value |
| `--diff-removed-foreground` (light) | `oklch(0.5 0.18 23)` → `oklch(0.465 0.18 23)` | Removed characters in the editor 3.95 → 4.60 |
| `--diff-changed-foreground` (light) | `oklch(0.5 0.12 62)` → `oklch(0.49 0.115 62)` | Changed characters in a value chip 4.37 → 4.55 (also brings it inside sRGB) |
| `--syntax-punct` (light) | `oklch(0.55 0.015 262)` → `oklch(0.5 0.015 262)` | Punctuation on a removed line 4.25 → 5.25, on the active line 4.48 → 5.54, selected 3.54 → 4.78 |
| `--syntax-punct` (dark) | `oklch(0.6 0.012 262)` → `oklch(0.66 0.012 262)` | Punctuation on a changed line 4.07 → 5.17, selected 2.88 → 4.59; graph references 4.49 → 5.70 |
| `--editor-selection` | derived from `--primary` at 22% (light) / 32% (dark, the prototype's `::selection`) → 16% / 20% | Together with `--syntax-punct`, keeps every syntax color ≥ 4.5 on a selection |

Out-of-gamut values were brought to the sRGB edge by lowering only the chroma (what the browser would paint anyway, and what the gamut test requires): light `--diff-added-foreground` 0.12 → 0.109, light `--syntax-number` 0.11 → 0.086, dark `--diff-removed-foreground` 0.12 → 0.114.

## Component inventory

Primitives live in `components/ui/`. They hold no app logic and are not translated, so the caller passes any user-facing labels.

| Primitive | Notes |
|-----------|-------|
| `Button` | Variants `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. Sizes `xs`, `sm`, `default`, `lg`, `icon-xs`, `icon-sm`, `icon`. Exposes `data-variant` and `data-button-variant`; `Kbd` keys off the latter because a `TooltipTrigger asChild` overwrites `data-slot` |
| `IconButton` | Icon-only `Button` with a required `label` (aria-label and tooltip) and an optional longer `tooltip` |
| `Badge` | Variants `default`, `secondary`, `outline` and the diff kinds `added`, `removed`, `changed` |
| `Toggle`, `ToggleGroup` | `segmentedGroup` / `segmentedItem` give the prototype's segmented control (header views, panel filters) |
| `Empty` | `Empty`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`: empty states of the differences panel |
| `Kbd`, `KbdGroup` | Keys of a shortcut, adapted to tooltips and the primary button |
| `Input` | Text and search fields. Uses `--control-height` and `--input`. Search fields put the icon inside |
| `Select` | Format picker |
| `DropdownMenu` | Main menu and export menu, with radio groups and submenus |
| `Dialog`, `AlertDialog` | Shortcuts dialog. Exit and clear-history confirmations |
| `Popover` | Graph node detail |
| `Tooltip` | One `TooltipProvider` at the app root (the differences panel nests its own so it also renders alone) |
| `Separator`, `Resizable` | Layout |

App components, and the surface each one uses:

| Component | Surface and structure |
|-----------|-----------------------|
| `AppHeader` | `titlebar`, Tauri drag region. Brand · open A/B, format select + Format · drag space · views (history, graph, differences) · export, theme, main menu · one primary action (Compare with its `Kbd`, or Enable comparison) |
| `EditorPane` (in `App.tsx`) | `editor`. Header with the A/B letter, file name, format and line count, and open |
| `CodeEditor` | `editor` with `gutter`: line numbers, fold, `+ − ~` markers; line tints, character emphasis, arrival flash |
| `DiffKindBadge`, `DiffDot`, `JsonPath` (`diff-kind.tsx`) | Kind identity and paths, shared by the panel |
| `DiffTable` | `card`. Bar: title, filters with counts, summary, position, previous/next. Grid: #, kind badge, path, value chips. `Empty` states |
| `SearchBar` | `card` toolbar |
| `HistorySidebar` | `card` |
| `GraphView` | `card` toolbar, `editor` area, `graph-*` canvas |
| `StatusBar` | `titlebar`: status dot, message, detected format |
| `WelcomeScreen` | Centered `card` |
| `Toaster`, `ExitDialog`, `ShortcutsDialog`, `MainMenu` | `popover` |

The header carries `data-tauri-drag-region`. Dragging the window from it also needs the `core:window:allow-start-dragging` permission in `desktop/src-tauri/capabilities/`, which the shell does not grant yet. Until then the native title bar moves the window.

## Rules for adding UI

1. **Colors come from tokens.** A new color is a new token in `tokens.css`, in OKLCH, defined for both themes and inside the sRGB gamut (a test enforces this). A tint of an existing color is a `color-mix(in oklch, var(--base) p%, transparent)`, not a new literal. If it carries text or identifies a control, add its pair to `contrast-pairs.ts`.
2. **Start from shadcn/ui and the prototype.** Reuse a primitive from `components/ui/`. If none fits, take the shadcn/ui (new-york) version, or the prototype's adaptation, and swap its focus classes for `focus-ring` or `focus-ring-inset`.
3. **One primary action per view.** Everything else is `ghost`, `outline` or an `IconButton`.
4. **Icon-only buttons use `IconButton`.** Never a bare `<button>` with only an `<svg>` inside.
5. **Use only the type scale classes:** `text-caption`, `text-body`, `text-code`, `text-title`, `text-display`. Avoid Tailwind's `text-xs` and `text-sm` in app components. Paths, values and code use `font-mono`.
6. **Bars and fields use the size tokens:** `--header-height`, `--toolbar-height` and `--control-height`.
7. **1px borders separate regions; shadows are for menus and popovers** (plus the `shadow-xs` of a pressed segment).
8. **Motion must be optional.** Use the tw-animate classes, `animate-arrive` or `--duration-*`. Never make an animation the only carrier of information. Reduced motion turns them off.
9. **User-facing strings go through i18next.** Add each new key to both `locales/en.json` and `locales/es.json`.

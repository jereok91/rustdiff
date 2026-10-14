# RustDiff design system

Reference for the Tauri + React frontend (`desktop/`). It covers the tokens, the theme behaviour, the type scale, the component inventory and the rules for adding UI. The values themselves live in code. This page explains them and does not override them.

| What | Where |
|------|-------|
| Every color, size and duration | `desktop/src/styles/tokens.css` (the only source of truth) |
| Tailwind wiring, focus utilities, base styles | `desktop/src/styles.css` |
| Contrast pairs that must pass WCAG AA | `desktop/src/styles/contrast-pairs.ts` |
| Contrast and token tests | `desktop/src/styles/tokens.test.ts` |
| OKLCH → sRGB conversion and contrast math | `desktop/src/lib/color.ts` |
| Theme logic (system / light / dark) | `desktop/src/lib/theme.ts`, `desktop/src/hooks/use-color-scheme.ts` |
| CodeMirror theme | `desktop/src/lib/editor-theme.ts` |
| Primitives (shadcn/ui, new-york) | `desktop/src/components/ui/` |

## Tokens

All colors are written in OKLCH. `:root` holds the light theme. `.dark` overrides only the values that change. Components use Tailwind classes such as `bg-card` and `text-muted-foreground`, or `var(--token)`. They never contain raw color values.

### UI (shadcn/ui convention)

| Token | Role | Light | Dark |
|-------|------|-------|------|
| `--background` / `--foreground` | Content surfaces: editors, table, canvas | `oklch(1 0 0)` / `oklch(0.21 0.02 256)` | `oklch(0.195 0.015 256)` / `oklch(0.95 0.006 256)` |
| `--card` / `--card-foreground` | App chrome: header, toolbars, sidebar, status bar, welcome card | `oklch(0.975 0.004 256)` | `oklch(0.17 0.014 256)` |
| `--popover` / `--popover-foreground` | Menus, dialogs, popovers, toasts | `oklch(1 0 0)` | `oklch(0.235 0.017 256)` |
| `--primary` / `--primary-foreground` | Main action (rust orange, from the app icon) | `oklch(0.52 0.16 41)` | `oklch(0.75 0.14 55)` |
| `--secondary` / `--secondary-foreground` | Secondary buttons | `oklch(0.945 0.008 256)` | `oklch(0.27 0.018 256)` |
| `--muted` / `--muted-foreground` | Quiet fills, secondary text | `oklch(0.955 0.006 256)` / `oklch(0.49 0.02 256)` | `oklch(0.26 0.018 256)` / `oklch(0.73 0.02 256)` |
| `--accent` / `--accent-foreground` | Hover, pressed toggles, selected row | `oklch(0.935 0.012 256)` | `oklch(0.3 0.022 256)` |
| `--destructive` / `--destructive-foreground` | Destructive actions and errors | `oklch(0.53 0.2 27)` | `oklch(0.7 0.18 25)` |
| `--border` | Decorative separators | `oklch(0.91 0.008 256)` | `oklch(0.3 0.016 256)` |
| `--input` | Borders of form fields (≥ 3:1) | `oklch(0.62 0.015 256)` | `oklch(0.52 0.02 256)` |
| `--ring` | Focus ring (≥ 3:1 on every surface) | `oklch(0.55 0.16 41)` | `oklch(0.75 0.14 55)` |
| `--radius` | Base corner radius. Tailwind derives `rounded-sm`, `md`, `lg` and `xl` from it | `0.5rem` | — |
| `--editor-selection`, `--editor-active-line` | CodeMirror selection and active line (with alpha) | — | — |

### Diff

Each kind (`added`, `removed`, `changed`) has four tokens:

| Token | Used for |
|-------|----------|
| `--diff-<kind>` | Text of the kind: the Type column, filter labels |
| `--diff-<kind>-line` | Subtle background of the whole line in the editors |
| `--diff-<kind>-inline` | Stronger background of the exact changed characters (editors and table cells) |
| `--diff-<kind>-row` | Tint of the table row and of the active filter button |

The background tokens carry alpha, so they also work over the active-line and selection layers. The contrast test composites them over `--background` before it measures anything.

### Graph

`--graph-background`, `--graph-node-fill`, `--graph-node-border`, `--graph-node-selected`, `--graph-node-match`, `--graph-edge`, `--graph-key`, `--graph-string`, `--graph-number`, `--graph-boolean`, `--graph-null`, `--graph-reference` and `--graph-text`.

`lib/graph-view.ts` reads them with `getComputedStyle` and converts them to hex before it hands them to the 2D canvas. Its `LIGHT_PALETTE` and `DARK_PALETTE` hold the same values already converted. They are only a fallback for tests that run without a stylesheet. A test fails if they drift from the tokens.

### Layout, type and motion

| Token | Value |
|-------|-------|
| `--header-height` | `3rem` |
| `--toolbar-height` | `2.25rem` (search bar, diff panel bar, graph toolbar, history header) |
| `--control-height` | `1.75rem` (text inputs) |
| `--sidebar-width` | `18rem` |
| `--duration-fast` | `120ms` (hover and color transitions) |
| `--duration-flash` | `1.2s` (jump flash; matches `FLASH_MS` in `code-editor.tsx`) |

Use these tokens with arbitrary-value classes, for example `h-(--toolbar-height)` and `w-(--sidebar-width)`.

## Theme

- The default is **System**: the app follows `prefers-color-scheme` and keeps following it live while running.
- The user can force a theme in **Main menu → Theme → System / Light / Dark**.
- The choice is stored in `localStorage` under `rustdiff.theme`. The backend `settings.json` has no theme field, and this phase leaves the backend untouched. If storage is blocked, the choice lasts for the session only.
- To apply a theme, the app toggles the `.dark` class on `<html>` and sets `color-scheme`, so native scrollbars follow. `main.tsx` applies the saved theme before the first render, so the window never flashes the wrong theme.
- The class switches synchronously, before React re-renders. Because of that, CodeMirror and the graph canvas read the new tokens on the same change:
  - The editor colors are CSS variables, so they follow the class by themselves. The theme extension only swaps the `dark` flag and the syntax colors: CodeMirror's default style in light, One Dark's in dark.
  - The graph view drops its cached palette whenever `scheme` changes, then redraws.

## Typography

| Class | Size / line height | Use |
|-------|--------------------|-----|
| `text-caption` | 12 / 16 px | Metadata, counters, status bar, tooltips, kbd, table header |
| `text-body` | 14 / 20 px | Default UI text, menus, buttons, table |
| `text-code` | 13 / 20 px | Editors, paths and values in the table, graph node detail |
| `text-title` | 18 / 24 px | Dialog titles, empty-state titles |
| `text-display` | 28 / 36 px | Welcome title |

- **Sans stack** (`--font-family-sans`): `system-ui, -apple-system, "Segoe UI", "Cantarell", "Noto Sans", sans-serif`.
- **Mono stack** (`--font-family-mono`, the `font-mono` class): `ui-monospace, "JetBrains Mono", "Cascadia Code", monospace`. The graph canvas uses the same stack, and a test checks that it does.
- All sizes are in `rem`. The **Text Size** setting (`ui_scale`) scales the root font size, so it scales the whole scale proportionally.

Use Tailwind's default spacing scale (`gap-1`, `px-2` and so on). The rhythm inside bars is `px-2` with `gap-1`, cards use `p-6` to `p-10`, and content lists use `py-1.5` rows.

## Accessibility

- **Focus.** There is one focus ring everywhere: a 2px outline in `--ring`, shown only on `:focus-visible`. Use `focus-ring` for controls and `focus-ring-inset` for surfaces that fill their panel (table, canvas, list rows, menu items). A base rule gives the same ring to any focusable element that has no style of its own. The focused editor shows the ring inset, which also tells you which editor Ctrl+F will search.
- **Icon-only buttons** go through `IconButton`, which requires `label`. The label becomes the `aria-label` and the tooltip. This is the equivalent of GTK's `set_icon_button_label`. The dialog close button takes a translated `closeLabel`.
- **Exit dialog.** Cancel gets focus on open and is first in the Tab order. "Close without saving" is last. Escape cancels.
- **Graph.**
  - The canvas is focusable and described by a screen-reader hint.
  - Keys on the focused canvas: `+`/`=` and `-`/`_` zoom around the center, `0` fits the graph, arrow keys pan (Shift moves 4× faster), and Escape closes the node detail.
  - Shortcuts that use Ctrl stay with the app, so Ctrl++ and Ctrl+0 still change the text size.
  - The node detail is a Radix popover anchored at the click point. It doesn't take focus away from the canvas.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, all animations and transitions are turned off. The jump flash becomes a static highlight that lasts as long as the flash did, so you lose no information.

## Contrast results

WCAG 2.x ratios computed by `tokens.test.ts` from the token values. Backgrounds with alpha are composited first. The thresholds are 4.5:1 for text and 3:1 for UI indicators (ring, input borders, graph outlines). Every pair passes in both themes. To print this table, run `PRINT_CONTRAST=1 pnpm test tokens`.

| Pair | Tokens | Light | Dark |
|------|--------|------:|-----:|
| Body text | `--foreground` on `--background` | 17.71 | 15.80 |
| Chrome text | `--card-foreground` on `--card` | 16.48 | 16.53 |
| Menus, popovers, toasts | `--popover-foreground` on `--popover` | 17.71 | 14.41 |
| Secondary text on content | `--muted-foreground` on `--background` | 6.26 | 7.65 |
| Secondary text on chrome | `--muted-foreground` on `--card` | 5.82 | 8.00 |
| Secondary text on muted fill | `--muted-foreground` on `--muted` | 5.49 | 6.50 |
| Primary button | `--primary-foreground` on `--primary` | 5.75 | 7.87 |
| Destructive button | `--destructive-foreground` on `--destructive` | 5.68 | 6.53 |
| Error text in status bar | `--destructive` on `--card` | 5.45 | 6.60 |
| Selected code | `--foreground` on `--editor-selection` | 13.61 | 9.95 |
| Focus ring on chrome (UI) | `--ring` on `--card` | 4.84 | 8.26 |
| Input border on content (UI) | `--input` on `--background` | 3.64 | 3.32 |
| Input border on chrome (UI) | `--input` on `--card` | 3.39 | 3.47 |
| Added label | `--diff-added` on `--background` | 5.65 | 9.67 |
| Removed label | `--diff-removed` on `--background` | 6.08 | 7.72 |
| Changed label | `--diff-changed` on `--background` | 5.65 | 10.72 |
| Changed label on its row | `--diff-changed` on `--diff-changed-row` | 5.33 | 9.43 |
| Code on added line | `--foreground` on `--diff-added-line` | 15.52 | 12.22 |
| Code on removed line | `--foreground` on `--diff-removed-line` | 15.11 | 12.81 |
| Code on changed line | `--foreground` on `--diff-changed-line` | 15.80 | 12.26 |
| Code on added chars | `--foreground` on `--diff-added-inline` | 12.01 | 6.68 |
| Code on removed chars | `--foreground` on `--diff-removed-inline` | 10.79 | 7.47 |
| Code on changed chars | `--foreground` on `--diff-changed-inline` | 13.30 | 8.00 |
| Graph references (lowest graph text) | `--graph-reference` on `--graph-node-fill` | 5.50 | 5.16 |
| Selected node outline (UI) | `--graph-node-selected` on `--graph-background` | 4.60 | 7.12 |
| Search match outline (UI) | `--graph-node-match` on `--graph-background` | 3.51 | 10.08 |

The full list of 48 pairs per theme is in `contrast-pairs.ts`.

The previous look failed AA in several places. Diff label text on white measured 3.37 (added), 3.35 (removed) and 2.52 (changed). The light focus ring measured 2.59. Input borders measured 1.26. Graph strings and references on white measured 3.25 and 2.85.

`--border` is decorative: it separates regions that are already identified by their content and position. It is exempt from the 3:1 rule on purpose. Use `--input` for any border that identifies a control.

## Component inventory

Primitives live in `components/ui/`. They hold no app logic and are not translated, so the caller passes any user-facing labels.

| Primitive | Notes |
|-----------|-------|
| `Button` | Variants `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. Sizes `sm`, `default`, `lg`, `icon`, `icon-sm` |
| `IconButton` | Icon-only `Button` with a required `label` (aria-label and tooltip) and an optional longer `tooltip` |
| `Input` | Text and search fields. Uses `--control-height` and `--input` |
| `Kbd` | A single key in a shortcut |
| `Select` | Format picker |
| `DropdownMenu` | Main menu and export menu, with radio groups and submenus |
| `Dialog`, `AlertDialog` | Shortcuts dialog. Exit and clear-history confirmations |
| `Popover` | Graph node detail |
| `Tooltip` | One `TooltipProvider` at the app root |
| `Separator`, `Resizable` | Layout |

App components, and the surface each one uses:

| Component | Surface |
|-----------|---------|
| `AppHeader` | `card` |
| `WelcomeScreen` | Centered `card` |
| `CodeEditor` | `background`. Pane label on `card` |
| `SearchBar` | `card` toolbar |
| `DiffTable` | `card` toolbar, `background` grid, `diff-*` tokens |
| `HistorySidebar` | `card` |
| `GraphView` | `card` toolbar, `graph-*` canvas |
| `StatusBar` | `card` |
| `Toaster` | `popover` |
| `ExitDialog` | `popover` |
| `ShortcutsDialog` | `popover` |
| `MainMenu` | `popover` |

## Rules for adding UI

1. **Colors come from tokens.** A new color is a new token in `tokens.css`, in OKLCH, defined for both themes and inside the sRGB gamut (a test enforces this). If it carries text or identifies a control, add its pair to `contrast-pairs.ts`.
2. **Start from shadcn/ui.** Reuse a primitive from `components/ui/`. If none fits, add the shadcn/ui (new-york) version there and swap its focus classes for `focus-ring` or `focus-ring-inset`.
3. **Icon-only buttons use `IconButton`.** Never a bare `<button>` with only an `<svg>` inside.
4. **Use only the type scale classes:** `text-caption`, `text-body`, `text-code`, `text-title`, `text-display`. Avoid Tailwind's `text-xs` and `text-sm` in app components. Paths, values and code use `font-mono`.
5. **Bars and fields use the size tokens:** `--header-height`, `--toolbar-height` and `--control-height`, not fixed pixel heights.
6. **Motion must be optional.** Use the tw-animate classes or `--duration-*`. Never make an animation the only carrier of information. Reduced motion turns them off.
7. **User-facing strings go through i18next.** Add each new key to both `locales/en.json` and `locales/es.json`.

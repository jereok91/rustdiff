# RustDiff 1.0.0

Tag: `v1.0.0`. Date: 2026-10-14.

RustDiff 1.0.0 is our first stable release, and a full rewrite of the
interface on a modern stack: a **Tauri v2** shell in Rust with a **React 19 +
TypeScript** frontend, styled with **Tailwind CSS v4** and **shadcn/ui**. What
we did *not* rewrite is what you trust with your documents: the diff engine,
the parsers, the history database and the settings file are the same code as
in 0.4.0. Upgrading needs no migration — your history and preferences are
picked up as they are.

Coming from 0.4.0, read [Breaking](#breaking) first. An intermediate 0.5
version was planned but never published; everything planned for it ships
here.

## Added

### A modern stack, end to end

- **Tauri v2 shell in Rust** (binary `rustdiff`). The window is the system
  WebView (WebKitGTK 4.1 on Linux, WKWebView on macOS), so the app ships no
  browser engine of its own.
- **React 19 + TypeScript** frontend built with Vite.
- **Tailwind CSS v4** with **shadcn/ui** components on **Radix** primitives:
  menus, dialogs, popovers, selects, tooltips and toggles are accessible by
  keyboard and screen reader out of the box.
- **CodeMirror 6** editors for JSON, XML and SQL.
- **Geist** and **Geist Mono**, self-hosted: the fonts are bundled with the
  app and never fetched from the network.
- **Typed IPC generated with tauri-specta.** Every command the interface can
  call is declared once in Rust and the TypeScript bindings
  (`desktop/src/bindings.ts`) are generated from it, so the two sides cannot
  drift apart. The frontend never touches the filesystem and never parses a
  document: reading, writing, the 10 MB input limit and the typed errors all
  stay in Rust.

### A design system

- **OKLCH design tokens** in a single file (`desktop/src/styles/tokens.css`);
  components never contain raw color values. Translucent tints are derived
  from their base color, so changing a color moves every tint with it.
- **Light and dark themes, dark by default.** Pick light, dark, or follow the
  system; the first paint already uses the right theme, with no flash.
- **WCAG AA contrast enforced by tests**: a test computes the contrast of
  every text/background pair in both themes from the real token values and
  fails if one drops below AA. The diff colors (added, removed, changed) are
  part of that check.
- Visible focus rings and keyboard access on every control. Reference:
  [`docs/design-system.md`](design-system.md).

### The interface

- **Editors**: syntax highlighting, line and character-level diff
  highlighting, gutter markers, pretty-print (`Ctrl+Shift+F`) and search
  (`Ctrl+F`, next/previous with wrap-around).
- **Auto compare while you type** (500 ms debounce) plus manual compare
  (`Ctrl+Enter`).
- **Differences panel**: filterable by type, click a row to jump to the exact
  location, resizable, and still collapsible with `Ctrl+D`.
- **Graph view** (`Ctrl+G`): the left document as a node graph drawn on a 2D
  canvas over a layout computed in Rust (the same engine as 0.4.0), with pan,
  zoom, zoom-to-fit, node search and node inspection.
- **Live language switching** with i18next: English and Spanish change on the
  spot, no restart.
- **UI text size** from 60 % to 200 % (`Ctrl++`, `Ctrl+-`, `Ctrl+0`), saved
  across sessions.
- History (searchable, paginated, per-entry and bulk deletion), export to
  `.txt`/`.html`, the exit dialog and the shortcuts dialog (`Ctrl+?`) work as
  before, on the new components.

## Changed

- **The whole interface**: GTK4 + Libadwaita + GtkSourceView are replaced by
  the Tauri + React app above. Feature parity with 0.4.0 came first; the
  redesign only started once the new shell matched the old one.
- **Repository layout**: a virtual Cargo workspace with
  `crates/rustdiff-core` (parsing, diff, graph layout, export, free of any UI
  dependency — a test enforces it), `crates/rustdiff-persist` (history and
  settings) and `desktop/` (the app).
- **Packaging channels**:

  | Channel | 0.4.0 | 1.0.0 |
  | --- | --- | --- |
  | Flathub | GTK app on `org.gnome.Platform//50` | Tauri app on the same runtime (WebKitGTK ships with it); the frontend bundle is attached to the release |
  | `.deb` / APT (amd64, arm64) | `cargo-deb`, depends on GTK4 + libadwaita + GtkSourceView | Tauri bundler, same package name `rustdiff`, depends on `libwebkit2gtk-4.1-0` + `libgtk-3-0`; Ubuntu 24.04+ / Debian 13+ |
  | macOS DMG (Apple Silicon, Intel) | bundled the Homebrew GTK stack | built by the Tauri bundler, no bundled libraries (system WebKit) |
  | Homebrew cask `rustdiff-app` | yes | yes, unchanged for users |
  | `install.sh` | `cargo install rustdiff` | the `.deb` on Debian/Ubuntu, a source build (pnpm + cargo) elsewhere |

- **Building from source** now needs Node.js 20+ and pnpm next to Rust, and
  WebKitGTK 4.1 instead of GTK4/libadwaita/GtkSourceView (see the README).

## Fixed

- **The app could exit right after launch on NVIDIA + Wayland** with
  `Error 71 (Error de protocolo) dispatching to Wayland display`, before any
  window appeared. WebKitGTK uses its DMABUF renderer by default and the
  proprietary NVIDIA driver breaks that path over Wayland. This failure mode
  came with the move to WebKit and was caught during testing; the shell now
  disables that renderer only for that combination (Wayland session plus the
  NVIDIA module loaded) and never overrides a
  `WEBKIT_DISABLE_DMABUF_RENDERER` value you set yourself. The cost on those
  machines is GPU compositing in the WebView.
- The GTK app printed `Unknown tag 'rustdiff-*'` warnings to the terminal
  whenever a file was opened. That code is gone.

## Removed

- **The GTK4 + Libadwaita interface.**
- **The "Open History" desktop action** (`rustdiff --history`). It never
  worked: the flag was declared in the desktop entry but never implemented.
- **crates.io**: RustDiff is no longer published there. `cargo install
  rustdiff` keeps installing 0.4.x, the last GTK release.
- **The Homebrew source formula** (`brew install jereok91/rustdiff/rustdiff`).
  Use the prebuilt cask: `brew uninstall rustdiff && brew install --cask
  jereok91/rustdiff/rustdiff-app`.

## Breaking

What you need to know coming from 0.4.0:

- **The interface is new.** Same features and the same keyboard shortcuts,
  different look.
- **`rustdiff --history` is gone** (it never did anything).
- **Your data carries over untouched**: the history database
  (`~/.local/share/rustdiff/history.db`) and the preferences
  (`~/.config/rustdiff/settings.json`: language, text size) are read as they
  are. The theme choice is new and starts dark.
- **crates.io and the Homebrew formula no longer update.** Switch to Flathub,
  the `.deb`/APT repository, the DMG or the `rustdiff-app` cask.
- **Building from source** needs Node.js 20+, pnpm and WebKitGTK 4.1.

## Notes

Measured on this release and during the migration:

- **Tests**: 187 Rust tests (`cargo test --workspace --all-targets`: core
  126, persistence 20, desktop shell 41) and 215 frontend tests in 29 Vitest
  files, all green.
- **Debian package**: `rustdiff_1.0.0_amd64.deb` is 3.67 MiB and installs
  8.1 MiB (`Installed-Size: 8245`); the release binary is 8.0 MiB with the
  frontend embedded.
- **Startup**: the window mapped in about 208 ms in the release build
  measured during the migration (headless sway, `desktop/scripts/smoke-headless.sh`).
- **Memory, honestly**: the process tree uses about **1.9× the RSS of the GTK
  app** (476 MB across 3 processes against 252 MB in 1, same harness). That is
  WebKit's separate web and network processes, and it is the real price of
  the new stack.

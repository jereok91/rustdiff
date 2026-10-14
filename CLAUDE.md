# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RustDiff is a semantic JSON/XML/SQL diff tool for the desktop, written in Rust (edition 2024) with a Tauri v2 + React frontend. It compares document *structure* (keys, array indices, XML nodes/attributes, SQL statements), not raw text lines.

Until 0.4.x the app was GTK4 + Libadwaita; 0.5.0 retired it (the migration plan and its log live in `odd/tasks/tauri-migration.md`).

## Layout

```
Cargo.toml                 virtual workspace: version, profiles, members
crates/rustdiff-core/      format, parsing, semantic diff, graph layout, export
crates/rustdiff-persist/   SQLite session history + user preferences
desktop/                   the frontend: React + Vite + TypeScript, Tailwind v4, shadcn/ui
desktop/src-tauri/         the Tauri v2 shell (binary `rustdiff`), IPC commands
locales/                   rust-i18n strings the crates still render (export report, session summary)
data/                      desktop entry, AppStream metainfo, app icon, screenshots
```

The app stays in `desktop/` + `desktop/src-tauri/` instead of moving to the repository root: the frontend has its own Node tree and mixing it with the Cargo workspace root buys nothing.

## Build, run, test

```bash
cd desktop
pnpm install
pnpm dev                 # Vite dev server only (browser)
pnpm tauri dev           # the app in a WebView, hot reload
pnpm build               # tsc --noEmit + vite build -> desktop/dist
pnpm test                # Vitest
pnpm tauri build         # production bundle -> target/release/bundle/{deb,...}
pnpm tauri build --no-bundle   # release binary only -> target/release/rustdiff
pnpm bindings            # regenerate desktop/src/bindings.ts from the Rust commands

cd ..
cargo test                               # core + persist only (default-members), no system UI libs needed
cargo test --workspace --all-targets     # everything, including the Tauri shell (CI runs this)
cargo test -p rustdiff-core --test parser_tests        # one integration suite
cargo test json_valor_cambiado           # a single test by name

cargo fmt --all                          # rustfmt.toml: max_width=120, tab_spaces=4
cargo clippy --workspace --all-targets -- -D warnings
```

`desktop/src-tauri` is a workspace member but **not** a default member: compiling it pulls the whole Tauri/WebKitGTK stack and needs the WebKit development libraries (`webkit2gtk-4.1`, `libsoup-3.0`), so a bare `cargo test` stays usable for core work. CI uses `--workspace`.

**Build order matters for production builds only:** `tauri-codegen` validates that `desktop/dist` exists when the production assets are embedded, which only happens with the `custom-protocol` feature on (`pnpm tauri build`, or `cargo build --release --features custom-protocol -p rustdiff-desktop`). Dev builds, `cargo test` and `cargo clippy` do not need `desktop/dist`.

`vendor/` (gitignored) and `cargo-sources.json`/`flathub/cargo-sources.json` exist only for offline Flatpak builds. Regenerate `cargo-sources.json` with `.flatpak-tools/flatpak-cargo-generator.py` whenever `Cargo.lock` changes (`docs/RELEASING.md`).

## Architecture

Module boundaries are strict and one-directional: `parser` → `diff_engine` → `graph`/`export` → the Tauri commands → the frontend, with `storage` and `settings` as independent services that depend on the core. `rustdiff-core` must stay free of `gtk4`, `libadwaita`, `sourceview5`, `cairo` and `tauri` — `crates/rustdiff-core/tests/no_ui_dependencies.rs` fails if it isn't.

- **`rustdiff-core/src/parser.rs`** — detects format (JSON/XML/SQL) from raw text and parses into either `serde_json::Value` or the crate's own `XmlNode`/`XmlChild` tree (quick-xml only tokenizes). Also pretty-printing. Enforces `MAX_INPUT_SIZE` (10 MB).
- **`rustdiff-core/src/diff_engine.rs`** — the semantic diff core. Entry points `diff_json`, `diff_xml`, `diff_sql`, `diff_text`, all returning `DiffResult { added, removed, changed }` of `DiffItem { path, kind, left, right }`. Paths are JSONPath-ish (`$.a.b[0]`) for JSON, dot/index for XML, `stmt[N]` for SQL. SQL diffing is statement-level after whitespace/case normalization, not a grammar parse. `inline_char_ranges` powers the character-level highlighting.
- **`rustdiff-core/src/graph.rs`** — builds the JSON/XML node graph and its layered `layout`/`bounds`. Truncates at `MAX_GRAPH_NODES` (3000). Pure geometry: the canvas drawing lives in the frontend (`desktop/src/lib/graph-render.ts`).
- **`rustdiff-core/src/export.rs`** — renders a `DiffResult` to plain text or styled HTML.
- **`rustdiff-persist/src/storage.rs`** — SQLite session history (`rusqlite`, bundled) at `dirs::data_dir()/rustdiff/history.db`, paginated (`MAX_SESSIONS`), searchable.
- **`rustdiff-persist/src/settings.rs`** — JSON prefs at `dirs::config_dir()/rustdiff/settings.json` (language `auto`/`en`/`es`, `ui_scale` clamped to `UI_SCALE_MIN`..`UI_SCALE_MAX`).
- **`desktop/src-tauri/src/`** — `lib.rs` defines the whole IPC contract once (`specta_builder()`), from which both the `invoke_handler` and the TypeScript bindings come; `commands/` holds one module per area (format, diff, graph, export, files, settings, history); `error.rs` maps every error to a `CommandError` with a translatable code; `state.rs` holds the history handle and the startup files (the first two CLI arguments that are files).
- **`desktop/src/`** — the React app: `App.tsx` wires the shell; `components/` (editors, diff table, graph view, history sidebar, dialogs; `components/ui/` are the shadcn/ui primitives); `hooks/`; `lib/` holds the pure logic, each with its Vitest file. The frontend never touches the filesystem or parses documents (S8): everything goes through `bindings.ts`.

## Desktop shell (Tauri v2)

- **App identity**: identifier `com.digitalgex.RustDiff`, window title `RustDiff`, binary `rustdiff` (`[[bin]]` in `desktop/src-tauri/Cargo.toml` and `mainBinaryName` in `tauri.conf.json`). `tauri.linux.conf.json` sets `productName` to `rustdiff` on Linux only, which is what names the `.deb` package `rustdiff` (the bundler kebab-cases the product name and has no package-name option); macOS keeps `RustDiff.app`.
- **`custom-protocol` is not optional.** In tauri 2.11+, `dev = !custom_protocol` decides whether the WebView loads `build.devUrl` or the embedded `frontendDist`. A plain `cargo build --release` without it shows "Could not connect to localhost" in the window.
- **`tauri` (crate) and `@tauri-apps/api` (npm) must share major/minor**, and `tauri-plugin-dialog` (crate) / `@tauri-apps/plugin-dialog` (npm) the exact patch, or the CLI refuses to build.
- `desktop/scripts/smoke-headless.sh` runs the app under a private headless `sway` (own `XDG_RUNTIME_DIR`), reports startup time, RSS and process count, and writes a screenshot. It needs `sway`, `swaymsg` and `grim`, and exports `WEBKIT_DISABLE_DMABUF_RENDERER=1`. Pass the binary path explicitly: `desktop/scripts/smoke-headless.sh target/release/rustdiff`.

## Design system

`docs/design-system.md` is the reference for tokens (OKLCH, `desktop/src/styles/tokens.css` is the single source of truth), themes, type scale, component inventory and accessibility rules. Components never contain raw color values.

## Internationalization

- **UI**: i18next in the frontend, `desktop/src/locales/en.json` and `es.json`. Add every key to both; English is the fallback.
- **Rust**: `rustdiff-core` (export report) and `rustdiff-persist` (session summary) still use `rust_i18n::t!()` against `locales/en.yml`/`es.yml`. `t!()` resolves against the backend generated *inside the crate that invokes it*, so each of those crates calls `rust_i18n::i18n!("../../locales", fallback = "en")` itself. Only the keys those crates use live there.

## Code comments

Existing inline and doc comments are predominantly in Spanish (the primary maintainer's working language), while public-facing docs (README, error messages, UI strings) are English-first with an `.es.md` translation. Match the surrounding file's comment language.

## Packaging

Channels: Flatpak (`com.digitalgex.RustDiff.yaml` for local builds, `flathub/` for Flathub), Debian/APT (`scripts/packaging/build-deb.sh`, `docs/DEBIAN_APT.md`), macOS DMG + the `rustdiff-app` Homebrew cask, and `install.sh`. crates.io and the Homebrew source formula are retired. **`docs/RELEASING.md` is the full checklist** — the three files that carry the version (`Cargo.toml`, `desktop/package.json`, `tauri.conf.json`), what a `v*` tag triggers, local validation, and the manual steps in the tap repository.

Installed files are listed in four independent places: `bundle.linux.deb` in `tauri.conf.json`, `build-commands` in both Flatpak manifests, and `install_user_files` in `install.sh`. The frontend is embedded in the binary, so only the desktop entry, metainfo and icon need installing.

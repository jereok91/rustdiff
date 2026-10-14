# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RustDiff is a semantic JSON/XML/SQL diff tool with a native GTK4 + Libadwaita desktop UI, written in Rust (edition 2024). It compares document *structure* (keys, array indices, XML nodes/attributes, SQL statements), not raw text lines.

## Build, run, test

Requires native GTK libs (gtk4, libadwaita-1, gtksourceview-5) — `build.rs` checks for them via `pkg-config` and fails with OS-specific install instructions if missing. Only the root package (the GTK app) needs them: the `rustdiff-core` and `rustdiff-persist` crates build and test without any GTK development files.

```bash
cargo run                                # dev build + run
cargo run -- left.json right.json        # open two files on launch
cargo build --release                    # optimized binary → target/release/rustdiff

cargo test                               # full suite (unit + integration, whole workspace)
cargo test -p rustdiff-core              # the UI-free core only, no GTK libs needed
cargo test -p rustdiff-core --test parser_tests        # integration tests for parser.rs
cargo test -p rustdiff-core --test diff_engine_tests   # integration tests for diff_engine.rs
cargo test -p rustdiff-persist --lib     # storage + settings
cargo test json_valor_cambiado           # run a single test by name (works across files)

cargo fmt                                # uses rustfmt.toml (max_width=120, tab_spaces=4)
cargo clippy --workspace --all-targets
```

The `vendor/` directory and `cargo-sources.json`/`flathub/cargo-sources.json` exist only to support offline Flatpak builds (consumed by `.flatpak-tools/flatpak-cargo-generator.py`) — normal `cargo build`/`cargo run` fetch from crates.io as usual, there's no local source-replacement config.

## Architecture

This is a Cargo workspace. The root package is the GTK app — a library (`src/lib.rs`) plus a thin binary (`src/main.rs` → `rustdiff::app::run()`) — and it is only the frontend: the logic lives in two member crates that know nothing about any toolkit.

```
crates/rustdiff-core/      format, parsing, semantic diff, graph layout, export
crates/rustdiff-persist/   SQLite session history + user preferences
src/                       the GTK4 app (app.rs, ui/)
```

Module boundaries are strict and one-directional: `parser` → `diff_engine` → `graph`/`export` → the frontend, with `storage` and `settings` as independent, orthogonal services that depend on the core. `rustdiff-core` must stay free of `gtk4`, `libadwaita`, `sourceview5`, `cairo` and `tauri` — `crates/rustdiff-core/tests/no_ui_dependencies.rs` fails if it isn't, so the logic survives any future change of GUI toolkit.

- **`rustdiff-core/src/parser.rs`** — detects format (JSON/XML/SQL) from raw text and parses into either `serde_json::Value` or the crate's own `XmlNode`/`XmlChild` tree (quick-xml is used only for tokenizing; the resulting tree is custom). Also does pretty-printing for the "Format" button. Enforces `MAX_INPUT_SIZE` (10 MB).
- **`rustdiff-core/src/diff_engine.rs`** — the semantic diff core, pure and UI-agnostic. Four entry points: `diff_json`, `diff_xml`, `diff_sql`, `diff_text`, all returning a `DiffResult { added, removed, changed }` of `DiffItem { path, kind, left, right }`. Paths use JSONPath-ish notation (`$.a.b[0]`) for JSON, dot/index notation for XML, `stmt[N]` for SQL. SQL diffing is statement-level (split on `;`, quote/comment-aware) after whitespace/case normalization — it does not parse SQL grammar. `inline_char_ranges` powers the character-level highlighting in the editors and the diff table.
- **`rustdiff-core/src/graph.rs`** — builds the JSON/XML node graph for the graph view and computes its layered `layout` and `bounds`. Truncates at `MAX_GRAPH_NODES` (3000). Pure geometry: the drawing itself lives in the frontend.
- **`rustdiff-core/src/export.rs`** — renders a `DiffResult` to plain text or styled HTML for saving to disk.
- **`rustdiff-persist/src/storage.rs`** — SQLite-backed session history (`rusqlite`, bundled) at `~/.local/share/rustdiff/history.db`. Stores both documents' full text plus a `DiffSummary`, paginated (`MAX_SESSIONS`), searchable.
- **`rustdiff-persist/src/settings.rs`** — minimal JSON prefs file at `~/.config/rustdiff/settings.json` (UI language `auto`/`en`/`es` and the global `ui_scale`, clamped to `UI_SCALE_MIN`..`UI_SCALE_MAX`).
- **`src/ui/`** — GTK4/Libadwaita widgets, GLib-idiomatic (`Rc<RefCell<...>>` for shared mutable state, no `Send`/`Sync` needed since it's single-threaded GLib main loop):
  - `main_window.rs` — the whole application shell: header bar, dual `sourceview5::View` editors, history sidebar, search bar, graph view toggle, debounced auto-compare (500 ms via `DEBOUNCE_MS`), keyboard shortcuts. This is the largest file and owns most of the wiring between other modules.
  - `diff_panel.rs` — the diff results table, a `gtk4::ColumnView` backed by a `gio::ListStore` of `DiffItemObject` (a GObject subclass wrapping `DiffItem` — see the `mod imp` pattern for adding new GObject-backed types).
  - `graph_view.rs` — the Cairo drawing surface for the graph view (pan, zoom, fit, node search) on top of the geometry from `rustdiff_core::graph`.
  - `highlighter.rs` — syntax highlighting glue for `sourceview5` plus the diff tags in the editors, including loading custom language specs from `data/language-specs/` (dev path, `.deb`/`/usr/share` path, and Flatpak `/app/share` path are all checked — replicate this three-path pattern if adding more bundled resources).
- **`src/app.rs`** — GTK application bootstrap: locale detection (`Settings::language` → `LANG`/`LC_*` env → fallback `en`) and CLI arg handling (two positional args = auto-load into left/right panels).

## Internationalization

All user-facing strings go through `rust_i18n`'s `t!()` macro (245+ call sites), backed by `locales/en.yml` and `locales/es.yml` (loaded at compile time via `rust_i18n::i18n!("locales", fallback = "en")` in `lib.rs`). When adding UI strings, add the key to **both** locale files — English is the fallback/reference set.

The `t!()` macro resolves against the backend generated *inside the crate that invokes it*, so every crate that translates loads the locales itself: `src/lib.rs`, `crates/rustdiff-core/src/lib.rs` and `crates/rustdiff-persist/src/lib.rs` each call `rust_i18n::i18n!()` (relative paths to the same `locales/` directory). Adding a crate that renders user-facing text means adding that call too.

## Code comments

Existing inline comments and doc comments (`//!`, `///`) are predominantly in Spanish (this is the primary maintainer's working language), while public-facing docs (README, error messages, `t!()` strings) are English-first with an `.es.md` translation. Match the surrounding file's existing comment language rather than mixing.

## Packaging

This repo ships through multiple channels kept in sync manually — Flatpak (`com.digitalgex.RustDiff.yaml`, `flathub/`), Debian/APT (`docs/DEBIAN_APT.md`, `scripts/packaging/`), crates.io, macOS DMG + Homebrew (see below), and a one-command `install.sh`. When bumping the version in `Cargo.toml`, check whether `flathub/cargo-sources.json` or the metainfo release notes (`data/com.digitalgex.RustDiff.metainfo.xml`) also need updating. **`docs/RELEASING.md` is the full checklist** — what a `v*` tag triggers, how to validate each channel locally, and the one manual step (the Homebrew tap's `install` block, which lives in another repo).

Adding a *runtime* asset (icon, language spec, locale) means editing six independent file lists: `include` and `[package.metadata.deb].assets` in `Cargo.toml`, `build-commands` in both Flatpak manifests, `scripts/packaging/build-macos-app.sh`, `install.sh`, and `Formula/rustdiff.rb` in the tap. Wildcards already cover `data/icons/symbolic/hicolor/scalable/actions/*.svg` and `data/language-specs/*.lang` in most of them, so prefer dropping files into those directories over inventing new ones.

Bundled symbolic icons (`data/icons/symbolic/`) are fallbacks for themes missing a name, and every `-symbolic` name used in `src/` must have one — see that directory's `README.md` for the drift check. They must be **fill-based**: GTK only recolors `fill` on symbolic icons, so stroke artwork stays dark and vanishes on dark themes.

macOS ships two ways from the same tap (`jereok91/homebrew-rustdiff`): a source-build formula (`rustdiff`, updated by `release-homebrew.yml`) and a prebuilt cask (`rustdiff-app`, updated by `release-macos.yml`). The cask points at per-arch self-contained DMGs (arm64 + x86_64) built on macOS runners by `scripts/packaging/build-macos-app.sh`, which bundles the whole brew GTK stack into `RustDiff.app` (dylibs relocated via `install_name_tool`, schemas, icons, gdk-pixbuf loaders, language specs). The launcher inside the bundle exports `RUSTDIFF_DATA_DIR`, which `main_window.rs` checks when building the GtkSourceView language search path.

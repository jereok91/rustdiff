# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RustDiff is a semantic JSON/XML/SQL diff tool with a native GTK4 + Libadwaita desktop UI, written in Rust (edition 2024). It compares document *structure* (keys, array indices, XML nodes/attributes, SQL statements), not raw text lines.

## Build, run, test

Requires native GTK libs (gtk4, libadwaita-1, gtksourceview-5) — `build.rs` checks for them via `pkg-config` and fails with OS-specific install instructions if missing.

```bash
cargo run                                # dev build + run
cargo run -- left.json right.json        # open two files on launch
cargo build --release                    # optimized binary → target/release/rustdiff

cargo test                               # full suite (unit + integration)
cargo test --test parser_tests           # integration tests for parser.rs
cargo test --test diff_engine_tests      # integration tests for diff_engine.rs
cargo test json_valor_cambiado           # run a single test by name (works across files)

cargo fmt                                # uses rustfmt.toml (max_width=120, tab_spaces=4)
cargo clippy
```

The `vendor/` directory and `cargo-sources.json`/`flathub/cargo-sources.json` exist only to support offline Flatpak builds (consumed by `.flatpak-tools/flatpak-cargo-generator.py`) — normal `cargo build`/`cargo run` fetch from crates.io as usual, there's no local source-replacement config.

## Architecture

The crate is a library (`src/lib.rs`) plus a thin binary (`src/main.rs` → `rustdiff::app::run()`). Module boundaries are strict and one-directional: `parser` → `diff_engine` → `export`/`ui`, with `storage` and `settings` as independent, orthogonal services.

- **`parser.rs`** — detects format (JSON/XML/SQL) from raw text and parses into either `serde_json::Value` or the crate's own `XmlNode`/`XmlChild` tree (quick-xml is used only for tokenizing; the resulting tree is custom). Also does pretty-printing for the "Format" button. Enforces `MAX_INPUT_SIZE` (10 MB).
- **`diff_engine.rs`** — the semantic diff core, pure and UI-agnostic. Three entry points: `diff_json`, `diff_xml`, `diff_sql`, all returning a `DiffResult { added, removed, changed }` of `DiffItem { path, kind, left, right }`. Paths use JSONPath-ish notation (`$.a.b[0]`) for JSON, dot/index notation for XML, `stmt[N]` for SQL. SQL diffing is statement-level (split on `;`, quote/comment-aware) after whitespace/case normalization — it does not parse SQL grammar.
- **`export.rs`** — renders a `DiffResult` to plain text or styled HTML for saving to disk.
- **`storage.rs`** — SQLite-backed session history (`rusqlite`, bundled) at `~/.local/share/rustdiff/history.db`. Stores both documents' full text plus a `DiffSummary`, paginated (`MAX_SESSIONS`), searchable.
- **`settings.rs`** — minimal JSON prefs file at `~/.config/rustdiff/settings.json` (currently just UI language: `auto`/`en`/`es`).
- **`ui/`** — GTK4/Libadwaita widgets, GLib-idiomatic (`Rc<RefCell<...>>` for shared mutable state, no `Send`/`Sync` needed since it's single-threaded GLib main loop):
  - `main_window.rs` — the whole application shell: header bar, dual `sourceview5::View` editors, history sidebar, search bar, debounced auto-compare (500 ms via `DEBOUNCE_MS`), keyboard shortcuts. This is the largest file and owns most of the wiring between other modules.
  - `diff_panel.rs` — the diff results table, a `gtk4::ColumnView` backed by a `gio::ListStore` of `DiffItemObject` (a GObject subclass wrapping `DiffItem` — see the `mod imp` pattern for adding new GObject-backed types).
  - `highlighter.rs` — syntax highlighting glue for `sourceview5`, including loading custom language specs from `data/language-specs/` (dev path, `.deb`/`/usr/share` path, and Flatpak `/app/share` path are all checked — replicate this three-path pattern if adding more bundled resources).
- **`app.rs`** — GTK application bootstrap: locale detection (`Settings::language` → `LANG`/`LC_*` env → fallback `en`) and CLI arg handling (two positional args = auto-load into left/right panels).

## Internationalization

All user-facing strings go through `rust_i18n`'s `t!()` macro (245+ call sites), backed by `locales/en.yml` and `locales/es.yml` (loaded at compile time via `rust_i18n::i18n!("locales", fallback = "en")` in `lib.rs`). When adding UI strings, add the key to **both** locale files — English is the fallback/reference set.

## Code comments

Existing inline comments and doc comments (`//!`, `///`) are predominantly in Spanish (this is the primary maintainer's working language), while public-facing docs (README, error messages, `t!()` strings) are English-first with an `.es.md` translation. Match the surrounding file's existing comment language rather than mixing.

## Packaging

This repo ships through multiple channels kept in sync manually — Flatpak (`com.digitalgex.RustDiff.yaml`, `flathub/`), Debian/APT (`docs/DEBIAN_APT.md`, `scripts/packaging/`), crates.io, and a one-command `install.sh`. When bumping the version in `Cargo.toml`, check whether `flathub/cargo-sources.json` or the metainfo release notes (`data/com.digitalgex.RustDiff.metainfo.xml`) also need updating.

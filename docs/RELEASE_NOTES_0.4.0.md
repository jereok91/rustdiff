# RustDiff 0.4.0

Released 2026-07-27. Tag: `v0.4.0`.

A tidier header bar and a collapsible differences panel — no changes to the
diff engine, the parsers, the history database or the settings file, so
upgrading from 0.3.x needs no migration.

## What changed

### Collapsible differences panel

The results table at the bottom can now be hidden and brought back, giving
the editors the full window height:

- A **Differences** toggle in the header bar, or `Ctrl+D`.
- Opening the **graph view** hides the panel automatically (the graph wants
  the height) and closing the graph restores whatever state the panel had.
  If you re-open the panel by hand while the graph is up, that choice wins.
- The `GtkPaned` divider position survives a hide/show cycle, so the panel
  comes back at the same height you left it.

### Icon-only secondary actions in the header bar

Differences, graph, history and format are now icon buttons. The text moved
to the tooltip **and** to the widget's accessible label, so screen readers
still announce them by name. `Compare` keeps its label: it is the primary
action of the window.

### Symbolic icon fixes

- The previously bundled fallbacks were drawn with `stroke`. GTK only
  recolors `fill` when it renders a `-symbolic` icon, so on dark themes
  those strokes stayed near-black and effectively disappeared — the graph
  toggle showed as three dots with no lines between them. All bundled icons
  are now fill-based artwork from
  [adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme).
- The graph view moved from the generic `network-workgroup-symbolic` name
  to an app-private `rustdiff-graph-symbolic`. The generic name renders as
  "three monitors" on desktops that ship it (including the GNOME Flatpak
  runtime), so the button looked different depending on where RustDiff was
  installed.
- **Every** `-symbolic` name used in `src/` now has a bundled fallback (12
  files, up from 2), so a desktop whose icon theme lacks a name can no
  longer produce GTK's broken-image placeholder. `data/icons/symbolic/README.md`
  documents the sources, the licenses and a drift check.

### Packaging

- `install.sh` (the `cargo install` path) never shipped the symbolic icons.
  It now installs them per-user into
  `~/.local/share/icons/hicolor/scalable/actions/`. `hicolor` is the
  last-resort theme, so the user's own icon theme keeps priority; only
  names their theme is missing come from RustDiff.
- The `.deb` was missing `data/language-specs/*.lang`, so Debian/Ubuntu
  installs had no SQL syntax highlighting (the Flatpak, macOS and crates.io
  packages already shipped it). Added to the `cargo-deb` assets — found
  while diffing what each channel installs for this release.

## Upgrade notes

None. New keyboard shortcut `Ctrl+D`; no existing shortcut changed.

## Verification performed for this release

| Channel | How it was checked |
| --- | --- |
| Source / CI | `cargo build --release`, `cargo clippy --all-targets`, `cargo fmt --check`, `cargo test` (150 tests) |
| crates.io | `cargo package` — 41 files, all 12 symbolic icons present in the `.crate` |
| Flatpak | `flatpak-builder` build from `com.digitalgex.RustDiff.yaml` against GNOME Platform 50, then launched from the build dir |
| Debian / APT | `cargo deb` package built and its contents listed |
| AppStream | `appstreamcli validate data/com.digitalgex.RustDiff.metainfo.xml` |
| Desktop entry | `desktop-file-validate data/com.digitalgex.RustDiff.desktop` |
| macOS | Not runnable from Linux — built by `release-macos.yml` on macOS runners. The icon risk that broke 0.3.2/0.3.3 there is what this release closes: every icon name now has a bundled fallback that `scripts/packaging/build-macos-app.sh` copies into `RustDiff.app` by wildcard. |

## Files touched by the version bump

- `Cargo.toml`, `Cargo.lock` — `0.3.3` → `0.4.0`
- `data/com.digitalgex.RustDiff.metainfo.xml` — new `<release>` entry
- `flathub/com.digitalgex.RustDiff.yaml` — `tag`/`commit` of the local mirror
- `README.md`, `README.es.md` — shortcut table and feature list

See `docs/RELEASING.md` for the full checklist and what each tag triggers.

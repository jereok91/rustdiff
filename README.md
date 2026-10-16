# RustDiff

[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Semantic JSON, XML & SQL diff tool for the desktop. It compares document
*structure* — keys, array indices, XML nodes and attributes, SQL statements —
not raw text lines. The diff engine is written in Rust; the app is a
[Tauri v2](https://v2.tauri.app/) shell with a React interface.

**1.0.0 is the first stable release**: a full rewrite of the interface on a
modern stack, on top of the same diff engine, history and settings as 0.4.0.
See [the 1.0.0 release notes](docs/RELEASE_NOTES_1.0.0.md).

Language: **English** | [Español](README.es.md)

## Built with

- **Tauri v2** shell in Rust, using the system WebView (WebKitGTK 4.1 on Linux, WKWebView on macOS)
- **React 19 + TypeScript** frontend, built with Vite
- **Tailwind CSS v4** and **shadcn/ui** components on **Radix** primitives
- **CodeMirror 6** editors, **Geist** and **Geist Mono** fonts (self-hosted, never fetched from the network)
- An **OKLCH design system** with light and dark themes and **WCAG AA contrast enforced by tests** ([`docs/design-system.md`](docs/design-system.md))
- **Typed IPC generated with tauri-specta**: the interface calls Rust commands only; it never touches the filesystem
- **i18next** for the interface, English and Spanish

## Features

- Semantic diff for JSON, XML and SQL (objects, arrays, XML nodes, attributes, text and SQL statements), with a line-by-line fallback for plain text
- Side-by-side CodeMirror editors with syntax highlighting, inline (character-level) diff highlighting and pretty-print (`Ctrl+Shift+F`)
- Search inside the editors (`Ctrl+F`) with next/previous navigation and wrap-around
- Auto compare while typing (debounced) and manual compare (`Ctrl+Enter`)
- Difference table with type filters and click-to-jump navigation, resizable and collapsible with `Ctrl+D`
- Graph view (`Ctrl+G`): the left document as an interactive node graph drawn on a canvas over a layout computed in Rust (pan, zoom, fit, node search, node inspection), JSON Crack style
- Light and dark themes, dark by default (or follow the system)
- UI text size from 60 % to 200 % (`Ctrl++`, `Ctrl+-`, `Ctrl+0`), remembered across sessions
- English and Spanish interface, switched live without a restart
- Keyboard shortcuts for every main action, listed in-app with `Ctrl+?`
- Export to `.txt` and styled `.html`
- Session history stored in SQLite (paginated, searchable, per-entry and bulk deletion)

## Screenshots

![Main view - Comparing JSON documents](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/main.png)

![Difference table with filters](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/diff-table.png)

![Session history sidebar](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/history.png)

## Installation

| Channel | Platforms | Updates |
| --- | --- | --- |
| [Flatpak (Flathub)](#1-flatpak--flathub-recommended-on-linux) | any Linux distro | `flatpak update` |
| [Debian package / APT repository](#2-debian-package-deb-and-apt-repository) | Ubuntu 24.04+, Debian 13+ (amd64, arm64) | `apt upgrade` |
| [One-command installer](#3-one-command-installer) | Debian/Ubuntu (installs the `.deb`), other distros (builds from source) | re-run it |
| [macOS DMG / Homebrew cask](#4-macos) | macOS (Apple Silicon, Intel) | `brew upgrade --cask` |
| [From source](#build-from-source) | Linux, macOS | `git pull` + rebuild |

RustDiff is no longer published on crates.io (`cargo install rustdiff` installs
the last GTK release, 0.4.x). See [the 1.0.0 release notes](docs/RELEASE_NOTES_1.0.0.md).

### 1) Flatpak + Flathub (recommended on Linux)

Install Flatpak and enable Flathub:

```bash
# Arch / Manjaro
sudo pacman -S flatpak
# Fedora
sudo dnf install flatpak
# Ubuntu / Debian
sudo apt update && sudo apt install -y flatpak
# openSUSE
sudo zypper install flatpak

flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

Install, run, update, remove:

```bash
flatpak install flathub com.digitalgex.RustDiff
flatpak run com.digitalgex.RustDiff
flatpak update com.digitalgex.RustDiff
flatpak uninstall com.digitalgex.RustDiff
```

The Flatpak bundles its own GNOME runtime (with WebKitGTK), so it works
regardless of the host's library versions. To build it locally from this
checkout, see `com.digitalgex.RustDiff.yaml`.

### 2) Debian package (`.deb`) and APT repository

From a downloaded `.deb` ([GitHub Releases](https://github.com/jereok91/rustdiff/releases)):

```bash
sudo apt install ./rustdiff_*.deb
```

From the signed APT repository hosted on GitHub Pages:

```bash
curl -fsSL https://jereok91.github.io/rustdiff/KEY.gpg | sudo tee /usr/share/keyrings/rustdiff-archive-keyring.gpg >/dev/null
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/rustdiff-archive-keyring.gpg] https://jereok91.github.io/rustdiff stable main" | sudo tee /etc/apt/sources.list.d/rustdiff.list >/dev/null
sudo apt update
sudo apt install rustdiff
```

The package is named `rustdiff`, installs `/usr/bin/rustdiff` and depends on
`libwebkit2gtk-4.1-0` and `libgtk-3-0`. Upgrading from 0.4.x is a normal
`apt upgrade`.

> **Minimum OS version:** the `.deb` is built on the CI runner's Ubuntu 24.04,
> so it needs the glibc of **Ubuntu 24.04+ or Debian 13 (trixie)+**. On older
> releases use the [Flatpak](#1-flatpak--flathub-recommended-on-linux) or
> [build from source](#build-from-source).

Remove the package and the repository:

```bash
sudo apt remove rustdiff
sudo rm -f /etc/apt/sources.list.d/rustdiff.list /usr/share/keyrings/rustdiff-archive-keyring.gpg
sudo apt update
```

### 3) One-command installer

```bash
curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash
```

- On Debian/Ubuntu it downloads the latest release `.deb` and installs it with `apt`.
- On other distros (or with `RUSTDIFF_FROM_SOURCE=1`) it installs the WebKitGTK
  development packages, builds the app with pnpm + cargo and installs it per
  user: `~/.local/bin/rustdiff` plus the desktop entry, AppStream metainfo and
  icon under `~/.local/share`. It needs Rust, Node.js and pnpm (see below).

### 4) macOS

Every release ships a `.dmg` per architecture (Apple Silicon `arm64` and Intel
`x86_64`). The app uses the system WebKit, so there are no extra dependencies.

```bash
brew install --cask jereok91/rustdiff/rustdiff-app
brew upgrade --cask rustdiff-app
brew uninstall --cask rustdiff-app   # add --zap to also remove settings and history
```

Or download `RustDiff-<version>-macos-<arch>.dmg` from
[Releases](https://github.com/jereok91/rustdiff/releases) and drag
`RustDiff.app` into `Applications`.

> The app is ad-hoc signed (no Apple Developer certificate). If macOS blocks
> the first launch: right-click the app → **Open**, or run
> `xattr -cr /Applications/RustDiff.app`.

The Homebrew **source formula** (`brew install jereok91/rustdiff/rustdiff`) is
retired: it built the GTK app with `cargo install`, which no longer exists.
If you used it, switch with `brew uninstall rustdiff && brew install --cask jereok91/rustdiff/rustdiff-app`.

## Build from source

### Requirements

- Rust 1.85+ (edition 2024): `rustup update stable`
- Node.js 20+ and pnpm 10 (`npm install -g pnpm` or `corepack enable pnpm`)
- On Linux, WebKitGTK 4.1 and a C toolchain:

```bash
# Arch / CachyOS / Manjaro
sudo pacman -S --needed base-devel webkit2gtk-4.1 librsvg

# Fedora
sudo dnf install gcc gcc-c++ make pkgconf-pkg-config webkit2gtk4.1-devel libsoup3-devel librsvg2-devel

# Ubuntu / Debian (24.04+ / 13+)
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev

# openSUSE
sudo zypper install gcc gcc-c++ make pkg-config webkit2gtk3-devel libsoup-devel librsvg-devel
```

On macOS only the Xcode Command Line Tools are needed (`xcode-select --install`).

Check WebKitGTK on Linux:

```bash
pkg-config --modversion webkit2gtk-4.1
```

### Build and run

```bash
cd desktop
pnpm install
pnpm tauri dev                 # the app with hot reload
pnpm tauri build               # release binary + .deb (Linux) / .app + .dmg (macOS)
pnpm tauri build --no-bundle   # release binary only
```

The binary lands in `target/release/rustdiff` (at the repository root: the
Cargo workspace shares one `target/`), the bundles in `target/release/bundle/`.

## Usage

```bash
rustdiff                                  # empty window
rustdiff old_config.json new_config.json  # compare two files
rustdiff schema_v1.xml schema_v2.xml
```

## Keyboard shortcuts

| Shortcut       | Action                       |
| -------------- | ---------------------------- |
| `Ctrl+O`       | Open file in left panel      |
| `Ctrl+Shift+O` | Open file in right panel     |
| `Ctrl+Enter`   | Compare now                  |
| `Ctrl+Shift+F` | Pretty-print both panels     |
| `Ctrl+F`       | Search inside the editors    |
| `Ctrl+G`       | Toggle graph view            |
| `Ctrl+D`       | Toggle differences panel     |
| `Ctrl+S`       | Save session to history      |
| `Ctrl+H`       | Toggle history panel         |
| `Ctrl+E`       | Export result as `.txt`      |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Increase / decrease / reset UI text size |
| `Ctrl+?`       | Show all shortcuts           |

## Data, config, and outputs

- History DB: `~/.local/share/rustdiff/history.db` (macOS: `~/Library/Application Support/rustdiff/`)
- UI settings: `~/.config/rustdiff/settings.json` (macOS: `~/Library/Application Support/rustdiff/`)
- Flatpak keeps both under `~/.var/app/com.digitalgex.RustDiff/`
- Export formats: plain text (`.txt`) and HTML (`.html`)

## Tests

```bash
# Core and persistence only (no WebKit needed)
cargo test

# Everything, including the Tauri shell (needs WebKitGTK dev packages on Linux)
cargo test --workspace --all-targets

# A single integration suite of the core
cargo test -p rustdiff-core --test parser_tests

# Frontend (Vitest)
cd desktop && pnpm test
```

## Packaging documentation

- Release checklist and what a `v*` tag publishes: `docs/RELEASING.md`
- Debian/APT packaging and GitHub Actions setup: `docs/DEBIAN_APT.md`
- Flatpak manifest for local builds: `com.digitalgex.RustDiff.yaml`
- Flathub submission files and workflow: `flathub/README.md`
- Screenshot requirements (AppStream/Flathub): `data/screenshots/README.md`
- Design system of the interface: `docs/design-system.md`
- Release notes: `docs/RELEASE_NOTES_1.0.0.md`

## License

GPL-3.0-or-later

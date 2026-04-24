# RustDiff

[![Crates.io](https://img.shields.io/crates/v/rustdiff)](https://crates.io/crates/rustdiff)
[![License: GPL-3.0-or-later](https://img.shields.io/crates/l/rustdiff)](LICENSE)

Semantic JSON and XML diff tool with a native GTK4 + Libadwaita desktop UI.

Language: **English** | [Espanol](README.es.md)

## Features

- Semantic JSON and XML diff (objects, arrays, XML nodes, attributes, and text)
- Side-by-side editors with syntax highlighting
- Auto compare while typing (debounced) + manual compare
- Difference table with filters and click-to-jump navigation
- Export to `.txt` and styled `.html`
- Session history stored in SQLite

## Installation

### 1) Flatpak + Flathub (recommended for desktop users)

Install Flatpak:

```bash
# Arch / Manjaro
sudo pacman -S flatpak

# Fedora
sudo dnf install flatpak

# Ubuntu / Debian
sudo apt update && sudo apt install -y flatpak

# openSUSE
sudo zypper install flatpak
```

Enable Flathub:

```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

Install and run RustDiff from Flathub:

```bash
flatpak install flathub com.digitalgex.RustDiff
flatpak run com.digitalgex.RustDiff
```

Update or remove:

```bash
flatpak update com.digitalgex.RustDiff
flatpak uninstall com.digitalgex.RustDiff
```

Notes:

- If software centers do not show Flathub apps immediately, log out and back in.
- If `com.digitalgex.RustDiff` is not available yet, build the Flatpak locally from this repo (see `com.digitalgex.RustDiff.yaml`).

### 2) One-command installer (Cargo + system deps)

```bash
curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash
```

### 3) Cargo install (from crates.io)

```bash
cargo install rustdiff
```

## System requirements (source/Cargo builds)

### Rust

Rust 1.85+ (edition 2024):

```bash
rustup update stable
rustc --version
```

### Native libraries

RustDiff uses native GTK libraries. You need a C toolchain (`gcc/clang`, `make`, `pkg-config`) and GTK development packages.

```bash
# Arch / CachyOS / Manjaro
sudo pacman -S base-devel gtk4 libadwaita gtksourceview5

# Fedora
sudo dnf install gcc make pkgconf-pkg-config gtk4-devel libadwaita-devel gtksourceview5-devel

# Ubuntu / Debian (24.04+)
sudo apt install build-essential pkg-config libgtk-4-dev libadwaita-1-dev libgtksourceview-5-dev

# openSUSE
sudo zypper install gcc make pkg-config gtk4-devel libadwaita-devel gtksourceview5-devel

# macOS (experimental)
brew install pkgconf gtk4 libadwaita gtksourceview5
```

Verify required libs:

```bash
pkg-config --exists gtk4 && echo "gtk4: OK" || echo "gtk4: MISSING"
pkg-config --exists libadwaita-1 && echo "libadwaita: OK" || echo "libadwaita: MISSING"
pkg-config --exists gtksourceview-5 && echo "gtksourceview5: OK" || echo "gtksourceview5: MISSING"
```

## Build and run

```bash
# Development
cargo run

# Open with two files
cargo run -- left.json right.json

# Optimized release binary
cargo build --release
```

Binary output:

```text
target/release/rustdiff
```

Install local checkout:

```bash
cargo install --path .
```

## Usage

```bash
# Open empty window
rustdiff

# Open two JSON files
rustdiff old_config.json new_config.json

# Open two XML files
rustdiff schema_v1.xml schema_v2.xml
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open file in left panel |
| `Ctrl+Shift+O` | Open file in right panel |
| `Ctrl+Enter` | Force compare |
| `Ctrl+S` | Save session to history |
| `Ctrl+E` | Export result as `.txt` |
| `Ctrl+Shift+F` | Pretty-print both panels |
| `Ctrl+H` | Toggle history panel |

## Data, config, and outputs

- History DB: `~/.local/share/rustdiff/history.db`
- UI settings: `~/.config/rustdiff/settings.json`
- Export formats: plain text (`.txt`) and HTML (`.html`)

## Tests

```bash
# Full test suite
cargo test

# Integration tests
cargo test --test parser_tests
cargo test --test diff_engine_tests
```

## Flathub and packaging documentation

- Flatpak manifest for local builds: `com.digitalgex.RustDiff.yaml`
- Flathub submission files: `flathub/com.digitalgex.RustDiff.yaml`, `flathub/cargo-sources.json`
- Flathub submission workflow: `flathub/README.md`
- Screenshot requirements (AppStream/Flathub): `data/screenshots/README.md`

Useful external references:

- Flathub setup guide: https://flathub.org/setup
- Flatpak documentation: https://docs.flatpak.org/

## License

GPL-3.0-or-later

# RustDiff

[![Crates.io](https://img.shields.io/crates/v/rustdiff)](https://crates.io/crates/rustdiff)
[![License: GPL-3.0-or-later](https://img.shields.io/crates/l/rustdiff)](LICENSE)

Semantic JSON, XML & SQL diff tool with a native GTK4 + Libadwaita desktop UI.

Language: **English** | [Espanol](README.es.md)

## Features

- Semantic JSON, XML & SQL diff (objects, arrays, XML nodes, attributes, text, and SQL statements)
- Welcome screen with guided comparison flow (single editor initially)
- Side-by-side editors with syntax highlighting
- **Busqueda en editores** (`Ctrl+F`) con navegacion siguiente/anterior y wrap-around
- Auto compare while typing (debounced) + manual compare
- Difference table with filters and click-to-jump navigation
- Export to `.txt` and styled `.html`
- Session history stored in SQLite (paginated, searchable)

## Screenshots

![Main view - Comparing JSON documents](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/main.png)

![Difference table with filters](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/diff-table.png)

![Session history sidebar](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/history.png)

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

### 4) Debian package (`.deb`) and APT repository (PPA-style)

Install from a downloaded `.deb` (from GitHub Releases):

```bash
sudo apt install ./rustdiff_*.deb
```

Install from the GitHub-hosted APT repository:

```bash
curl -fsSL https://jereok91.github.io/rustdiff/KEY.gpg | sudo tee /usr/share/keyrings/rustdiff-archive-keyring.gpg >/dev/null
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/rustdiff-archive-keyring.gpg] https://jereok91.github.io/rustdiff stable main" | sudo tee /etc/apt/sources.list.d/rustdiff.list >/dev/null
sudo apt update
sudo apt install rustdiff
```

APT repository builds are published for `amd64` and `arm64` (e.g. Raspberry Pi 5, ARM servers).

Remove the package and repository:

```bash
sudo apt remove rustdiff
sudo rm -f /etc/apt/sources.list.d/rustdiff.list /usr/share/keyrings/rustdiff-archive-keyring.gpg
sudo apt update
```

### 5) macOS (experimental)

#### Option A — Prebuilt binary (recommended)

Every release ships a self-contained `.dmg` per architecture (Apple Silicon
`arm64` and Intel `x86_64`): no Homebrew required, nothing to compile.

With Homebrew Cask (picks the right architecture automatically):

```bash
brew install --cask --no-quarantine jereok91/rustdiff/rustdiff-app
```

Or manually: download `RustDiff-<version>-macos-<arch>.dmg` from
[Releases](https://github.com/jereok91/rustdiff/releases), open it and drag
`RustDiff.app` into `Applications`.

> The app is ad-hoc signed (no Apple Developer certificate). If macOS blocks
> the first launch: right-click the app → **Open**, or run
> `xattr -cr /Applications/RustDiff.app`. The cask's `--no-quarantine` flag
> skips this step.

**Upgrade / uninstall:**

```bash
brew upgrade --cask rustdiff-app
brew uninstall --cask rustdiff-app   # add --zap to also remove settings and history
```

#### Option B — Homebrew building from source

```bash
brew install jereok91/rustdiff/rustdiff
cp -R "$(brew --prefix)/opt/rustdiff/RustDiff.app" /Applications/
```

- The first command builds RustDiff from source; the GTK4 stack (`gtk4`, `libadwaita`, `gtksourceview5`) is installed automatically as dependencies. The first install takes a few minutes while everything compiles. After it, `rustdiff` is available from the terminal.
- The second command copies the `RustDiff.app` bundle so the app shows up in **Launchpad and Spotlight**. You only need to do it once: the bundle launches the brew-managed binary, so it keeps working after every `brew upgrade rustdiff` without copying it again.

**Upgrade:**

```bash
brew update && brew upgrade rustdiff
```

**Uninstall:**

```bash
brew uninstall rustdiff
rm -rf /Applications/RustDiff.app
```

> Note: GTK4 on macOS is functional but considered experimental upstream.
> Both options can be installed side by side (the cask installs into
> `/Applications`, the formula into the brew prefix).

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

| Shortcut       | Action                   |
| -------------- | ------------------------ |
| `Ctrl+O`       | Open file in left panel  |
| `Ctrl+Shift+O` | Open file in right panel |
| `Ctrl+Enter`   | Force compare            |
| `Ctrl+S`       | Save session to history  |
| `Ctrl+E`       | Export result as `.txt`  |
| `Ctrl+Shift+F` | Pretty-print both panels |
| `Ctrl+H`       | Toggle history panel     |

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
- Debian/APT packaging and GitHub Actions setup: `docs/DEBIAN_APT.md`

Useful external references:

- Flathub setup guide: <https://flathub.org/setup>
- Flatpak documentation: <https://docs.flatpak.org/>

## License

GPL-3.0-or-later

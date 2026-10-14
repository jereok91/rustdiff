#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# install.sh — Instala RustDiff (app Tauri) en Linux.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash
#
# O localmente, desde un checkout:
#   ./install.sh
#
# Estrategia:
#   - Debian/Ubuntu (amd64/arm64): baja el .deb del ultimo release y lo
#     instala con apt (queda en /usr/bin, se actualiza con el repo APT).
#   - Resto de distros (o RUSTDIFF_FROM_SOURCE=1): instala las libs de
#     WebKitGTK, compila con pnpm + cargo (`pnpm tauri build --no-bundle`) e
#     instala binario, .desktop, metainfo e icono por usuario en ~/.local.
#   - macOS: usa el cask de Homebrew (`brew install --cask jereok91/rustdiff/rustdiff-app`).
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO="jereok91/rustdiff"
APP_ID="com.digitalgex.RustDiff"

# ── Colores ──────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # Sin color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Directorio temporal unico para descargas y clones; se limpia al salir.
TMP_DIR=""
cleanup() { if [ -n "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT
tmp_dir() {
    if [ -z "$TMP_DIR" ]; then TMP_DIR="$(mktemp -d)"; fi
    echo "$TMP_DIR"
}

# ── Verificar SO soportado ───────────────────
OS="$(uname -s)"
case "$OS" in
    Linux)  ;;
    Darwin)
        info "macOS detectado: RustDiff se distribuye como DMG / cask de Homebrew."
        echo "    brew install --cask jereok91/rustdiff/rustdiff-app"
        exit 0
        ;;
    *)      fail "Sistema operativo no soportado: $OS" ;;
esac

# ── Detectar package manager ─────────────────
detect_pm() {
    if   command -v apt-get &>/dev/null && command -v dpkg &>/dev/null; then echo "apt"
    elif command -v pacman  &>/dev/null; then echo "pacman"
    elif command -v dnf     &>/dev/null; then echo "dnf"
    elif command -v zypper  &>/dev/null; then echo "zypper"
    else echo "unknown"
    fi
}

PM=$(detect_pm)
info "Package manager detectado: ${BOLD}${PM}${NC}"

# ─────────────────────────────────────────────
# CAMINO 1: Debian/Ubuntu → .deb del ultimo release
# ─────────────────────────────────────────────
install_release_deb() {
    local arch
    arch="$(dpkg --print-architecture)"
    case "$arch" in
        amd64|arm64) ;;
        *) warn "No hay .deb publicado para ${arch}."; return 1 ;;
    esac

    info "Buscando el .deb del ultimo release (${arch})..."
    local url
    url="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep -oE "https://[^\"]+/rustdiff_[^\"/]+_${arch}\.deb" \
        | head -n 1 || true)"
    if [ -z "$url" ]; then
        warn "El ultimo release no publica un .deb rustdiff para ${arch}."
        return 1
    fi

    local deb
    deb="$(tmp_dir)/$(basename "$url")"
    curl -fsSL "$url" -o "$deb" || { warn "No se pudo descargar $url"; return 1; }

    # apt resuelve las dependencias (libwebkit2gtk-4.1-0, libgtk-3-0).
    sudo apt-get install -y "$deb"
    ok "Paquete $(basename "$deb") instalado."
    echo
    echo "  Para recibir actualizaciones con apt, agrega el repositorio:"
    echo "  https://github.com/${REPO}#2-debian-package-deb-and-apt-repository"
    return 0
}

# ─────────────────────────────────────────────
# CAMINO 2: compilar desde fuente
# ─────────────────────────────────────────────

# Dependencias de sistema de Tauri v2 en Linux: WebKitGTK 4.1 (trae GTK3 y
# libsoup3), librsvg para los iconos y un toolchain C para enlazar.
install_deps() {
    info "Instalando WebKitGTK 4.1 y el toolchain C del sistema..."

    case "$PM" in
        apt)
            sudo apt-get update
            sudo apt-get install -y \
                build-essential pkg-config curl file \
                libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev
            ;;
        pacman)
            sudo pacman -S --needed --noconfirm \
                base-devel curl file webkit2gtk-4.1 librsvg
            ;;
        dnf)
            sudo dnf install -y \
                gcc gcc-c++ make pkgconf-pkg-config curl file \
                webkit2gtk4.1-devel libsoup3-devel librsvg2-devel
            ;;
        zypper)
            sudo zypper install -y \
                gcc gcc-c++ make pkg-config curl file \
                webkit2gtk3-devel libsoup-devel librsvg-devel
            ;;
        *)
            fail "Package manager no soportado. Instala manualmente:\n" \
                 "        - Toolchain C: gcc / clang + make + pkg-config\n" \
                 "        - Librerias:   webkit2gtk-4.1 (paquete -devel), librsvg"
            ;;
    esac

    ok "Dependencias del sistema instaladas."
}

check_build_tools() {
    command -v cargo &>/dev/null \
        || fail "Cargo no encontrado. Instala Rust primero:\n         curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    command -v node &>/dev/null \
        || fail "Node.js no encontrado. Instala Node 20+ (https://nodejs.org o el gestor de tu distro)."
    if ! command -v pnpm &>/dev/null; then
        if command -v corepack &>/dev/null; then
            info "Activando pnpm via corepack..."
            corepack enable pnpm 2>/dev/null || sudo corepack enable pnpm
        fi
        command -v pnpm &>/dev/null \
            || fail "pnpm no encontrado. Instalalo con: npm install -g pnpm"
    fi
    info "Rust $(rustc --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'), Node $(node --version), pnpm $(pnpm --version)"
}

deps_ok() {
    local tool
    for tool in cc make pkg-config; do
        command -v "$tool" &>/dev/null || return 1
    done
    pkg-config --exists webkit2gtk-4.1 2>/dev/null
}

# Devuelve la raiz del codigo: el checkout actual si el script corre desde
# uno, si no un clon superficial en el directorio temporal.
source_dir() {
    if [ -f "desktop/src-tauri/tauri.conf.json" ] && [ -f "Cargo.toml" ]; then
        pwd
        return
    fi
    command -v git &>/dev/null || fail "git no encontrado (hace falta para bajar el codigo)."
    local dir
    dir="$(tmp_dir)/rustdiff"
    info "Clonando ${REPO}..." >&2
    git clone --depth 1 "https://github.com/${REPO}.git" "$dir" >&2
    echo "$dir"
}

# Binario, .desktop, metainfo e icono por usuario (~/.local). El Exec= del
# .desktop se parchea con la ruta absoluta: los launchers graficos no siempre
# tienen ~/.local/bin en el PATH.
install_user_files() {
    local src="$1"
    local bin_dir="$HOME/.local/bin"
    local home_apps="$HOME/.local/share/applications"
    local home_icons="$HOME/.local/share/icons/hicolor/scalable/apps"
    local home_metainfo="$HOME/.local/share/metainfo"
    mkdir -p "$bin_dir" "$home_apps" "$home_icons" "$home_metainfo"

    install -Dm755 "${src}/target/release/rustdiff" "${bin_dir}/rustdiff"
    ok "Binario instalado en ${bin_dir}/rustdiff"

    install -Dm644 "${src}/data/icons/${APP_ID}.svg" "${home_icons}/${APP_ID}.svg"
    ok "Icono instalado en ${home_icons}/"

    sed -E \
        -e "s|^Exec=rustdiff$|Exec=${bin_dir}/rustdiff|" \
        -e "s|^Exec=rustdiff |Exec=${bin_dir}/rustdiff |" \
        "${src}/data/${APP_ID}.desktop" > "${home_apps}/${APP_ID}.desktop"
    chmod 644 "${home_apps}/${APP_ID}.desktop"
    ok "Entrada de menu instalada en ${home_apps}/"

    install -Dm644 "${src}/data/${APP_ID}.metainfo.xml" "${home_metainfo}/${APP_ID}.metainfo.xml"
    ok "Metadata AppStream instalada en ${home_metainfo}/"

    # Refrescar caches per-user para que el menu vea la app inmediatamente.
    if command -v gtk-update-icon-cache &>/dev/null; then
        gtk-update-icon-cache -f "$HOME/.local/share/icons/hicolor/" 2>/dev/null || true
    fi
    if command -v update-desktop-database &>/dev/null; then
        update-desktop-database "$home_apps" 2>/dev/null || true
    fi

    case ":$PATH:" in
        *":${bin_dir}:"*) ;;
        *) warn "${bin_dir} no esta en tu PATH; agregalo para lanzar 'rustdiff' desde la terminal." ;;
    esac
}

build_from_source() {
    if deps_ok; then
        ok "Dependencias del sistema ya instaladas."
    else
        install_deps
    fi
    check_build_tools

    local src
    src="$(source_dir)"
    info "Compilando RustDiff (frontend + shell, puede tardar unos minutos)..."
    (
        cd "${src}/desktop"
        pnpm install --frozen-lockfile
        # --no-bundle: solo el binario (con el frontend embebido), sin .deb.
        pnpm tauri build --no-bundle
    )
    install_user_files "$src"
}

# ── Elegir camino ────────────────────────────
INSTALLED_VIA=""
if [ "$PM" = "apt" ] && [ "${RUSTDIFF_FROM_SOURCE:-0}" != "1" ]; then
    if install_release_deb; then
        INSTALLED_VIA="deb"
    else
        warn "Se compila desde fuente."
    fi
fi
if [ -z "$INSTALLED_VIA" ]; then
    build_from_source
    INSTALLED_VIA="source"
fi

# Hasta 0.4.x este script instalaba con `cargo install rustdiff` (crates.io,
# retirado en 0.5.0). Ese binario viejo puede tapar al nuevo en el PATH.
if [ -x "$HOME/.cargo/bin/rustdiff" ]; then
    warn "Hay un rustdiff viejo (GTK) en ~/.cargo/bin; quitalo con: cargo uninstall rustdiff"
fi

# ── Resumen final ────────────────────────────
echo
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  RustDiff instalado correctamente.${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo
echo -e "  Ejecutar:      ${BOLD}rustdiff${NC}"
echo -e "  Con archivos:  ${BOLD}rustdiff archivo1.json archivo2.json${NC}"
if [ "$INSTALLED_VIA" = "deb" ]; then
    echo -e "  Desinstalar:   ${BOLD}sudo apt remove rustdiff${NC}"
else
    echo -e "  Desinstalar:   ${BOLD}rm ~/.local/bin/rustdiff ~/.local/share/applications/${APP_ID}.desktop \\"
    echo -e "                    ~/.local/share/metainfo/${APP_ID}.metainfo.xml ~/.local/share/icons/hicolor/scalable/apps/${APP_ID}.svg${NC}"
fi
echo

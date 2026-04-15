#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# install.sh — Instala RustDiff y sus dependencias de sistema.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash
#
# O localmente:
#   chmod +x install.sh && ./install.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

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

# ── Verificar SO soportado ───────────────────
OS="$(uname -s)"
case "$OS" in
    Linux)  ;;
    Darwin) warn "macOS detectado. GTK4+Libadwaita en macOS es experimental." ;;
    *)      fail "Sistema operativo no soportado: $OS" ;;
esac

# ── Verificar que Rust esta instalado ────────
if ! command -v cargo &>/dev/null; then
    fail "Cargo no encontrado. Instala Rust primero:\n         curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi

rust_version=$(rustc --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
info "Rust detectado: ${BOLD}${rust_version}${NC}"

# ── Detectar package manager ─────────────────
detect_pm() {
    if   command -v pacman &>/dev/null; then echo "pacman"
    elif command -v dnf    &>/dev/null; then echo "dnf"
    elif command -v apt    &>/dev/null; then echo "apt"
    elif command -v zypper &>/dev/null; then echo "zypper"
    elif command -v brew   &>/dev/null; then echo "brew"
    else echo "unknown"
    fi
}

PM=$(detect_pm)
info "Package manager detectado: ${BOLD}${PM}${NC}"

# ── Instalar dependencias del sistema ────────
install_deps() {
    info "Instalando dependencias GTK del sistema..."

    case "$PM" in
        pacman)
            sudo pacman -S --needed --noconfirm gtk4 libadwaita gtksourceview5
            ;;
        dnf)
            sudo dnf install -y gtk4-devel libadwaita-devel gtksourceview5-devel
            ;;
        apt)
            sudo apt update
            sudo apt install -y libgtk-4-dev libadwaita-1-dev libgtksourceview-5-dev
            ;;
        zypper)
            sudo zypper install -y gtk4-devel libadwaita-devel gtksourceview5-devel
            ;;
        brew)
            brew install pkgconf gtk4 libadwaita gtksourceview5
            ;;
        *)
            fail "Package manager no soportado. Instala manualmente:\n" \
                 "        gtk4, libadwaita y gtksourceview5 (paquetes de desarrollo)"
            ;;
    esac

    ok "Dependencias del sistema instaladas."
}

# Verificar si las deps ya estan instaladas
deps_ok=true
for lib in gtk4 libadwaita-1 gtksourceview-5; do
    if ! pkg-config --exists "$lib" 2>/dev/null; then
        deps_ok=false
        break
    fi
done

if [ "$deps_ok" = true ]; then
    ok "Dependencias del sistema ya instaladas."
else
    install_deps
fi

# ── Instalar RustDiff via cargo ──────────────
info "Compilando e instalando RustDiff (esto puede tardar unos minutos)..."
cargo install rustdiff
ok "rustdiff instalado en $(which rustdiff || echo '~/.cargo/bin/rustdiff')"

# ── Instalar icono y .desktop ────────────────
install_desktop_files() {
    info "Instalando icono y entrada de menu..."

    # Descargar archivos si no estamos en el repo
    local icon_src="data/icons/rustdiff.svg"
    local desktop_src="data/rustdiff.desktop"
    local tmp_dir=""

    if [ ! -f "$icon_src" ]; then
        tmp_dir=$(mktemp -d)
        icon_src="${tmp_dir}/rustdiff.svg"
        desktop_src="${tmp_dir}/rustdiff.desktop"

        curl -fsSL "https://raw.githubusercontent.com/jereok91/rustdiff/main/data/icons/rustdiff.svg" \
            -o "$icon_src" || warn "No se pudo descargar el icono."
        curl -fsSL "https://raw.githubusercontent.com/jereok91/rustdiff/main/data/rustdiff.desktop" \
            -o "$desktop_src" || warn "No se pudo descargar el .desktop."
    fi

    # Instalar icono
    if [ -f "$icon_src" ]; then
        sudo install -Dm644 "$icon_src" \
            /usr/share/icons/hicolor/scalable/apps/rustdiff.svg
        ok "Icono instalado."
    fi

    # Instalar .desktop
    if [ -f "$desktop_src" ]; then
        sudo install -Dm644 "$desktop_src" \
            /usr/share/applications/rustdiff.desktop
        ok "Entrada de menu instalada."
    fi

    # Actualizar caches del sistema
    if command -v gtk-update-icon-cache &>/dev/null; then
        sudo gtk-update-icon-cache -f /usr/share/icons/hicolor/ 2>/dev/null || true
    fi
    if command -v update-desktop-database &>/dev/null; then
        sudo update-desktop-database /usr/share/applications/ 2>/dev/null || true
    fi

    # Limpiar temporales
    [ -n "$tmp_dir" ] && rm -rf "$tmp_dir"
}

# Solo instalar .desktop e icono en Linux (no aplica en macOS)
if [ "$OS" = "Linux" ]; then
    install_desktop_files
else
    info "Saltando instalacion de .desktop e icono (no aplica en macOS)."
fi

# ── Resumen final ────────────────────────────
echo
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  RustDiff instalado correctamente.${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${NC}"
echo
echo -e "  Ejecutar:      ${BOLD}rustdiff${NC}"
echo -e "  Con archivos:  ${BOLD}rustdiff archivo1.json archivo2.json${NC}"
echo -e "  Desinstalar:   ${BOLD}cargo uninstall rustdiff${NC}"
echo

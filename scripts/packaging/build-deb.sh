#!/usr/bin/env bash
# Construye el paquete .deb de RustDiff con el bundler de Tauri.
#
# El paquete se llama `rustdiff` (desktop/src-tauri/tauri.linux.conf.json fija
# el productName en minusculas en Linux) e instala /usr/bin/rustdiff, el
# .desktop, el metainfo AppStream y los iconos (bundle.linux.deb en
# tauri.conf.json). Salida: target/release/bundle/deb/rustdiff_<ver>_<arch>.deb
#
# Uso: scripts/packaging/build-deb.sh [args extra para `pnpm tauri build`]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

for cmd in cargo pnpm; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[ERROR] $cmd is not installed."
        exit 1
    fi
done

echo "[INFO] Installing frontend dependencies..."
(cd desktop && pnpm install --frozen-lockfile)

# `pnpm tauri build` corre `pnpm build` (beforeBuildCommand) y compila el
# shell con la feature `custom-protocol`, que es la que embebe el frontend.
echo "[INFO] Building Debian package..."
(cd desktop && pnpm tauri build --bundles deb "$@")

shopt -s nullglob
debs=(target/release/bundle/deb/rustdiff_*.deb)

if [ "${#debs[@]}" -eq 0 ]; then
    echo "[ERROR] No .deb package generated in target/release/bundle/deb/."
    exit 1
fi

echo "[OK] Generated package(s):"
for deb in "${debs[@]}"; do
    echo " - $deb"
done

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
    echo "[ERROR] cargo is not installed."
    exit 1
fi

if ! command -v cargo-deb >/dev/null 2>&1; then
    echo "[INFO] Installing cargo-deb..."
    cargo install cargo-deb --locked
fi

echo "[INFO] Building Debian package..."
cargo deb --verbose "$@"

shopt -s nullglob
debs=(target/debian/*.deb)

if [ "${#debs[@]}" -eq 0 ]; then
    echo "[ERROR] No .deb package generated in target/debian/."
    exit 1
fi

echo "[OK] Generated package(s):"
for deb in "${debs[@]}"; do
    echo " - $deb"
done

#!/usr/bin/env bash
#
# Smoke headless del shell Tauri.
#
# Arranca un compositor wlroots (sway) con backend headless en su propio
# XDG_RUNTIME_DIR —sin salida a pantalla y sin tocar la sesión gráfica de quien
# lo corre—, lanza la app, espera a que mapee su ventana, mide el arranque y la
# memoria del árbol de procesos, y deja una captura PNG para revisar el render.
#
# Uso:
#   desktop/scripts/smoke-headless.sh [binario] [directorio-de-salida]
#
# Pensado para F1 y reutilizable como base del e2e de F3/F4.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="${1:-$RAIZ/target/release/rustdiff}"
SALIDA="${2:-$RAIZ/target/smoke-tauri}"

# ── Comprobaciones previas ───────────────────
for herramienta in sway swaymsg grim; do
    command -v "$herramienta" >/dev/null || {
        echo "falta '$herramienta': no se puede correr el smoke headless" >&2
        exit 1
    }
done

[[ -x "$BIN" ]] || {
    echo "no existe el binario '$BIN': compilalo con 'cargo build --release -p rustdiff-desktop'" >&2
    exit 1
}

mkdir -p "$SALIDA"

# ── Estado y limpieza ────────────────────────
# La limpieza se declara antes de crear nada: si algo falla entre el mktemp y
# el trap, el directorio temporal no queda colgado.
RUNTIME=""
SWAY_PID=""
APP_PID=""
# `setsid` pone a cada proceso al frente de su propio grupo, así la limpieza
# mata también a los hijos de WebKit (WebKitWebProcess y compañía) y no los
# deja huérfanos.
LIDER=""
command -v setsid >/dev/null && LIDER="setsid"

limpiar() {
    local pid
    for pid in "$APP_PID" "$SWAY_PID"; do
        [[ -z "$pid" ]] && continue
        kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    done
    [[ -n "$SWAY_PID" ]] && wait "$SWAY_PID" 2>/dev/null || true
    [[ -n "$RUNTIME" ]] && rm -rf "$RUNTIME"
    return 0
}
trap limpiar EXIT

# ── Aislamiento ──────────────────────────────
# Un XDG_RUNTIME_DIR propio evita chocar con la sesión del usuario (su sway, su
# socket wayland-1 y su SWAYSOCK): el smoke tiene que poder correr con la
# sesión gráfica abierta y sin aparecer en ella.
RUNTIME=$(mktemp -d "${TMPDIR:-/tmp}/rustdiff-smoke-XXXXXX")
chmod 700 "$RUNTIME"
export XDG_RUNTIME_DIR="$RUNTIME"
export WLR_BACKENDS=headless
export WLR_LIBINPUT_NO_DEVICES=1
# Sin esto GTK puede elegir X11 (DISPLAY) o un socket heredado (WAYLAND_SOCKET)
# y la ventana aparece en el escritorio del usuario en vez del compositor
# headless.
unset DISPLAY
unset WAYLAND_DISPLAY
unset WAYLAND_SOCKET
unset SWAYSOCK

# El backend headless de wlroots no tiene GPU ni dmabuf: sin estos dos switches
# WebKitGTK muere con "Error 71 (Error de protocolo) dispatching to Wayland
# display" justo despues de mapear la ventana. No son un parche del codigo de
# la app, son parte del entorno sintetico (en un escritorio real no hacen falta).
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export GDK_BACKEND=wayland

printf 'output HEADLESS-1 resolution 1280x800\n' >"$RUNTIME/sway.conf"
$LIDER sway -c "$RUNTIME/sway.conf" >"$SALIDA/sway.log" 2>&1 &
SWAY_PID=$!

# sway nombra el socket solo (wayland-0/1/2 según lo que esté libre), así que se
# detecta en vez de imponerse.
for _ in $(seq 1 50); do
    SOCKET_WAYLAND=$(find "$RUNTIME" -maxdepth 1 -name 'wayland-*' -type s 2>/dev/null | head -1)
    SOCKET_SWAY=$(find "$RUNTIME" -maxdepth 1 -name 'sway-ipc.*' -type s 2>/dev/null | head -1)
    [[ -n "$SOCKET_WAYLAND" && -n "$SOCKET_SWAY" ]] && break
    sleep 0.1
done

[[ -n "${SOCKET_WAYLAND:-}" && -n "${SOCKET_SWAY:-}" ]] || {
    echo "sway no levantó sus sockets en $RUNTIME" >&2
    tail -20 "$SALIDA/sway.log" >&2
    exit 1
}

export WAYLAND_DISPLAY="$(basename "$SOCKET_WAYLAND")"
export SWAYSOCK="$SOCKET_SWAY"

# ── Arranque medido ──────────────────────────
# El cronómetro mide proceso -> ventana mapeada, no proceso -> proceso vivo.
INICIO_MS=$(date +%s%3N)
$LIDER "$BIN" >"$SALIDA/app.log" 2>&1 &
APP_PID=$!

VENTANA=""
for _ in $(seq 1 200); do
    if ! kill -0 "$APP_PID" 2>/dev/null; then
        echo "la app murió antes de mapear la ventana" >&2
        tail -20 "$SALIDA/app.log" >&2
        exit 1
    fi
    if swaymsg -t get_tree 2>/dev/null | grep -q '"name": "RustDiff"'; then
        VENTANA=1
        break
    fi
    sleep 0.1
done

[[ -n "$VENTANA" ]] || {
    echo "la ventana 'RustDiff' no apareció en 20 s" >&2
    tail -20 "$SALIDA/app.log" >&2
    exit 1
}

ARRANQUE_MS=$(( $(date +%s%3N) - INICIO_MS ))

# El webview necesita un instante más para pintar el primer frame con el diff.
sleep 3
grim "$SALIDA/ventana.png" >/dev/null 2>&1 || echo "aviso: grim no pudo capturar" >&2

# ── Memoria y procesos del árbol ─────────────
# Suma el RSS de la app y de sus descendientes (los procesos WebKit son hijos
# suyos), que es lo que realmente le cuesta al usuario tener la app abierta.
leer_arbol() {
    ps -eo pid=,ppid=,rss= | awk -v raiz="$APP_PID" '
        { pid[NR] = $1; ppid[NR] = $2; rss[NR] = $3 }
        END {
            incluido[raiz] = 1
            for (pasada = 0; pasada < 10; pasada++)
                for (i in pid)
                    if (incluido[ppid[i]]) incluido[pid[i]] = 1
            for (i in pid)
                if (incluido[pid[i]]) { total += rss[i]; n++ }
            printf "%d %d", total + 0, n + 0
        }'
}

read -r RSS_KB PROCESOS <<<"$(leer_arbol)"

echo "arranque_ms=$ARRANQUE_MS"
echo "rss_kb=$RSS_KB"
echo "rss_mb=$(awk -v kb="$RSS_KB" 'BEGIN { printf "%.0f", kb / 1024 }')"
echo "procesos=$PROCESOS"
echo "captura=$SALIDA/ventana.png"

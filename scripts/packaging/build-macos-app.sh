#!/usr/bin/env bash
#
# Empaqueta RustDiff como un bundle macOS autocontenido (RustDiff.app) y,
# opcionalmente, como imagen de disco (.dmg) lista para distribuir.
#
# El bundle incluye el binario, todas las dylibs del stack GTK provenientes
# de Homebrew (reubicadas con install_name_tool), los schemas de GSettings,
# el tema de iconos Adwaita, los loaders de gdk-pixbuf y los language-specs
# propios de la app, de modo que el usuario final NO necesita Homebrew.
#
# Requisitos (solo en la máquina que empaqueta):
#   brew install gtk4 libadwaita gtksourceview5 pkgconf librsvg adwaita-icon-theme
#   cargo build --release   (o pasar --build para que lo haga este script)
#
# Uso:
#   scripts/packaging/build-macos-app.sh [--build] [--dmg] [--out DIR]
#
#   --build   Ejecuta `cargo build --release` antes de empaquetar.
#   --dmg     Genera además dist/RustDiff-<ver>-macos-<arch>.dmg.
#   --out DIR Directorio de salida (por defecto: dist/).
#
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "ERROR: este script solo funciona en macOS." >&2
    exit 1
fi

# ─── Argumentos ──────────────────────────────────────────────────────────
DO_BUILD=0
DO_DMG=0
OUT_DIR="dist"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build) DO_BUILD=1; shift ;;
        --dmg)   DO_DMG=1; shift ;;
        --out)   OUT_DIR="$2"; shift 2 ;;
        *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
    esac
done

# ─── Contexto ────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

BREW_PREFIX="$(brew --prefix)"
ARCH="$(uname -m)"          # arm64 | x86_64
VERSION="$(sed -nE 's/^version *= *"([^"]+)".*/\1/p' Cargo.toml | head -1)"
APP_NAME="RustDiff"
BUNDLE_ID="com.digitalgex.RustDiff"
ICON_SVG="data/icons/com.digitalgex.RustDiff.svg"

STAGING="$OUT_DIR/staging-$ARCH"
APP="$STAGING/$APP_NAME.app"
CONTENTS="$APP/Contents"
MACOS_DIR="$CONTENTS/MacOS"
FRAMEWORKS="$CONTENTS/Frameworks"
RESOURCES="$CONTENTS/Resources"

echo "==> Empaquetando $APP_NAME $VERSION ($ARCH) usando brew en $BREW_PREFIX"

if [[ $DO_BUILD -eq 1 ]]; then
    echo "==> cargo build --release"
    cargo build --release
fi

BINARY="target/release/rustdiff"
if [[ ! -x "$BINARY" ]]; then
    echo "ERROR: no existe $BINARY. Compila primero (cargo build --release) o usa --build." >&2
    exit 1
fi

rm -rf "$STAGING"
mkdir -p "$MACOS_DIR" "$FRAMEWORKS" "$RESOURCES"

# ─── Binario + lanzador ──────────────────────────────────────────────────
# El ejecutable real vive como rustdiff-bin; el CFBundleExecutable es un
# script que configura el entorno GTK relativo al bundle y hace exec.
cp "$BINARY" "$MACOS_DIR/rustdiff-bin"
chmod 755 "$MACOS_DIR/rustdiff-bin"

cat > "$MACOS_DIR/rustdiff" <<'LAUNCHER'
#!/bin/bash
# Lanzador de RustDiff.app: apunta todo el stack GTK a los recursos
# empaquetados dentro del bundle (independiente de Homebrew).
set -u

# Resolver symlinks (p. ej. el `binary` del cask enlaza desde el bin de
# brew) para localizar el bundle real.
SELF="$0"
while [ -L "$SELF" ]; do
    LINK="$(readlink "$SELF")"
    case "$LINK" in
        /*) SELF="$LINK" ;;
        *)  SELF="$(dirname "$SELF")/$LINK" ;;
    esac
done
BUNDLE_CONTENTS="$(cd "$(dirname "$SELF")/.." && pwd)"
RES="$BUNDLE_CONTENTS/Resources"

export XDG_DATA_DIRS="$RES/share"
export GSETTINGS_SCHEMA_DIR="$RES/share/glib-2.0/schemas"
export GDK_PIXBUF_MODULE_DIR="$RES/lib/gdk-pixbuf-2.0/2.10.0/loaders"
export RUSTDIFF_DATA_DIR="$RES/share/rustdiff"

# La caché de loaders de gdk-pixbuf contiene rutas absolutas, así que se
# regenera en la primera ejecución (o si cambió la versión del bundle).
CACHE_DIR="${HOME}/Library/Caches/${RUSTDIFF_BUNDLE_ID:-com.digitalgex.RustDiff}"
CACHE_FILE="$CACHE_DIR/loaders-@VERSION@-@ARCH@.cache"
if [[ ! -f "$CACHE_FILE" ]]; then
    mkdir -p "$CACHE_DIR"
    "$BUNDLE_CONTENTS/MacOS/gdk-pixbuf-query-loaders" > "$CACHE_FILE" 2>/dev/null || rm -f "$CACHE_FILE"
fi
[[ -f "$CACHE_FILE" ]] && export GDK_PIXBUF_MODULE_FILE="$CACHE_FILE"

exec "$BUNDLE_CONTENTS/MacOS/rustdiff-bin" "$@"
LAUNCHER
sed -i '' -e "s/@VERSION@/$VERSION/g" -e "s/@ARCH@/$ARCH/g" "$MACOS_DIR/rustdiff"
chmod 755 "$MACOS_DIR/rustdiff"

# gdk-pixbuf-query-loaders se empaqueta para regenerar la caché en la
# máquina del usuario (ver lanzador). Sus dylibs se reubican igual que las
# del binario principal.
cp "$BREW_PREFIX/bin/gdk-pixbuf-query-loaders" "$MACOS_DIR/gdk-pixbuf-query-loaders"
chmod 755 "$MACOS_DIR/gdk-pixbuf-query-loaders"

# ─── Loaders de gdk-pixbuf (necesarios para SVG/PNG del tema de iconos) ──
PIXBUF_LOADER_DIR="$(echo "$BREW_PREFIX"/lib/gdk-pixbuf-2.0/*/loaders)"
if [[ -d "$PIXBUF_LOADER_DIR" ]]; then
    mkdir -p "$RESOURCES/lib/gdk-pixbuf-2.0/2.10.0/loaders"
    cp "$PIXBUF_LOADER_DIR"/*.so "$RESOURCES/lib/gdk-pixbuf-2.0/2.10.0/loaders/" 2>/dev/null || true
    cp "$PIXBUF_LOADER_DIR"/*.dylib "$RESOURCES/lib/gdk-pixbuf-2.0/2.10.0/loaders/" 2>/dev/null || true
else
    echo "ADVERTENCIA: no se encontraron loaders de gdk-pixbuf en $BREW_PREFIX" >&2
fi

# ─── Recolección recursiva de dylibs ─────────────────────────────────────
# Desde el binario, el query-loaders y los loaders de pixbuf: toda
# dependencia que viva bajo el prefijo de brew se copia a Frameworks/.
# (Recursión en vez de arrays asociativos: el bash 3.2 de macOS no los tiene.)
echo "==> Recolectando dylibs desde $BREW_PREFIX"

list_brew_deps() {
    otool -L "$1" | awk 'NR>1 {print $1}' | grep -E "^$BREW_PREFIX/" || true
}

resolve_real() {
    python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

copy_deps() {
    local dep real base
    while IFS= read -r dep; do
        [[ -z "$dep" ]] && continue
        real="$(resolve_real "$dep")"
        base="$(basename "$real")"
        if [[ ! -f "$FRAMEWORKS/$base" ]]; then
            cp "$real" "$FRAMEWORKS/$base"
            chmod 644 "$FRAMEWORKS/$base"
            copy_deps "$FRAMEWORKS/$base"
        fi
    done < <(list_brew_deps "$1")
}

copy_deps "$MACOS_DIR/rustdiff-bin"
copy_deps "$MACOS_DIR/gdk-pixbuf-query-loaders"
while IFS= read -r -d '' loader; do
    copy_deps "$loader"
done < <(find "$RESOURCES/lib/gdk-pixbuf-2.0" -type f \( -name '*.so' -o -name '*.dylib' \) -print0 2>/dev/null)

echo "    $(ls "$FRAMEWORKS" | wc -l | tr -d ' ') dylibs copiadas"

# ─── Reescritura de install names ────────────────────────────────────────
# Cada Mach-O del bundle pasa a referenciar @executable_path/../Frameworks.
echo "==> Reescribiendo install names"

fix_macho() {
    local file="$1"
    local dep real base
    chmod u+w "$file"
    if [[ "$file" == "$FRAMEWORKS"/* ]]; then
        install_name_tool -id "@executable_path/../Frameworks/$(basename "$file")" "$file" 2>/dev/null
    elif [[ "$file" == "$RESOURCES/lib/"* ]]; then
        # El loader SVG de librsvg es un MH_DYLIB cuyo LC_ID_DYLIB apunta al
        # prefijo de brew; `-change` no reescribe el ID, así que se fija aquí.
        # (El ID de un plugin cargado por dlopen es irrelevante en runtime.)
        # `|| true`: sobre loaders MH_BUNDLE (.so) `-id` falla y no aplica.
        install_name_tool -id "@loader_path/$(basename "$file")" "$file" 2>/dev/null || true
    fi
    while IFS= read -r dep; do
        [[ -z "$dep" ]] && continue
        real="$(resolve_real "$dep")"
        base="$(basename "$real")"
        install_name_tool -change "$dep" "@executable_path/../Frameworks/$base" "$file" 2>/dev/null
    done < <(list_brew_deps "$file")
}

all_machos() {
    echo "$MACOS_DIR/rustdiff-bin"
    echo "$MACOS_DIR/gdk-pixbuf-query-loaders"
    find "$FRAMEWORKS" -type f
    find "$RESOURCES/lib/gdk-pixbuf-2.0" -type f \( -name '*.so' -o -name '*.dylib' \) 2>/dev/null || true
}

while IFS= read -r f; do
    fix_macho "$f"
done < <(all_machos)

# Verificación: ningún Mach-O debe seguir apuntando al prefijo de brew.
LEFTOVERS=0
while IFS= read -r f; do
    if otool -L "$f" | awk 'NR>1 {print $1}' | grep -qE "^$BREW_PREFIX/"; then
        echo "ERROR: $f aún referencia $BREW_PREFIX:" >&2
        otool -L "$f" | grep "$BREW_PREFIX" >&2
        LEFTOVERS=1
    fi
done < <(all_machos)
[[ $LEFTOVERS -eq 0 ]] || exit 1

# ─── Recursos compartidos ────────────────────────────────────────────────
echo "==> Copiando recursos (schemas, iconos, gtksourceview, language-specs)"
mkdir -p "$RESOURCES/share/glib-2.0/schemas" \
         "$RESOURCES/share/icons" \
         "$RESOURCES/share/rustdiff/language-specs"

# GSettings: schemas de gtk4/glib compilados dentro del bundle.
cp "$BREW_PREFIX"/share/glib-2.0/schemas/*.xml "$RESOURCES/share/glib-2.0/schemas/" 2>/dev/null || true
cp "$BREW_PREFIX"/share/glib-2.0/schemas/*.override "$RESOURCES/share/glib-2.0/schemas/" 2>/dev/null || true
glib-compile-schemas "$RESOURCES/share/glib-2.0/schemas"

# Temas de iconos: Adwaita (símbolos de GTK/libadwaita) + hicolor (base).
for theme in Adwaita hicolor; do
    if [[ -d "$BREW_PREFIX/share/icons/$theme" ]]; then
        cp -R "$BREW_PREFIX/share/icons/$theme" "$RESOURCES/share/icons/"
    fi
done
mkdir -p "$RESOURCES/share/icons/hicolor/scalable/apps"
cp "$ICON_SVG" "$RESOURCES/share/icons/hicolor/scalable/apps/"

# Datos de GtkSourceView (estilos + lenguajes estándar).
if [[ -d "$BREW_PREFIX/share/gtksourceview-5" ]]; then
    cp -R "$BREW_PREFIX/share/gtksourceview-5" "$RESOURCES/share/"
fi

# Language-specs propios de RustDiff (el lanzador exporta RUSTDIFF_DATA_DIR).
cp data/language-specs/*.lang "$RESOURCES/share/rustdiff/language-specs/"

# Traducciones de GTK/GLib solo para los idiomas de la app (en/es).
for lang_dir in "$BREW_PREFIX"/share/locale/es*; do
    [[ -d "$lang_dir" ]] || continue
    rel="${lang_dir#"$BREW_PREFIX"/share/locale/}"
    for domain in gtk40 gtk40-properties glib20 libadwaita gtksourceview-5; do
        src="$lang_dir/LC_MESSAGES/$domain.mo"
        if [[ -f "$src" ]]; then
            mkdir -p "$RESOURCES/share/locale/$rel/LC_MESSAGES"
            cp "$src" "$RESOURCES/share/locale/$rel/LC_MESSAGES/"
        fi
    done
done

# ─── Icono .icns ─────────────────────────────────────────────────────────
echo "==> Generando RustDiff.icns"
ICONSET="$OUT_DIR/RustDiff.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
    rsvg-convert -w "$size" -h "$size" "$ICON_SVG" -o "$ICONSET/icon_${size}x${size}.png"
    dbl=$((size * 2))
    rsvg-convert -w "$dbl" -h "$dbl" "$ICON_SVG" -o "$ICONSET/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$RESOURCES/RustDiff.icns"
rm -rf "$ICONSET"

# ─── Info.plist ──────────────────────────────────────────────────────────
cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundlePackageType</key>       <string>APPL</string>
    <key>CFBundleIdentifier</key>        <string>$BUNDLE_ID</string>
    <key>CFBundleName</key>              <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>       <string>$APP_NAME</string>
    <key>CFBundleExecutable</key>        <string>rustdiff</string>
    <key>CFBundleIconFile</key>          <string>RustDiff</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleVersion</key>           <string>$VERSION</string>
    <key>LSMinimumSystemVersion</key>    <string>11.0</string>
    <key>NSHighResolutionCapable</key>   <true/>
    <key>LSApplicationCategoryType</key> <string>public.app-category.developer-tools</string>
    <key>NSHumanReadableCopyright</key>  <string>© Jeremy — GPL-3.0-or-later</string>
</dict>
</plist>
PLIST

# ─── Firma ad-hoc ────────────────────────────────────────────────────────
# Sin cuenta de Apple Developer solo es posible firma ad-hoc: la app corre,
# pero Gatekeeper pedirá aprobación en la primera apertura (clic derecho →
# Abrir, o `xattr -cr /Applications/RustDiff.app`).
echo "==> Firmando (ad-hoc)"
while IFS= read -r -d '' f; do
    codesign --force -s - "$f"
done < <(find "$FRAMEWORKS" "$RESOURCES/lib" -type f \( -name '*.dylib' -o -name '*.so' \) -print0 2>/dev/null)
codesign --force -s - "$MACOS_DIR/gdk-pixbuf-query-loaders"
codesign --force -s - "$MACOS_DIR/rustdiff-bin"
codesign --force -s - "$APP"

echo "==> Bundle listo: $APP"
du -sh "$APP"

# ─── DMG ─────────────────────────────────────────────────────────────────
if [[ $DO_DMG -eq 1 ]]; then
    DMG="$OUT_DIR/RustDiff-$VERSION-macos-$ARCH.dmg"
    echo "==> Creando $DMG"
    ln -sfn /Applications "$STAGING/Applications"
    rm -f "$DMG"
    hdiutil create -volname "$APP_NAME $VERSION" \
                   -srcfolder "$STAGING" \
                   -ov -format UDZO "$DMG"
    echo "==> DMG listo:"
    ls -lh "$DMG"
    shasum -a 256 "$DMG"
fi

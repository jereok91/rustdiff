# RustDiff

[![Crates.io](https://img.shields.io/crates/v/rustdiff)](https://crates.io/crates/rustdiff)
[![Licencia: GPL-3.0-or-later](https://img.shields.io/crates/l/rustdiff)](LICENSE)

Comparador semantico de JSON y XML con interfaz grafica nativa en GTK4 + Libadwaita.

Idioma: [English](README.md) | **Espanol**

## Caracteristicas

- Diff semantico para JSON y XML (objetos, arrays, nodos XML, atributos y texto)
- Editores lado a lado con resaltado de sintaxis
- Comparacion automatica al escribir (con debounce) y comparacion manual
- Tabla de diferencias con filtros y navegacion por click
- Exportacion a `.txt` y `.html` con estilos
- Historial de sesiones en SQLite

## Instalacion

### 1) Flatpak + Flathub (recomendado para escritorio)

Instalar Flatpak:

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

Agregar Flathub:

```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

Instalar y ejecutar RustDiff desde Flathub:

```bash
flatpak install flathub com.digitalgex.RustDiff
flatpak run com.digitalgex.RustDiff
```

Actualizar o desinstalar:

```bash
flatpak update com.digitalgex.RustDiff
flatpak uninstall com.digitalgex.RustDiff
```

Notas:

- Si la tienda de software no muestra Flathub de inmediato, cierra sesion e inicia de nuevo.
- Si `com.digitalgex.RustDiff` aun no aparece, puedes compilar el Flatpak localmente con `com.digitalgex.RustDiff.yaml`.

### 2) Instalador automatico (Cargo + dependencias del sistema)

```bash
curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash
```

### 3) Instalacion con Cargo (crates.io)

```bash
cargo install rustdiff
```

## Requisitos del sistema (build local/Cargo)

### Rust

Rust 1.85+ (edition 2024):

```bash
rustup update stable
rustc --version
```

### Librerias nativas

RustDiff usa librerias GTK nativas. Necesitas toolchain C (`gcc/clang`, `make`, `pkg-config`) y paquetes de desarrollo GTK.

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

Verificar dependencias:

```bash
pkg-config --exists gtk4 && echo "gtk4: OK" || echo "gtk4: FALTA"
pkg-config --exists libadwaita-1 && echo "libadwaita: OK" || echo "libadwaita: FALTA"
pkg-config --exists gtksourceview-5 && echo "gtksourceview5: OK" || echo "gtksourceview5: FALTA"
```

## Compilar y ejecutar

```bash
# Desarrollo
cargo run

# Abrir con dos archivos
cargo run -- izq.json der.json

# Build release optimizado
cargo build --release
```

Binario generado:

```text
target/release/rustdiff
```

Instalar desde el checkout actual:

```bash
cargo install --path .
```

## Uso

```bash
# Abrir ventana vacia
rustdiff

# Abrir dos archivos JSON
rustdiff config_viejo.json config_nuevo.json

# Abrir dos archivos XML
rustdiff esquema_v1.xml esquema_v2.xml
```

## Atajos de teclado

| Atajo | Accion |
|---|---|
| `Ctrl+O` | Abrir archivo en panel izquierdo |
| `Ctrl+Shift+O` | Abrir archivo en panel derecho |
| `Ctrl+Enter` | Forzar comparacion |
| `Ctrl+S` | Guardar sesion en historial |
| `Ctrl+E` | Exportar resultado a `.txt` |
| `Ctrl+Shift+F` | Formatear ambos paneles |
| `Ctrl+H` | Mostrar/ocultar historial |

## Datos, configuracion y salidas

- Base de datos de historial: `~/.local/share/rustdiff/history.db`
- Configuracion de UI: `~/.config/rustdiff/settings.json`
- Formatos de exportacion: texto (`.txt`) y HTML (`.html`)

## Tests

```bash
# Suite completa
cargo test

# Tests de integracion
cargo test --test parser_tests
cargo test --test diff_engine_tests
```

## Documentacion de Flathub y empaquetado

- Manifest Flatpak local: `com.digitalgex.RustDiff.yaml`
- Archivos para Flathub: `flathub/com.digitalgex.RustDiff.yaml`, `flathub/cargo-sources.json`
- Flujo de envio a Flathub: `flathub/README.md`
- Requisitos de screenshots (AppStream/Flathub): `data/screenshots/README.md`

Referencias externas:

- Guia de setup Flathub: https://flathub.org/setup
- Documentacion Flatpak: https://docs.flatpak.org/

## Licencia

GPL-3.0-or-later

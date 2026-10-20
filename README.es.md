# RustDiff

[![Licencia: GPL-3.0-or-later](https://img.shields.io/badge/licencia-GPL--3.0--or--later-blue)](LICENSE)

Comparador semantico de JSON, XML y SQL para escritorio. Compara la
*estructura* de los documentos — claves, indices de arrays, nodos y atributos
XML, sentencias SQL — y no lineas de texto. El motor de diff esta escrito en
Rust; la app es un shell [Tauri v2](https://v2.tauri.app/) con interfaz React.

**1.0.0 es la primera version estable**: una reescritura completa de la
interfaz sobre un stack moderno, encima del mismo motor de diff, historial y
preferencias de la 0.4.0. Ver [las notas de la 1.0.0](docs/RELEASE_NOTES_1.0.0.md).

Idioma: [English](README.md) | **Español**

## Construido con

- Shell **Tauri v2** en Rust, sobre el WebView del sistema (WebKitGTK 4.1 en Linux, WKWebView en macOS)
- Frontend **React 19 + TypeScript**, compilado con Vite
- **Tailwind CSS v4** y componentes **shadcn/ui** sobre primitivas **Radix**
- Editores **CodeMirror 6**, fuentes **Geist** y **Geist Mono** (incluidas en la app, nunca se descargan de la red)
- Un **sistema de diseño en OKLCH** con temas claro y oscuro y **contraste WCAG AA verificado por tests** ([`docs/design-system.md`](docs/design-system.md))
- **IPC tipado generado con tauri-specta**: la interfaz solo llama comandos Rust; nunca toca el sistema de archivos
- **i18next** para la interfaz, en ingles y español

## Caracteristicas

- Diff semantico para JSON, XML y SQL (objetos, arrays, nodos XML, atributos, texto y sentencias SQL), con comparacion linea por linea para texto plano
- Editores CodeMirror lado a lado con resaltado de sintaxis, resaltado del diff a nivel de caracter y formateo (`Ctrl+Shift+F`)
- Busqueda en los editores (`Ctrl+F`) con navegacion siguiente/anterior y wrap-around
- Comparacion automatica al escribir (con debounce) y comparacion manual (`Ctrl+Enter`)
- Tabla de diferencias con filtros por tipo y navegacion por click, redimensionable y plegable con `Ctrl+D`
- Vista de grafo (`Ctrl+G`): el documento izquierdo como grafo de nodos interactivo dibujado en un canvas sobre un layout calculado en Rust (desplazar, zoom, ajustar, buscar e inspeccionar nodos), estilo JSON Crack
- Temas claro y oscuro, oscuro por defecto (o seguir al sistema)
- Tamaño del texto de la interfaz del 60 % al 200 % (`Ctrl++`, `Ctrl+-`, `Ctrl+0`), recordado entre sesiones
- Interfaz en ingles y español, con cambio de idioma en vivo sin reiniciar
- Atajos de teclado para cada accion principal, listados en la app con `Ctrl+?`
- Exportacion a `.txt` y `.html` con estilos
- Historial de sesiones en SQLite (paginado, con busqueda, borrado por entrada o completo)

## Capturas de pantalla

![Vista principal - Comparando documentos JSON](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/main.png)

![Tabla de diferencias con filtros](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/diff-table.png)

![Panel lateral de historial](https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/history.png)

## Instalacion

| Canal | Plataformas | Actualizaciones |
| --- | --- | --- |
| [Flatpak (Flathub)](#1-flatpak--flathub-recomendado-en-linux) | cualquier distro Linux | `flatpak update` |
| [Paquete Debian / repositorio APT](#2-paquete-debian-deb-y-repositorio-apt) | Ubuntu 24.04+, Debian 13+ (amd64, arm64) | `apt upgrade` |
| [Instalador de un comando](#3-instalador-de-un-comando) | Debian/Ubuntu (instala el `.deb`), otras distros (compila desde fuente) | volver a correrlo |
| [DMG de macOS / cask de Homebrew](#4-macos) | macOS (Apple Silicon, Intel) | `brew upgrade --cask` |
| [Desde el codigo fuente](#compilar-desde-el-codigo-fuente) | Linux, macOS | `git pull` + recompilar |

RustDiff ya no se publica en crates.io (`cargo install rustdiff` instala la
ultima version GTK, 0.4.x). Ver [las notas de la 1.0.0](docs/RELEASE_NOTES_1.0.0.md).

### 1) Flatpak + Flathub (recomendado en Linux)

Instalar Flatpak y agregar Flathub:

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

Instalar, ejecutar, actualizar, desinstalar:

```bash
flatpak install flathub com.digitalgex.RustDiff
flatpak run com.digitalgex.RustDiff
flatpak update com.digitalgex.RustDiff
flatpak uninstall com.digitalgex.RustDiff
```

El Flatpak trae su propio runtime de GNOME (con WebKitGTK), asi que funciona
sin importar las versiones de librerias del sistema. Para compilarlo localmente
desde este checkout, ver `com.digitalgex.RustDiff.yaml`.

### 2) Paquete Debian (`.deb`) y repositorio APT

Desde un `.deb` descargado ([GitHub Releases](https://github.com/jereok91/rustdiff/releases)):

```bash
sudo apt install ./rustdiff_*.deb
```

Desde el repositorio APT firmado publicado en GitHub Pages:

```bash
curl -fsSL https://jereok91.github.io/rustdiff/KEY.gpg | sudo tee /usr/share/keyrings/rustdiff-archive-keyring.gpg >/dev/null
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/rustdiff-archive-keyring.gpg] https://jereok91.github.io/rustdiff stable main" | sudo tee /etc/apt/sources.list.d/rustdiff.list >/dev/null
sudo apt update
sudo apt install rustdiff
```

El paquete se llama `rustdiff`, instala `/usr/bin/rustdiff` y depende de
`libwebkit2gtk-4.1-0` y `libgtk-3-0`. Actualizar desde 0.4.x es un
`apt upgrade` normal.

> **Version minima de SO:** el `.deb` se compila en el Ubuntu 24.04 del runner
> de CI, asi que necesita la glibc de **Ubuntu 24.04+ o Debian 13 (trixie)+**.
> En versiones anteriores usa el [Flatpak](#1-flatpak--flathub-recomendado-en-linux)
> o [compila desde el codigo fuente](#compilar-desde-el-codigo-fuente).

Eliminar el paquete y el repositorio:

```bash
sudo apt remove rustdiff
sudo rm -f /etc/apt/sources.list.d/rustdiff.list /usr/share/keyrings/rustdiff-archive-keyring.gpg
sudo apt update
```

### 3) Instalador de un comando

```bash
curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash
```

- En Debian/Ubuntu baja el `.deb` del ultimo release y lo instala con `apt`.
- En otras distros (o con `RUSTDIFF_FROM_SOURCE=1`) instala los paquetes de
  desarrollo de WebKitGTK, compila la app con pnpm + cargo y la instala por
  usuario: `~/.local/bin/rustdiff` mas la entrada de menu, el metainfo AppStream
  y el icono en `~/.local/share`. Necesita Rust, Node.js y pnpm (ver abajo).

### 4) macOS

Cada release publica un `.dmg` por arquitectura (Apple Silicon `arm64` e Intel
`x86_64`). La app usa el WebKit del sistema, asi que no tiene dependencias extra.

```bash
brew install --cask jereok91/rustdiff/rustdiff-app
brew upgrade --cask rustdiff-app
brew uninstall --cask rustdiff-app   # con --zap borra tambien preferencias e historial
```

O descarga `RustDiff-<version>-macos-<arch>.dmg` desde
[Releases](https://github.com/jereok91/rustdiff/releases) y arrastra
`RustDiff.app` a `Aplicaciones`.

> La app esta firmada ad-hoc (sin certificado de Apple Developer). Si macOS
> bloquea el primer arranque: click derecho sobre la app → **Abrir**, o
> `xattr -cr /Applications/RustDiff.app`.

La **formula de codigo fuente** de Homebrew (`brew install jereok91/rustdiff/rustdiff`)
se retiro: compilaba la app GTK con `cargo install`, que ya no existe. Si la
usabas, cambia con `brew uninstall rustdiff && brew install --cask jereok91/rustdiff/rustdiff-app`.

## Compilar desde el codigo fuente

### Requisitos

- Rust 1.85+ (edition 2024): `rustup update stable`
- Node.js 20+ y pnpm 10 (`npm install -g pnpm` o `corepack enable pnpm`)
- En Linux, WebKitGTK 4.1 y un toolchain C:

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

En macOS alcanza con las Xcode Command Line Tools (`xcode-select --install`).

Verificar WebKitGTK en Linux:

```bash
pkg-config --modversion webkit2gtk-4.1
```

### Compilar y ejecutar

```bash
cd desktop
pnpm install
pnpm tauri dev                 # la app con recarga en caliente
pnpm tauri build               # binario release + .deb (Linux) / .app + .dmg (macOS)
pnpm tauri build --no-bundle   # solo el binario release
```

El binario queda en `target/release/rustdiff` (en la raiz del repositorio: el
workspace de Cargo comparte un solo `target/`), los paquetes en
`target/release/bundle/`.

## Uso

```bash
rustdiff                                  # ventana vacia
rustdiff config_vieja.json config_nueva.json
rustdiff schema_v1.xml schema_v2.xml
```

## Atajos de teclado

| Atajo          | Accion                           |
| -------------- | -------------------------------- |
| `Ctrl+O`       | Abrir archivo en panel izquierdo |
| `Ctrl+Shift+O` | Abrir archivo en panel derecho   |
| `Ctrl+Enter`   | Comparar ahora                   |
| `Ctrl+Shift+F` | Formatear ambos paneles          |
| `Ctrl+F`       | Buscar en los editores           |
| `Ctrl+G`       | Mostrar/ocultar vista de grafo   |
| `Ctrl+D`       | Mostrar/ocultar panel de diferencias |
| `Ctrl+S`       | Guardar sesion en historial      |
| `Ctrl+H`       | Mostrar/ocultar historial        |
| `Ctrl+E`       | Exportar resultado a `.txt`      |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Agrandar / achicar / restablecer el texto de la interfaz |
| `Ctrl+?`       | Ver todos los atajos             |

## Datos, configuracion y salidas

- Base de datos de historial: `~/.local/share/rustdiff/history.db` (macOS: `~/Library/Application Support/rustdiff/`)
- Configuracion de UI: `~/.config/rustdiff/settings.json` (macOS: `~/Library/Application Support/rustdiff/`)
- El Flatpak guarda ambos en `~/.var/app/com.digitalgex.RustDiff/`
- Formatos de exportacion: texto (`.txt`) y HTML (`.html`)

## Tests

```bash
# Solo nucleo y persistencia (no necesita WebKit)
cargo test

# Todo, incluido el shell Tauri (en Linux necesita los paquetes de desarrollo de WebKitGTK)
cargo test --workspace --all-targets

# Una suite de integracion del nucleo
cargo test -p rustdiff-core --test parser_tests

# Frontend (Vitest)
cd desktop && pnpm test
```

## Documentacion de empaquetado

- Checklist de release y que publica un tag `v*`: `docs/RELEASING.md`
- Empaquetado Debian/APT y configuracion de GitHub Actions: `docs/DEBIAN_APT.md`
- Manifest Flatpak para builds locales: `com.digitalgex.RustDiff.yaml`
- Archivos y flujo de envio a Flathub: `flathub/README.md`
- Requisitos de screenshots (AppStream/Flathub): `data/screenshots/README.md`
- Sistema de diseño de la interfaz: `docs/design-system.md`
- Notas de la version: `docs/RELEASE_NOTES_1.0.0.md`

## Contribuir

Los reportes de bugs, las ideas y los pull requests son bienvenidos. Empeza por
un issue, ramifica desde `canary` y abri el pull request contra `canary`; los
checks obligatorios y las convenciones estan en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

GPL-3.0-or-later

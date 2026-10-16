# Flathub submission — `com.digitalgex.RustDiff`

Este directorio contiene **exactamente** los archivos que viven en el repo de
Flathub `flathub/com.digitalgex.RustDiff` (o que se copian al fork de
`flathub/flathub` para el envio inicial).

```
flathub/
├── com.digitalgex.RustDiff.yaml   # Manifest Flatpak con source pineada a tag+commit
└── cargo-sources.json             # Vendoring offline de las crates (generado)
```

## Como se compila desde 1.0.0 (app Tauri)

- **Runtime**: `org.gnome.Platform//50` + `org.gnome.Sdk//50`. Los dos ya traen
  WebKitGTK 4.1 (libs en el runtime, headers y `.pc` en el SDK), asi que el
  manifest no compila WebKit ni agrega modulos.
- **Rust**: extension `org.freedesktop.Sdk.Extension.rust-stable`;
  `cargo --offline build --release --features custom-protocol -p rustdiff-desktop`
  con las crates de `cargo-sources.json`.
- **Frontend**: el manifest **no** compila el frontend React adentro del
  sandbox. Usa `rustdiff-frontend-<version>.tar.gz`, el `desktop/dist` que
  `release-flathub.yml` compila con `pnpm build` desde el mismo tag y adjunta
  al release de GitHub; el workflow escribe su `url` y `sha256` en el manifest.
- **Permisos**: `--share=ipc`, `--socket=wayland`, `--socket=fallback-x11`,
  `--device=dri`. Sin `--filesystem`: el dialogo de archivos es
  `GtkFileChooserNative` y pasa por el portal de documentos.

### Por que el frontend llega precompilado

La forma canonica de compilar JS offline en Flathub es la extension
`org.freedesktop.Sdk.Extension.node22` mas un `node-sources.json` generado con
[`flatpak-node-generator`](https://github.com/flatpak/flatpak-builder-tools/tree/master/node).
El frontend usa **pnpm** (`desktop/pnpm-lock.yaml`) y esa ruta no esta
verificada para lockfiles de pnpm: el generador no estaba disponible en la
maquina donde se escribio este manifest y su soporte documentado es npm/yarn.

Si los revisores de Flathub piden compilar el frontend adentro del sandbox:

1. Generar las fuentes offline (con un generador que soporte el lockfile):

   ```bash
   pipx install "git+https://github.com/flatpak/flatpak-builder-tools.git#subdirectory=node"
   flatpak-node-generator --help                 # confirmar que lista "pnpm"
   flatpak-node-generator pnpm desktop/pnpm-lock.yaml -o node-sources.json
   ```

   Si no lista `pnpm`, la alternativa es mantener un `desktop/package-lock.json`
   (npm) en paralelo y usar `flatpak-node-generator npm desktop/package-lock.json -o node-sources.json`.
2. En el manifest: agregar `org.freedesktop.Sdk.Extension.node22` a
   `sdk-extensions`, `/usr/lib/sdk/node22/bin` a `append-path`, reemplazar la
   fuente `rustdiff-frontend-*.tar.gz` por `node-sources.json` y compilar el
   frontend antes de cargo (`pnpm install --offline --frozen-lockfile && pnpm build`
   en `desktop/`).

## Envio inicial

### 1. Fork del repo Flathub

En GitHub: https://github.com/flathub/flathub → **Fork** a `jereok91/flathub`.

### 2. Clonar el fork y crear la rama

```bash
git clone git@github.com:jereok91/flathub.git
cd flathub
git checkout -b com.digitalgex.RustDiff
```

### 3. Completar y copiar los archivos de este directorio

Despues de pushear el tag `vX.Y.Z` (y de que `release-flathub.yml` adjunte el
tarball del frontend), completar en `com.digitalgex.RustDiff.yaml`:

- `tag:` con `vX.Y.Z` y `commit:` con `git rev-parse vX.Y.Z`
- `url:`/`sha256:` del tarball `rustdiff-frontend-X.Y.Z.tar.gz`

```bash
cp flathub/com.digitalgex.RustDiff.yaml  ~/wherever/flathub/
cp flathub/cargo-sources.json            ~/wherever/flathub/
```

### 4. Commit, push y PR

```bash
cd ~/wherever/flathub
git add com.digitalgex.RustDiff.yaml cargo-sources.json
git commit -m "Add com.digitalgex.RustDiff"
git push origin com.digitalgex.RustDiff
```

PR desde `jereok91/flathub:com.digitalgex.RustDiff` hacia
`flathub/flathub:new-pr`, titulo `Add com.digitalgex.RustDiff`.

### 5. Verificacion de dominio (si Flathub lo pide)

El App ID `com.digitalgex.RustDiff` puede requerir prueba de propiedad de
`digitalgex.com`: registro DNS `TXT` con el valor que indique el revisor, o
confirmacion por email del dominio.

## Releases futuras

`release-flathub.yml` lo hace solo en cada tag `v*`: compila y adjunta el
tarball del frontend, regenera `cargo-sources.json` y abre un PR en
`flathub/com.digitalgex.RustDiff` con `tag`, `commit`, `url` y `sha256`
actualizados. Si el repo upstream todavia tiene el manifest GTK (sin la fuente
`rustdiff-frontend-*`), el workflow lo reemplaza por el de este directorio.

A mano (si el workflow falla):

```bash
.flatpak-tools/venv/bin/python3 \
    .flatpak-tools/flatpak-cargo-generator.py Cargo.lock \
    -o flathub/cargo-sources.json
```

y actualizar `tag`/`commit`/`url`/`sha256` como en el paso 3.

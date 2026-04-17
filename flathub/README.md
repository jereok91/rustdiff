# Flathub submission — `com.digitalgex.RustDiff`

Este directorio contiene **exactamente** los archivos que deben copiarse al
fork de `github.com/flathub/flathub` para enviar la app.

```
flathub/
├── com.digitalgex.RustDiff.yaml   # Manifest Flatpak con source pineada a tag+commit
└── cargo-sources.json             # Vendoring offline de las crates (generado)
```

## Paso a paso

### 1. Fork del repo Flathub

En GitHub: https://github.com/flathub/flathub → botón **Fork** a tu cuenta
`jereok91/flathub`.

### 2. Clonar el fork y crear la rama

```bash
git clone git@github.com:jereok91/flathub.git
cd flathub
git checkout -b com.digitalgex.RustDiff
```

### 3. Copiar los archivos de este directorio

Desde la raíz del repo rustdiff:

```bash
cp flathub/com.digitalgex.RustDiff.yaml  ~/wherever/flathub/
cp flathub/cargo-sources.json            ~/wherever/flathub/
```

### 4. Commit y push

```bash
cd ~/wherever/flathub
git add com.digitalgex.RustDiff.yaml cargo-sources.json
git commit -m "Add com.digitalgex.RustDiff"
git push origin com.digitalgex.RustDiff
```

### 5. Abrir el PR

Desde tu fork (`jereok91/flathub`), abre un PR:

- **Base branch**: `flathub/flathub:new-pr`
- **Head branch**: `jereok91/flathub:com.digitalgex.RustDiff`
- **Título**: `Add com.digitalgex.RustDiff`
- **Descripción**: breve explicación de la app y link al repo upstream.

### 6. Verificación de dominio (si Flathub lo pide)

Como el App ID es `com.digitalgex.RustDiff`, Flathub puede pedir prueba de
propiedad del dominio `digitalgex.com`. Dos opciones:

- **DNS TXT**: registro `TXT` en `digitalgex.com` con el valor que indique el
  revisor (típicamente un hash).
- **Email del dominio**: confirmación vía `hostmaster@digitalgex.com` o
  similar.

## Releases futuras

Cuando bumpeés la versión en el repo rustdiff:

1. Tagger la nueva versión (`git tag vX.Y.Z && git push origin vX.Y.Z`).
2. Obtener el commit: `git rev-parse vX.Y.Z`.
3. En este directorio, actualizar en `com.digitalgex.RustDiff.yaml`:
   - `tag:` con `vX.Y.Z`
   - `commit:` con el hash de 40 chars
4. Regenerar `cargo-sources.json` si `Cargo.lock` cambió:
   ```bash
   .flatpak-tools/venv/bin/python3 \
       .flatpak-tools/flatpak-cargo-generator.py Cargo.lock \
       -o flathub/cargo-sources.json
   ```
5. En tu clone del fork `jereok91/flathub`, cambiate a la rama
   `com.digitalgex.RustDiff` de `flathub/com.digitalgex.RustDiff` (que se
   creará post-merge del PR inicial), copia los dos archivos y abre un PR.

Opcional: automatizar con **`flatpak-external-data-checker`** para que abra
PRs en el repo de Flathub cuando detecte un nuevo tag aquí.

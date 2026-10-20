# Cómo contribuir a RustDiff

## English summary (the rules that matter)

- **License:** contributions are accepted under **GPL-3.0-or-later**, the license of the project. No CLA.
- **Branches:** branch from **`canary`** and open your pull request **against `canary`**, never against `main`. `main` only holds released code; the maintainer promotes `canary` to `main` and creates the tag.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (`feat:`, `fix:`, `docs:`, `ci:`, `chore(release):`…), one logical change per commit.
- **Tests are mandatory:** the pull request author must run the checks below locally and say so.
- **All checks are required:** `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --all-targets`, `pnpm test` + `pnpm build` in `desktop/`, the headless smoke, and the AppStream/desktop-entry validation.
- **One pull request, one problem.** Unfocused changes (formatting sweeps, unused-variable cleanups) are rejected.
- **Large features need an issue first** and an agreed design before any code is written.
- **Version, tags, packaging and releases belong to the maintainer.** Don't touch version numbers, `Cargo.lock` versions, tags, the Flatpak manifests or the cask.
- **Docs travel with the code:** `README.md` + `README.es.md`, and anything in `docs/`, in the same pull request.
- **AI-assisted contributions are welcome** as long as the author has read, understood and tested the code. You are responsible for every line you send.

---

## Gracias por querer aportar

RustDiff es un comparador semántico de JSON, XML, SQL y texto plano para escritorio: un motor de diff en Rust (`crates/rustdiff-core`), persistencia e historial en SQLite (`crates/rustdiff-persist`) y una app de escritorio Tauri v2 con React, Vite, TypeScript y Tailwind (`desktop/`).

Antes de escribir código, **abrí un issue** y contá qué querés hacer y por qué. Para cambios grandes (una función nueva, un cambio de contrato, un rediseño de UI) no se acepta un PR sin issue: primero acordamos el diseño, así no trabajás dos veces.

## Flujo de aportes

1. Hacé fork (o rama, si sos colaborador) **desde `canary`**.
2. Creá una rama por tema: `feat/nombre-corto`, `fix/nombre-corto`, `docs/nombre-corto`.
3. Escribí el cambio con sus tests y su documentación.
4. Corré **todos** los checks de la sección siguiente y verificá a mano lo que tocaste.
5. Abrí el PR **contra `canary`** con una descripción clara, y mencioná el issue si existe (`Fixes #123`).
6. Review del mantenedor y squash merge. `canary` se promueve a `main` y se taggea cuando hay release (ver [docs/RELEASING.md](docs/RELEASING.md)).

`main` es lo publicado: **nunca** mandes un PR a `main` ni hagas merge de `main` en tu rama.

## Requisitos y cómo correr el proyecto

- Rust (la versión la fija `rust-version` en `Cargo.toml`; edición 2024).
- Node + **pnpm** (el repositorio usa `desktop/pnpm-lock.yaml`).
- En Linux, para compilar la app de escritorio: `webkit2gtk-4.1`, `gtk3` y `libsoup-3.0` de desarrollo. El núcleo (`cargo test` en la raíz) no los necesita.

```bash
git clone https://github.com/<tu-usuario>/rustdiff.git
cd rustdiff

# Núcleo y persistencia (sin librerías de UI del sistema)
cargo build

# Frontend + app de escritorio
cd desktop
pnpm install
pnpm tauri dev        # la app completa, con hot reload
```

Comandos útiles:

```bash
cargo test                                   # core + persist
cargo test -p rustdiff-core --test parser_tests
cargo test json_valor_cambiado               # un test por nombre
cd desktop && pnpm dev                       # Vite solo, en el navegador
cd desktop && pnpm bindings                  # regenera desktop/src/bindings.ts
```

> Si tocás un comando IPC del shell, regenerá los bindings con `pnpm bindings` y commiteá el archivo: hay un test de drift que falla si no coinciden.

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). El mensaje va en inglés; los ejemplos reales del repo marcan el estilo:

```
feat(graph): resaltar el nodo buscado
fix(flathub): stop installing the scalable SVG icon
ci(macos): build the app bundle and create the DMG with hdiutil
docs(readme): document the Flatpak build
chore(release): 1.0.3
refactor(parser): split format detection from parsing
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Scope: el área (`core`, `persist`, `parser`, `graph`, `export`, `desktop`, `flathub`, `macos`, `readme`…).

Un commit = un cambio lógico. No mezcles un refactor con una feature ni con un reformateo.

## Antes de abrir el PR: los checks son obligatorios

Esto es lo que corre el CI y lo que tiene que pasar antes de mandar el PR; si falla acá, falla allá. **El PR tiene que estar probado por quien lo manda**; un PR sin probar se rechaza. Además del CI, antes de abrir el PR corré el smoke headless y las validaciones de empaquetado que están al final del bloque.

```bash
# Rust
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets

# Frontend (tsc --noEmit + vite build + Vitest)
cd desktop && pnpm install && pnpm test && pnpm build && cd ..

# La app arranca y su ventana se anuncia con el app_id correcto
desktop/scripts/smoke-headless.sh target/release/rustdiff
# necesita sway, swaymsg y grim; usa su propio compositor headless

# Empaquetado (si tocaste el .desktop, el metainfo o los iconos)
appstreamcli validate data/com.digitalgex.RustDiff.metainfo.xml
desktop-file-validate data/com.digitalgex.RustDiff.desktop
```

Además, probá a mano lo que cambiaste en la app (`pnpm tauri dev`), con documentos reales de los cuatro formatos. Si tocás UI, agregá una captura o un video corto al PR.

## Reglas del PR

- **Un PR, un problema.** Si aparece otra cosa, va en otro PR.
- **Tests:** todo cambio de comportamiento lleva su test. Bug fix = test que falla antes y pasa después.
- **Documentación:** actualizá `README.md` y `README.es.md` si cambia lo que el usuario ve, y lo que corresponda en `docs/`.
- **Sin ruido:** no mandes reformateos, imports sin usar ni cambios de estilo sueltos, salvo que sean el tema del PR.
- **Capturas** para cualquier cambio visual, en tema claro y oscuro si aplica.
- **Referenciá el issue** (`Fixes #123`) cuando cierra uno.
- **No toques** la versión (`Cargo.toml`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`), el `Cargo.lock` de los crates del workspace, los tags, los manifiestos de Flatpak, el cask de Homebrew ni `scripts/packaging/`: eso es del mantenedor en el release.

## Reglas que el código ya hace cumplir

Estas no son preferencias: hay tests que fallan si las rompés.

- **`rustdiff-core` no depende de UI**: nada de `gtk4`, `libadwaita`, `sourceview5`, `cairo` ni `tauri` (`crates/rustdiff-core/tests/no_ui_dependencies.rs`).
- **El frontend no toca el filesystem ni parsea documentos** (S8): todo pasa por comandos IPC tipados y las rutas llegan del diálogo nativo.
- **Los colores salen de tokens**: `desktop/src/styles/tokens.css` es la única fuente; nunca valores de color crudos en componentes.
- **Los textos de UI van en los dos idiomas**: toda clave nueva en `desktop/src/locales/en.json` y `es.json`.
- **Los archivos instalados se declaran en cuatro lugares**: `bundle.linux.deb.files`/`bundle.icon` en `tauri.conf.json`, los dos manifiestos de Flatpak, e `install.sh`.
- **Comentarios del código en el idioma del archivo** (la mayoría están en español); los mensajes de cara al usuario y la documentación pública van en inglés con versión en español cuando corresponde.

## Licencia

RustDiff se publica bajo **GPL-3.0-or-later**. Al mandar un aporte aceptás que se distribuya bajo esa misma licencia y confirmás que el código es tuyo o que tenés derecho a aportarlo. No hay CLA ni sign-off obligatorio.

## Seguridad

No abras un issue público para una vulnerabilidad. Escribile al mantenedor por un canal privado (el mail de su perfil de GitHub) con los pasos para reproducirla y esperá la corrección antes de publicar nada.

## Sobre el flujo interno del mantenedor

El mantenedor trabaja con ODD (Organic Driven Development): documentos de feature en `odd/tasks/`, commits por unidad y una revisión nativa antes de publicar. **No es un requisito para aportes**: para PRs externos alcanza con Conventional Commits, tests y documentación.

Gracias por tomarte el tiempo. Un PR chico, probado y bien contado vale más que uno grande y a medias.

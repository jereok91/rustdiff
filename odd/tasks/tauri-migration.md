# Migración de RustDiff a Tauri v2 + React + shadcn/ui

Feature rama: `feat/tauri-migration` (desde `main` @ `35f2266`, v0.4.0).
Objetivo: portar la app de GTK4/Libadwaita a Tauri v2 con frontend React, conservando
la semántica del diff y recién después rediseñar la UI/UX con shadcn/ui.

## Specs

**S1 — El plan se basa en la realidad medida del proyecto, no en supuestos.**
Pedido literal: *"haz el plan datallabasado en la realidad actual del proyecti"* y
*"revisa el proyecto y haz un plan de migracion de este a tauri"*.
Inventario de referencia (medido, `wc -l`): 7.954 LOC en `src/`; núcleo sin GTK
3.677 LOC (`diff_engine` 1.301, `parser` 795, `graph` 580, `storage` 595, `export` 262,
`settings` 144) y capa GTK 4.136 LOC. Baseline verificado: 150 tests verdes
(109 unitarios + 41 de integración) en `main` @ `35f2266`.

**S2 — El frontend se construye en React con shadcn/ui.**
Pedido literal: *"donde el front se construya en react usa shadcn/ui"*.

**S3 — El sistema de diseño se cierra porque el look actual es insuficiente.**
Pedido literal: *"ayudame cerrando el sistema de diseÃ±o ya existe un look pero deja mucho
que desear"*. Hoy hay tres CSS sueltos en strings de Rust: `diff_css()` (15 líneas),
`graph_css()` (5 líneas), `zoom_css()`, más `HTML_STYLE` en `export.rs`.

**S4 — Orden obligatorio: primero portar a Tauri, después mejorar UI/UX.**
Pedido literal: *"ayudeme primero a portar el propyecto a tauri y luego ver si mejoras
ui/ux"*. Ninguna tarea de rediseño puede adelantarse a la paridad funcional.

**S5 — Arrancar con la migración y consultar las decisiones abiertas a medida que
bloqueen trabajo.**
Pedido literal: *"arranca y vas preguntando por los D"*. Las decisiones D1–D7 están
listadas en la sección Decisiones; ninguna de las de F0 depende de ellas.

**S6 — F0 no cambia comportamiento.**
Gate de F0: 150 tests verdes, `cargo clippy --workspace --all-targets -- -D warnings`
limpio, `cargo fmt --check` limpio, el binario GTK compila y abre. Cualquier diferencia
en la salida del diff o del export es un defecto, no una mejora.

**S7 — El núcleo no conoce UI ni Tauri.**
`rustdiff-core` no puede depender de `gtk4`, `libadwaita`, `sourceview5`, `cairo` ni
`tauri`. Es la invariante que hace barata la migración y la sostiene un test.

**S8 — El frontend nunca toca el filesystem.**
Todo acceso a disco, parseo y validación pasa por comandos Rust, para conservar
`MAX_INPUT_SIZE` (10 MB) y los errores tipados (`ParseError`, `StorageError`).

## Decisiones abiertas

| ID | Decisión | Recomendación | Bloquea |
|----|----------|---------------|---------|
| D1 | Editor web | **CodeMirror 6** (elegido) | F3 |
| D2 | Render de la vista de grafo | **Canvas 2D con el layout de `graph.rs`** (elegido) | F6 |
| D3 | i18n | i18next en el front (saca `rust-i18n` del core) | F2/F5 |
| D4 | Retirar la app GTK al final | Sí | F8 |
| D5 | Flatpak como canal principal en Linux | **Sí** (elegido); viabilidad ya confirmada, ver L9 | F1 |
| D6 | Generación de tipos TS | `tauri-specta` | F2 |
| D7 | crates.io | **Retirar** (elegido); se ejecuta en F8 junto con `install.sh` | antes del próximo tag `v*` |

### Consecuencia de D7 que hay que respetar hasta F8

Retirar crates.io se ejecuta en F8, porque `install.sh` todavia hace
`cargo install rustdiff` y sacarlo antes deja sin instalacion a quien lo use hoy.
Mientras tanto: un tag `v*` cortado desde esta rama **falla** el job de crates.io
(`publish.yml`), porque el paquete raiz depende de crates internos del workspace.
Los tags de release se siguen cortando desde `main` (que sigue siendo la app GTK)
hasta que F8 retire el canal.

## Tasks

Fase F0 — congelar el núcleo (S1, S6, S7).

| ID | Tarea | Spec | Ruta | Commit |
|----|-------|------|------|--------|
| T1 | Documento ODD de la feature | S1, S5 | inline | `74caca2` |
| T2 | Workspace Cargo + `rustdiff-core` (parser, diff_engine, graph, export), tests de integración movidos, test de invariante sin-UI | S6, S7 | inline | `c05f320` |
| T3 | `rustdiff-persist` (storage, settings) y poda de dependencias muertas del paquete raíz | S6, S7 | inline | `c05f320` |
| T4 | CI, CLAUDE.md y RELEASING.md a workspace | S6 | inline | `9b5c609` |
| T5 | Verificación independiente (`gentle-ai-verify`) y sus fixes: comandos de test de los dos READMEs y piso de módulos del guard | S6, S7 | subagente | `8b8fcbb`, `0bc4345` |

Fases posteriores (no autorizadas aún): F1 spike Tauri, F2 contrato IPC, F3 shell + editores,
F4 tabla de diff, F5 historial + export con golden files, F6 grafo, F7 sistema de diseño,
F8 empaquetado y retiro del front GTK.

## Log

**L1** (pedido original, verbatim):
> revisa el proyecto y haz un plan de migracion de este a tauri, donde el front se construya en react  usa shadcn/ui,  ayudame  cerarndo el sistema de seiseÃ±o ya exite un lok pero deja mucho que desar ayudeme primero a portar el propyeto a tauri y luego ver si mejoras ui/ux  haz el plan datallabasado en la realidad actual del proyecti

**L2** (verbatim):
> arranca y vas preguntando por los D

**L3** (evidencia, baseline): `cargo test --all-targets` en `main` @ `35f2266` = 150 tests
verdes (109 unitarios `src/lib.rs` + 41 integración: `diff_engine_tests` 10,
`graph_tests` 15, `parser_tests` 16). Cero fallos.

**L4** (hallazgos de la radiografía, base del plan):
`tokio` declarado y nunca usado en `src/` y feature `notifications`/`notify-rust` muerto;
cero threading (todo corre en el main loop de GTK); `--history` declarado en el `.desktop`
y ausente del código; 6 listas de assets runtime hardcodeadas; `DiffResult` ya es
serializable (contrato IPC casi gratis); `graph.rs` separa layout (puro) de dibujo (Cairo).

**L5** (hallazgo técnico que cambia F0): en rust-i18n 3.1.5 el macro `t!` expande a
`crate::_rust_i18n_t!`, es decir resuelve contra el backend generado **en el propio crate**.
Por lo tanto `rustdiff-core` (`export.rs`) y `rustdiff-persist` (`storage.rs`) deben
invocar `rust_i18n::i18n!("../../locales", fallback = "en")` cada uno y embeber los
locales. Se acepta la duplicación en F0 para no romper S6 (movimiento puro sin cambios de
API); la deuda se salda en F5 moviendo las cadenas de usuario al front (D3).

**L6** (decisiones del usuario, elegidas sobre las recomendaciones): **D1** CodeMirror 6;
**D2** canvas 2D propio con el layout de `graph.rs`; **D5** Flatpak sigue siendo el canal
principal en Linux (viabilidad de `webkit2gtk-4.1` a verificar en F1); **D7** se retira
crates.io, ejecutado en F8 junto con `install.sh`. D3, D4 y D6 las tomo con la
recomendación y se revisan en su fase.

**L7** (evidencia de F0, 2026-07-27):

- **151 tests verdes** en `cargo test --workspace --all-targets`: 150 preexistentes + 1
  nuevo (`no_ui_dependencies`). Reparto: raíz 5, `rustdiff-core` 126 (84 unitarios +
  41 de integración + 1 de invariante), `rustdiff-persist` 20.
- `cargo fmt --all --check` limpio y `cargo clippy --workspace --all-targets -- -D warnings`
  sin warnings.
- `Cargo.lock`: **-1.106 líneas** al caer `tokio`, `notify-rust` y su árbol.
- Smoke del binario GTK con dos JSON: abre, carga y compara; `timeout` lo mató a los 8 s
  (exit 124 = seguía vivo), **0 panics y 0 criticals**. La ventana se abrió en el
escritorio del usuario porque no hay `xvfb` en esta máquina.
- **Agujero de verificación encontrado y cerrado**: `cargo test` pelado en la raíz corría
  **5 tests** (solo el paquete del directorio actual), no 150. Se agregó `default-members`
  al workspace; sin eso, la extracción habría dejado 145 tests fuera de juego en silencio.
- **Hallazgo nuevo (preexistente, no lo introduce F0)**: al abrir archivos, GTK emite
  `Unknown tag 'rustdiff-*'` cinco veces por buffer porque `clear_highlights`
  (`src/ui/highlighter.rs:95`) llama a `remove_tag_by_name` antes de que `ensure_tags`
  cree los tags. Es cosmético y muere con el front GTK en F8; no se toca en F0 porque
  S6 prohíbe cambios de comportamiento.
- **D7 confirmado con el comando, no supuesto**: `cargo package -p rustdiff --no-verify`
  falla con `all dependencies must have a version requirement specified when packaging.
  dependency rustdiff-core does not specify a version`. El canal crates.io queda roto
  hasta F8; los tags `v*` se cortan desde `main` hasta entonces.
- Nota de higiene: `cargo package` sin `--allow-dirty` se queja del `build-dir/` de
  Flatpak que vive en el árbol (git lo ignora bien; es cargo quien lo ve a través de un
  enlace simbólico). Es preexistente, no de F0.

**L8** (verificación independiente de F0, veredicto `findings`, y cierre):

- **S6 y S7 confirmados por un verificador independiente**: `git show main:<viejo> | diff -`
  sobre los 9 archivos movidos da idénticos byte a byte para `parser`, `diff_engine`,
  `graph`, `export` y `settings`; `storage.rs` solo cambia las dos rutas a
  `rustdiff_core::…`; los tres tests de integración solo cambian el import. Sin
  referencias colgadas en `src/`, manifiestos, workflows, Flatpak, `install.sh`,
  `scripts/**`, `docs/**` ni READMEs.
- Sin regresión de i18n: en rust-i18n 3.1.5 `set_locale` es global, así que `app.rs`
  sigue manejando el idioma de los tres crates; lo único que duplica cada crate son sus
  tablas.
- **Fixes de la verificación**: los dos READMEs enseñaban `cargo test --test parser_tests`,
  que ya no resuelve (`8b8fcbb`); el piso de módulos del guard era 4 con 5 archivos
  (`0bc4345`).
- **Diferido a F1**: `cargo-sources.json` y `flathub/cargo-sources.json` quedaron sin
  regenerar. No rompe nada (el lock solo sumó los dos crates internos, así que el vendor
  sigue siendo superconjunto y `cargo --offline` resuelve), pero se regeneran cuanto se
  toque el manifest en F1.
- **Límites aceptados del test de invariante** (documentados, no violados hoy): no mira
  dependencias transitivas, no detecta crates fachada (relm4, wry) y la detección de
  comentarios es por prefijo de línea.
- **Estado final de F0**: 151 tests verdes, `cargo fmt --all --check` limpio y
  `cargo clippy --workspace --all-targets -- -D warnings` sin warnings.

**L9** (riesgo de F1 despejado con evidencia local, sin spike): el miedo era de dónde
sacaría `webkit2gtk-4.1` el Flatpak de Tauri, porque compilar WebKitGTK es carísimo. Los
runtimes ya instalados en esta máquina lo responden:

- `org.gnome.Platform//50` trae `files/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0`
  (2.54.1) y sus procesos (`WebKitWebProcess`, `WebKitNetworkProcess`, `WebKitGPUProcess`)
  en `files/libexec/webkit2gtk-4.1/` → el runtime ya sirve para ejecutar.
- `org.gnome.Sdk//50` trae `webkit2gtk-4.1.pc` y
  `files/lib/x86_64-linux-gnu/webkit2gtk-4.1/include/` → el SDK ya sirve para compilar.

Conclusión: **el manifest Flatpak actual no necesita ningún módulo extra ni compilar
WebKit**, y el gate de D5 deja de ser el punto de no-go de F1. Los prerequisitos locales
también están: `webkit2gtk-4.1` 2.54.1, `javascriptcoregtk-4.1` 2.54.1, `libsoup-3.0`
3.8.0, node v24.13.0, npm 11.6.2, pnpm 10.32.1, cargo 1.99.0 (CachyOS).
Queda en F1 lo barato: `src-tauri` + front mínimo, medir bundle y arranque, y regenerar
`cargo-sources.json` (punto diferido de L8).

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
| D5 | Flatpak como canal principal en Linux | **Sí** (elegido); su viabilidad se mide en F1 | F1 |
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
| T1 | Documento ODD de la feature | S1, S5 | inline | |
| T2 | Workspace Cargo + `rustdiff-core` (parser, diff_engine, graph, export), tests de integración movidos, test de invariante sin-UI | S6, S7 | inline | |
| T3 | `rustdiff-persist` (storage, settings) y poda de dependencias muertas del paquete raíz | S6, S7 | inline | |
| T4 | CI y CLAUDE.md a workspace | S6 | inline | |

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

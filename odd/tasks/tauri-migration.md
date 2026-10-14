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

Fases posteriores (F1 autorizada y en curso; F2-F8 no autorizadas todavía): F1 spike Tauri,
F2 contrato IPC, F3 shell + editores, F4 tabla de diff, F5 historial + export con golden files,
F6 grafo, F7 sistema de diseño, F8 empaquetado y retiro del front GTK.

### F1 — spike Tauri v2 + React (en curso)

| ID | Tarea | Spec | Ruta | Commit |
|----|-------|------|------|--------|
| T6 | Núcleo serializable para el IPC: `Serialize` en `DiffKind`, `DiffItem`, `DiffResult` y `Format` | S2, S8 | inline | |
| T7 | Andamiaje `desktop/` (Vite + React + TS) y `desktop/src-tauri/` (Tauri v2) con el comando real `diff_documents` | S2, S8 | inline | |
| T8 | Smokes headless reutilizable (`desktop/scripts/smoke-headless.sh`): sway headless + grim, sin tocar el escritorio del usuario | S6 | inline | |
| T9 | CI: libs de WebKit + pasos de pnpm/Node antes de los pasos de cargo | S6 | inline | |

**Decisiones de andamiaje de F1**

- **Layout transitorio**: el shell Tauri vive en `desktop/` (frontend) + `desktop/src-tauri/`,
  y la app GTK se queda en la raíz. Mover 4.136 LOC de UI GTK ahora sería el retiro que
  corresponde a F8; en F8 se borra `src/` y `desktop/*` puede pasar a la raíz. Así los dos
  frontends conviven sin pisarse y `main` sigue teniendo una app que compila.
- **El núcleo deriva `Serialize`** en los cuatro tipos que viajan por IPC. `ParseError`
  todavía se mapea a texto: la taxonomía de errores con código llega en F2 con los tipos
  generados por `tauri-specta` (D6).
- **Hallazgo que cambia el workspace**: `tauri-build` valida que exista `frontendDist`
  (`desktop/dist`) al compilar el shell, así que meter `desktop/src-tauri` en
  `default-members` haría que **todo** comando de cargo en la raíz dependiera de que el
  frontend esté compilado — un fallo confuso para quien solo trabaja en la app GTK. Queda en
  `members` (lock y `target` compartidos) y el CI usa `--workspace` después de compilar el
  frontend.

### F2–F8 — resto de la migración (autorizadas en L13)

**S9 — Completar todas las fases; la revisión final la hace el usuario.**
Pedido literal: *"finaliza todas las interaciones  la final de la migracion yo hago una revision cmpleta de la app"*.
Consecuencia: cada fase se implementa, se verifica (fmt, clippy, tests, `pnpm build`, smoke
con captura) y se commitea sin esperar aprobación intermedia. La review nativa por candidato
queda explícitamente delegada a la revisión completa del usuario al final.

| ID | Tarea | Spec | Ruta | Commit |
|----|-------|------|------|--------|
| T10 | F2: contrato IPC completo (formato, pretty-print, diff, rangos inline, export, grafo, archivos, settings, historial) con tipos TS generados y errores con código | S2, S8 | worker | |
| T11 | F3: Tailwind + shadcn/ui, shell de la app, welcome, editores CodeMirror 6, auto-compare 500 ms, formateo, resaltado de diff, i18n (i18next, en/es) | S2, S4 | worker | |
| T12 | F4: tabla de diferencias con filtros, click-to-jump y búsqueda Ctrl+F | S2 | worker | |
| T13 | F5: historial, export txt/html, diálogo de salida, escala de texto e idioma | S2, S8 | worker | |
| T14 | F6: vista de grafo en canvas 2D sobre el layout de `graph.rs` | S2 | worker | |
| T15 | F7: sistema de diseño (tokens, claro/oscuro, accesibilidad) | S3 | worker | |
| T16 | F8: empaquetado (Flatpak, deb, macOS, install.sh), retiro del front GTK y de crates.io, docs | S1, D4, D7 | worker | |

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

**L10** (F1, andamiaje): el spike quedó armado y el frontend compila.

- Frontend: Vite 8.3.4 + React 19.3 + TypeScript 7.0.2; `pnpm install` resolvió 27 paquetes
  y `pnpm build` (`tsc --noEmit` + `vite build`) da `dist/` de **228 KB**, con el JS en
  221.84 kB (69.46 kB gzip).
- Shell: `desktop/src-tauri` con Tauri 2.12 (CLI) y un único comando `diff_documents` que
  reusa `rustdiff-core` tal cual (misma semántica que la app GTK: formato explícito manda,
  si no se detecta del documento izquierdo; cada lado reporta su propio error).
- Cinco tests dentro del binario: diff semántico real, formato explícito sobre detección,
  formato desconocido sin fallback, error por lado, y **la forma serializada del payload**
  que espejan los tipos de `desktop/src/App.tsx`.
- Herramientas de verificación disponibles medidas: **sway headless + grim** funcionan
  (weston, cage y Xvfb no están), así que el smoke puede correr sin abrir ventanas en el
  escritorio del usuario; se agregó `desktop/scripts/smoke-headless.sh` para eso.
- `patchelf` no está instalado: afecta solo al empaquetado AppImage, no al `.deb`.

**L11** (F1 cerrada, gate del spike pasado **con prueba visual**):

- **Prueba visual**: la captura del escritorio sintético muestra el diff semántico real
  renderizado por el frontend (`$.activo` añadido, `$.tags[1]` y `$.usuario.edad`
  cambiados), con el estado "Json · 3 difference(s): 1 added, 0 removed, 2 changed".
  La cadena React → IPC → `rustdiff-core` → React funciona completa.
- **Mediciones** (mismo harness para las dos apps, `desktop/scripts/smoke-headless.sh`):

  | | Tauri 2.12.3 (release) | App GTK (debug) |
  |---|---|---|
  | arranque hasta ventana mapeada | **208 ms** | 1497 ms |
  | RSS del árbol de procesos | **476 MB** (3 procesos) | 252 MB (1 proceso) |
  | `.deb` / binario | 1.91 MiB / 4.82 MB | — |
  | `dist/` del frontend | 228 KB (JS 221.84 kB, 69.46 kB gzip) | — |

  El arranque de la GTK está inflado por ser binario de debug (no se compiló en release);
  el dato comparable es la memoria: **WebKit cuesta ~1.9× el RSS de GTK**. Es el precio real
  de la migración y conviene tenerlo a la vista.
- **Cinco hallazgos que costaron tiempo y quedan documentados**:
  1. **`custom-protocol` no es opcional**: en tauri 2.11+ `tauri/build.rs` decide
     `dev = !custom_protocol`, así que un `cargo build --release` sin esa feature arranca
     apuntando a `http://localhost:1420` y la ventana muestra "Could not connect to
     localhost". El CLI la activa; quedó declarada en el manifiesto del miembro.
  2. **Versiones alineadas**: el CLI aborta si `tauri` (crate) y `@tauri-apps/api` (npm) no
     comparten major/minor; ambos en 2.12.3.
  3. **Backend headless sin GPU**: sin `WEBKIT_DISABLE_DMABUF_RENDERER=1` (y compositing
     off) la app muere con `Error 71 (Error de protocolo) dispatching to Wayland display`
     justo después de mapear la ventana. Es del entorno sintético, no del código.
  4. **`sway` headless necesita su propio `XDG_RUNTIME_DIR`**: con el del usuario choca con
     su sesión (socket `wayland-1` y su `SWAYSOCK`) y el smoke termina consultando el
     escritorio equivocado. El harness lo aísla y borra al salir.
  5. **El `.deb` de Tauri no es el paquete de cargo-deb**: el nuevo se llama `rust-diff`
     (el actual es `rustdiff`), instala `usr/bin/rustdiff-desktop` (no `rustdiff`),
     trae su propio `RustDiff.desktop` y **ningún metainfo AppStream**, y depende de
     `libwebkit2gtk-4.1-0, libgtk-3-0`: **Tauri en Linux se apoya en GTK3**, así que se va
     Adwaita y GtkSourceView pero queda GTK3 vía WebKit.
- **Anotado para F8** (no bloquea F1): unificar el nombre del paquete y del binario, decidir
  cuál `.desktop` gana y empaquetar el metainfo, instalar `patchelf` si se quiere AppImage, y
  regenerar `cargo-sources.json` (sigue diferido de L8: el manifest Flatpak no se tocó porque
  WebKit ya está resuelto desde L9).
- S4 se respeta: F1 no tocó ni una línea de diseño; Tailwind y shadcn/ui siguen siendo F3/F7.

**L12** (review nativa de F1, verificación independiente y los arreglos que salieron de ahí):

- **La review del slice de código cerró en `escalated`, no en `approved`** (lineage
  `review-6fa13d7ad3d22ed0`): causa `unknown_causality` sobre R1-001, y el refuter del
  proveedor **corroboró R3-1 y R4-BUILD-01** apuntando a `Cargo.toml:29/33`,
  `CLAUDE.md:45/52`, este documento, `ci.yml` y `desktop/.gitignore:2`.
- **Limitación real del presupuesto del revisor**: los dos primeros intentos murieron con
  `lens_context_budget_exceeded` (candidato rama-vs-main, y candidato F1 completo). De las
  ~6.3k líneas del rango de F1, **6.123 son lockfiles** (`Cargo.lock` +5.259,
  `pnpm-lock.yaml` +864) más iconos binarios. El candidato que sí entró fue el slice de
  código: 22 archivos / 1.836 líneas, sin el churn del `Cargo.lock`. Conclusión para F2+:
  **una regeneración de lockfile de este tamaño no cabe en un candidato de review**; el
  churn mecánico va en su propio commit base y se revisa el código.
- **Verificación independiente** (`gentle-ai-verify`): veredicto `findings`.
  - **F1 (alto)**: `desktop/src-tauri` **estaba en `default-members`**, contradiciendo
    `CLAUDE.md` y el propio mensaje del commit. Un `cargo test` pelado compilaba todo
    Tauri/WebKitGTK y exigía las libs de WebKit.
  - **F2 (medio)**: la razón documentada del orden de build era **falsa**: `tauri-codegen`
    solo valida `frontendDist` cuando `custom-protocol` está activo, así que `cargo test`
    y `clippy` no necesitan `desktop/dist`.
  - **F3**: los tests no cubren el binding de argumentos — renombrar `left` compila y rompe
    la app en runtime.
  - **F4**: falta el corto-circuito de entrada vacía que la GTK hace antes de tocar el
    núcleo (con entradas no vacías la paridad es exacta).
  - **F5**: el script podía dejar huérfanos los procesos de WebKit y no limpiaba
    `WAYLAND_SOCKET`. **F6**: comentario colgado en el manifiesto.
- **Arreglado en este commit**: `desktop/src-tauri` fuera de `default-members` con la razón
  real (compila la pila Tauri y exige las libs de WebKit; el CI lo cubre con `--workspace`);
  la afirmación sobre el orden de build corregida; el test del payload extendido a la
  nulidad de `left`/`right` en añadidos y eliminados, más un comentario que declara que el
  nombre del comando y sus argumentos los cubre el smoke e2e y no un test unitario; el script
  con grupo de procesos propio (`setsid` + `kill -TERM -- -PID`), `WAYLAND_SOCKET` limpio y
  `trap` antes del `mktemp`; el comentario colgado afuera.
- **Diferido a F3**: el corto-circuito de entrada vacía es UX del frontend, no del núcleo.
- El estado `escalated` deja la autoridad de esa lineage **sin quemar** y sin ruta de
  corrección ofrecida: los arreglos son trabajo nuevo y sin revisar, y qué hacer con esa
  lineage es decisión del humano.

**L13** (verbatim):
> finaliza todas las interaciones  la final de la migracion yo hago una revision cmpleta de la app

Lectura: F2–F8 autorizadas de punta a punta; la review nativa por candidato se omite por
decisión explícita del usuario, que revisa la app completa al final. D3 (i18next), D4
(retirar la app GTK en F8) y D6 (tipos generados) se toman con la recomendación.

**L14** (bug real de la migración, encontrado por el usuario al correr `pnpm tauri dev`):

- **Síntoma**: la app moría al arrancar con `Gdk-Message: Error 71 (Error de protocolo)
  dispatching to Wayland display` y `exit code 1`, sin llegar a mostrar la ventana.
- **Causa**: WebKitGTK usa por defecto su renderer DMABUF y con el driver propietario de
  NVIDIA sobre Wayland esa ruta rompe la conexión. Máquina afectada: RTX 3060, driver 615,
  sesión sway/Wayland.
- **Por qué se me escapó**: la app GTK nunca usó WebKit, así que este modo de falla lo
  introdujo la migración. Mi harness de smoke lo esquivaba con
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` en el entorno, así que **nunca vi el bug en la app**:
  el parche estaba en el andamio de pruebas y no en el producto. Eso es un fallo de mi
  verificación, no del worker que escribió el código.
- **Evidencia**: sin variables la app muere (`exit=1`) con el error; con
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` y sin `WEBKIT_DISABLE_COMPOSITING_MODE` se mantiene
  viva (`exit=124` a los 8 s). El compositing no era el problema.
- **Arreglo**: `apply_webkit_workarounds()` en `desktop/src-tauri/src/lib.rs`, llamado al
  principio de `main()` antes de `run()`. Aplica el interruptor **solo** si es Wayland
  (`WAYLAND_DISPLAY`), hay driver NVIDIA (`/proc/driver/nvidia/version`) y el usuario no
  fijó la variable. Función pura `needs_dmabuf_workaround` con su tabla de verdad en
  `desktop/src-tauri/tests/webkit_workaround.rs`. Se sacaron los exports del harness de
  smoke: ahora el smoke prueba el arreglo de la app en lugar de taparlo.

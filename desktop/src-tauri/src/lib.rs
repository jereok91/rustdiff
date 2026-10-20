//! Shell de escritorio de RustDiff (Tauri v2): contrato IPC completo (F2).
//!
//! El frontend no sabe nada del contenido de un documento ni del disco (S8):
//! pide formato, pretty-print, diff, rangos inline, grafo, export, archivos,
//! preferencias e historial por comandos, y todos los errores vuelven con un
//! código traducible (`crate::error`).
//!
//! La cadena completa (React -> IPC -> `rustdiff-core` -> React) se armó en F1
//! con un solo comando; F2 expone el resto para que F3-F6 solo construyan UI.

pub mod commands;
pub mod error;
pub mod state;

use std::path::{Path, PathBuf};

use specta_typescript::Typescript;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};

use state::AppState;

// ─────────────────────────────────────────────
// Parche de arranque para WebKitGTK
// ─────────────────────────────────────────────

/// Decide si hay que desactivar el renderer DMABUF de WebKitGTK.
///
/// Con el driver propietario de NVIDIA sobre Wayland, la ruta DMABUF rompe la
/// conexión y la app muere al arrancar con `Error 71 (Error de protocolo)
/// dispatching to Wayland display`, antes de que se vea la ventana (visto en
/// una RTX 3060 con driver 615). Desactivarlo cuesta composición por GPU, así
/// que se aplica **solo** a esa combinación y **nunca** encima de una decisión
/// del usuario.
///
/// Pura a propósito: la tabla de verdad se testea sin tocar el entorno.
pub fn needs_dmabuf_workaround(wayland: bool, nvidia: bool, already_set: bool) -> bool {
    !already_set && wayland && nvidia
}

/// Aplica el parche si corresponde. Se llama antes de construir la ventana:
/// WebKit lee esta variable al inicializarse, y después ya es tarde.
pub fn apply_webkit_workarounds() {
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty());
    let nvidia = Path::new("/proc/driver/nvidia/version").exists();
    let already_set = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some();

    if !needs_dmabuf_workaround(wayland, nvidia, already_set) {
        return;
    }

    // SAFETY: se ejecuta al principio de `main`, antes de crear hilos o el
    // webview, que es la única condición que `set_var` exige en edition 2024.
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    tracing::info!(target: "rustdiff::startup", "NVIDIA + Wayland: se desactiva el renderer DMABUF de WebKit");
}

// ─────────────────────────────────────────────
// Identidad de la ventana
// ─────────────────────────────────────────────

/// Fija el `app_id` con el que la ventana se anuncia en Wayland.
///
/// GTK3 toma ese `app_id` de `g_get_prgname()`, **no** del id de
/// `GtkApplication` (ni de `gdk_set_program_class()`, que solo cambia el
/// `WM_CLASS` de X11): sin esto la ventana se llama `rustdiff`, el nombre del
/// binario, y el shell no puede atarla con `com.digitalgex.RustDiff.desktop`.
/// El resultado visible es el icono genérico en la barra de título y en la
/// barra de tareas (KDE cae al icono `wayland` de su tema), la ventana
/// desagrupada de su lanzador y un diálogo de archivos del portal que no sabe
/// qué app lo abre.
///
/// Tiene que correr antes de que GTK cree la primera superficie, por eso se
/// llama al principio de [`run`] (y no después de armar el `Builder`).
pub fn apply_gtk_app_id(identifier: &str) {
    #[cfg(target_os = "linux")]
    glib::set_prgname(Some(identifier));

    // En macOS y Windows el app_id sale del bundle y el icono viaja con el
    // ejecutable: no hay nada que anunciar al shell.
    #[cfg(not(target_os = "linux"))]
    let _ = identifier;
}

/// Definición única del contrato IPC.
///
/// De acá salen los bindings TypeScript y el `invoke_handler`: el frontend y el
/// backend no pueden divergir sin que un test lo diga.
///
/// `ErrorHandlingMode::Throw` hace que los bindings rechacen la promesa con el
/// `CommandError` serializado (en vez de devolver un `{ status, error }`), que
/// es la forma natural de leerlos en React.
///
/// `dangerously_cast_bigints_to_number` es seguro **en este contrato**: los
/// `usize`/`i64` que viajan son ids, contadores y offsets de caracteres, todos
/// muy por debajo de 2^53. Sin eso specta rechaza exportar `usize`.
///
/// `enable_lossless_floats` aplana `number | null` a `number` para las `f64`
/// (geometría del grafo y escala de texto). Es seguro porque esos valores son
/// finitos: las métricas que llegan del frontend se sanean en `build_graph` y
/// el layout solo hace sumas y comparaciones sobre ellas. Tauri serializa con
/// `serde_json`, que convertiría un `NaN` en `null`.
pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            commands::format::detect_format,
            commands::format::format_pretty,
            commands::format::unescape_json,
            commands::diff::diff_documents,
            commands::diff::inline_char_ranges,
            commands::graph::build_graph,
            commands::export::export_txt,
            commands::export::export_html,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::startup_files,
            commands::settings::settings_get,
            commands::settings::settings_save,
            commands::history::history_list,
            commands::history::history_search,
            commands::history::history_get,
            commands::history::history_save,
            commands::history::history_delete,
            commands::history::history_clear,
            commands::history::history_count,
        ])
        .error_handling(ErrorHandlingMode::Throw)
        .dangerously_cast_bigints_to_number()
        .semantic_types(specta_typescript::semantic::Configuration::default().enable_lossless_floats())
}

/// Ruta del archivo de bindings: `desktop/src/bindings.ts`.
pub fn bindings_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts")
}

/// Genera los bindings TypeScript en `path`.
///
/// La llama el arranque en debug (así el archivo nunca queda viejo mientras se
/// trabaja) y los tests, que además comprueban que el archivo commiteado sea el
/// que produce el builder actual.
pub fn export_bindings(path: &Path) -> Result<(), String> {
    specta_builder()
        .export(Typescript::default(), path)
        .map_err(|e| e.to_string())
}

/// Arranca la aplicación.
pub fn run() {
    let context = tauri::generate_context!();

    // El config es el origen único del identificador: el mismo que usa el
    // bundle, el Flatpak y el nombre del `.desktop`.
    apply_gtk_app_id(context.config().identifier.as_str());

    let builder = specta_builder();

    // Los bindings solo se regeneran en desarrollo: en release el archivo
    // commiteado es la fuente de verdad (y el test de drift lo sostiene).
    #[cfg(debug_assertions)]
    if let Err(error) = export_bindings(&bindings_path()) {
        eprintln!("could not export the TypeScript bindings: {error}");
    }

    tauri::Builder::default()
        // El frontend pide las rutas al diálogo nativo y las pasa a los
        // comandos: el filesystem sigue siendo del lado Rust (S8).
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::from_env())
        .invoke_handler(builder.invoke_handler())
        .run(context)
        .expect("error while running RustDiff");
}

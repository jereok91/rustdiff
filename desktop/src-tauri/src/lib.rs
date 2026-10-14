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
        .run(tauri::generate_context!())
        .expect("error while running RustDiff");
}

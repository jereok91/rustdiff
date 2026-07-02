//! Punto de entrada de la aplicación GTK.
//!
//! Configura `adw::Application`, maneja argumentos CLI,
//! y conecta la señal `activate` para construir la ventana principal.

use gtk::prelude::*;
use gtk4 as gtk;
use libadwaita as adw;

use crate::ui::main_window::MainWindow;

/// ID de la aplicación en formato reverse-DNS (requerido por Freedesktop/GNOME).
const APP_ID: &str = "com.digitalgex.RustDiff";

/// Construye y ejecuta la aplicación GTK.
///
/// La app declara `HANDLES_OPEN`, por lo que GTK enruta cualquier archivo
/// recibido (CLI `rustdiff a.json b.json`, o "Abrir con RustDiff" desde el
/// gestor de archivos) a la señal `open` en lugar de `activate`.
pub fn run() -> gtk::glib::ExitCode {
    // Inicializar logging estructurado
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    // Seleccionar el idioma activo en funcion del locale del sistema.
    setup_locale();

    let app = adw::Application::builder()
        .application_id(APP_ID)
        .flags(gtk::gio::ApplicationFlags::HANDLES_OPEN)
        .build();

    app.connect_activate(build_ui);
    app.connect_open(open_files);

    // Ejecutar la aplicación pasando los argumentos del sistema
    app.run()
}

/// Determina el idioma activo. Prioridad:
///   1. `Settings::language` si es `"en"` o `"es"` (preferencia explicita del usuario).
///   2. `LC_ALL` / `LC_MESSAGES` / `LANG` del entorno.
///   3. Fallback a ingles.
///
/// El valor se propaga a `rust_i18n` para que `t!()` resuelva contra el
/// idioma correcto en toda la aplicacion.
fn setup_locale() {
    use crate::settings::{SUPPORTED_LANGUAGES, Settings};

    let settings = Settings::load();

    let code = if SUPPORTED_LANGUAGES.contains(&settings.language.as_str()) {
        settings.language.clone()
    } else {
        // `"auto"` o cualquier valor no soportado -> detectar del entorno
        ["LC_ALL", "LC_MESSAGES", "LANG"]
            .iter()
            .filter_map(|var| std::env::var(var).ok())
            .find(|v| !v.is_empty())
            .and_then(|raw| {
                // "es_ES.UTF-8" -> "es"
                raw.split(['.', '@'])
                    .next()
                    .and_then(|s| s.split('_').next())
                    .map(|s| s.to_lowercase())
            })
            .filter(|code| SUPPORTED_LANGUAGES.contains(&code.as_str()))
            .unwrap_or_else(|| "en".into())
    };

    tracing::info!("Idioma activo: {code} (pref={})", settings.language);
    rust_i18n::set_locale(&code);
}

/// Callback principal: se invoca cuando la aplicación se activa sin archivos.
///
/// Construye la ventana principal (pantalla de bienvenida) y la presenta.
fn build_ui(app: &adw::Application) {
    let window = MainWindow::new(app);
    window.present();
}

/// Callback de la señal `open`: se invoca cuando la app recibe archivos,
/// ya sea por CLI (`rustdiff a.json [b.json]`) o desde el gestor de
/// archivos ("Abrir con RustDiff").
///
/// - Un archivo  → se carga en el editor izquierdo (modo documento único).
/// - Dos o más   → los dos primeros se cargan en izquierdo/derecho con
///   el modo comparación activado.
fn open_files(app: &adw::Application, files: &[gtk::gio::File], _hint: &str) {
    let window = MainWindow::new(app);

    let paths: Vec<String> = files
        .iter()
        .filter_map(|f| f.path())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    match paths.as_slice() {
        [] => {}
        [single] => {
            tracing::info!("Abriendo archivo único: {single}");
            window.load_single_file(single);
        }
        [left, right, ..] => {
            tracing::info!("Cargando archivos: {left} y {right}");
            window.load_files_from_paths(left, right);
        }
    }

    window.present();
}

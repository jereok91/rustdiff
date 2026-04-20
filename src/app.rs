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
/// Si se pasan dos archivos por CLI (`rustdiff file1.json file2.json`),
/// los carga automáticamente en los paneles izquierdo y derecho.
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

    let app = adw::Application::builder().application_id(APP_ID).build();

    app.connect_activate(build_ui);

    // Ejecutar la aplicación pasando los argumentos del sistema
    app.run()
}

/// Lee `LC_ALL` / `LC_MESSAGES` / `LANG` y configura `rust_i18n` con el
/// idioma soportado mas cercano. Si no hay match, queda en ingles
/// (fallback configurado en `i18n!()`).
fn setup_locale() {
    const SUPPORTED: &[&str] = &["en", "es"];

    let code = ["LC_ALL", "LC_MESSAGES", "LANG"]
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
        .filter(|code| SUPPORTED.contains(&code.as_str()))
        .unwrap_or_else(|| "en".into());

    tracing::info!("Idioma seleccionado: {code}");
    rust_i18n::set_locale(&code);
}

/// Callback principal: se invoca cuando la aplicación se activa.
///
/// Construye la ventana principal y la presenta al usuario.
fn build_ui(app: &adw::Application) {
    let window = MainWindow::new(app);

    // Si hay argumentos CLI (además del nombre del programa),
    // intentar cargar archivos automáticamente
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 3 {
        let left_path = &args[1];
        let right_path = &args[2];
        tracing::info!("Cargando archivos desde CLI: {left_path} y {right_path}");
        window.load_files_from_paths(left_path, right_path);
    }

    window.present();
}

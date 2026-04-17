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

    let app = adw::Application::builder().application_id(APP_ID).build();

    app.connect_activate(build_ui);

    // Ejecutar la aplicación pasando los argumentos del sistema
    app.run()
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

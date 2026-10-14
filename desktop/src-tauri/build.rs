//! Build script del shell Tauri.
//!
//! `tauri_build::build()` lee `tauri.conf.json`, genera el contexto de la
//! aplicacion y valida los permisos y capacidades declarados.

fn main() {
    tauri_build::build()
}

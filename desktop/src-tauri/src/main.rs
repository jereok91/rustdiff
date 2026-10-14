//! Binario del shell de escritorio.
//!
//! Fino a propósito (F2): el contrato IPC y el arranque viven en la librería
//! (`rustdiff_desktop`), para que los tests de integración y el export de
//! bindings puedan usarlos sin ejecutar la app.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rustdiff_desktop::run();
}

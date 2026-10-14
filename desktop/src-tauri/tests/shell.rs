//! Tests de integración del shell Tauri.
//!
//! Un solo target a propósito: cada archivo de `tests/` enlaza la pila Tauri
//! completa (tauri + wry + WebKitGTK + tao), y ese enlazado es lo más caro que
//! tiene el proyecto. Con tres archivos se hacía tres veces.
//!
//! Los módulos llevan `#[path]` explícito porque acá `shell.rs` **es** la raíz
//! del target: sin eso, `mod bindings;` buscaría `tests/bindings.rs` y no
//! `tests/shell/bindings.rs`.

#[path = "shell/bindings.rs"]
mod bindings;

#[path = "shell/commands.rs"]
mod commands;

#[path = "shell/webkit_workaround.rs"]
mod webkit_workaround;

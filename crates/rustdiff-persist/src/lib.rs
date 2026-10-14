//! Persistencia de RustDiff: historial de sesiones y preferencias del usuario.
//!
//! No conoce ninguna UI: quien lo use (hoy la app GTK, manana el backend de
//! Tauri) pide todo por su API publica y conserva asi las mismas validaciones,
//! limites y errores tipados.

// Locales embebidos en tiempo de compilacion desde locales/*.yml.
//
// `rust-i18n` resuelve `t!` contra el backend generado *en el crate que lo
// invoca*, asi que cada crate que traduce tiene que cargar los locales por su
// cuenta (ver odd/tasks/tauri-migration.md, L5).
rust_i18n::i18n!("../../locales", fallback = "en");

pub mod settings;
pub mod storage;

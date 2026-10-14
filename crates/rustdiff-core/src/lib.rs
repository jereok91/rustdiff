//! Nucleo sin UI de RustDiff.
//!
//! Detecta el formato de un documento, lo parsea, calcula el diff semantico,
//! construye el grafo de nodos y exporta el resultado. No conoce GTK ni Tauri:
//! esa invariante la sostiene `tests/no_ui_dependencies.rs`, y es lo que permite
//! cambiar de toolkit sin tocar la logica de comparacion.

// Locales embebidos en tiempo de compilacion desde locales/*.yml.
//
// `rust-i18n` resuelve `t!` contra el backend generado *en el crate que lo
// invoca*, asi que cada crate que traduce tiene que cargar los locales por su
// cuenta (ver odd/tasks/tauri-migration.md, L5).
rust_i18n::i18n!("../../locales", fallback = "en");

pub mod diff_engine;
pub mod export;
pub mod graph;
pub mod parser;

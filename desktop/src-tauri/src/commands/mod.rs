//! Comandos del contrato IPC (F2).
//!
//! Un módulo por área de la app. Todos comparten el mismo tipo de error
//! (`crate::error::CommandError`) y ninguno decide sobre el contenido: el
//! parseo, el diff, el grafo y el export son del núcleo.

pub mod diff;
pub mod export;
pub mod files;
pub mod format;
pub mod graph;
pub mod history;
pub mod settings;
pub mod shared;

//! Estado compartido de la app bajo el `Builder` de Tauri.
//!
//! El historial se abre una sola vez y vive detras de un `Mutex`: SQLite no es
//! `Sync` y los comandos pueden llegar en cualquier hilo. Si la apertura falla,
//! el estado guarda el motivo y los comandos de historial devuelven
//! `HistoryUnavailable` en vez de caerse.

use std::path::PathBuf;
use std::sync::Mutex;

use rustdiff_persist::storage::{Storage, StorageError};

use crate::error::CommandError;

/// Estado que Tauri inyecta en los comandos.
pub struct AppState {
    /// `Ok` con la conexion abierta, `Err` con el motivo del fallo.
    history: Mutex<Result<Storage, String>>,
    /// Rutas con las que se lanzo la app (0, 1 o 2).
    startup_paths: Vec<PathBuf>,
}

impl AppState {
    /// Estado real: historial en la ruta del usuario y paths de la CLI.
    pub fn from_env() -> Self {
        let startup_paths = std::env::args()
            .skip(1)
            .map(PathBuf::from)
            .filter(|path| path.is_file())
            .take(2)
            .collect();
        let history = Storage::open_default().map_err(|e| e.to_string());
        Self::new(history, startup_paths)
    }

    /// Estado con almacenamiento inyectado: los tests no tocan
    /// `~/.local/share/rustdiff`.
    pub fn with_storage(storage: Storage) -> Self {
        Self::new(Ok(storage), Vec::new())
    }

    /// Igual que `with_storage`, mas los paths que simulan la CLI.
    pub fn with_storage_and_paths(storage: Storage, startup_paths: Vec<PathBuf>) -> Self {
        Self::new(Ok(storage), startup_paths)
    }

    /// Estado sin historial disponible, para probar ese error.
    pub fn without_history(reason: impl Into<String>) -> Self {
        Self::new(Err(reason.into()), Vec::new())
    }

    fn new(history: Result<Storage, String>, startup_paths: Vec<PathBuf>) -> Self {
        Self {
            history: Mutex::new(history),
            startup_paths,
        }
    }

    pub fn startup_paths(&self) -> &[PathBuf] {
        &self.startup_paths
    }

    /// Ejecuta `f` contra el historial abierto.
    ///
    /// Aqui se decide el unico error que depende del estado: si la base no se
    /// pudo abrir (o el mutex quedo envenenado) el frontend recibe
    /// `HistoryUnavailable`, nunca un panic.
    pub fn with_history<T>(&self, f: impl FnOnce(&Storage) -> Result<T, StorageError>) -> Result<T, CommandError> {
        let guard = self
            .history
            .lock()
            .map_err(|_| CommandError::history_unavailable("the history lock is poisoned"))?;
        let storage = guard.as_ref().map_err(|reason| {
            CommandError::history_unavailable(format!("could not open the history database: {reason}"))
        })?;
        f(storage).map_err(CommandError::from_storage)
    }
}

//! Taxonomia de errores del IPC (F2).
//!
//! Un solo tipo serializable `{ code, message }` para todos los comandos. El
//! frontend traduce **por código** (D3: el i18n vive en el front); `message`
//! es diagnóstico en inglés para logs, no texto de UI.
//!
//! El código viaja como string (`"NeedInput"`, `"TooLarge"`…) porque specta
//! deriva los enums de variantes unitarias a una unión de literales en TS.

use rustdiff_core::parser::{Format, ParseError};
use rustdiff_persist::storage::StorageError;
use serde::{Deserialize, Serialize};

/// Códigos de error que el frontend sabe traducir.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum ErrorCode {
    /// Falta uno de los dos documentos (o el único, según el comando).
    NeedInput,
    /// El formato pedido no es `json`/`xml`/`sql`/`text`.
    UnknownFormat,
    /// No se pudo detectar el formato del documento.
    DetectFailed,
    /// Formato válido pero sin grafo (SQL y texto plano).
    UnsupportedFormat,
    /// El documento (único) no se pudo procesar.
    InvalidDocument,
    /// El documento izquierdo no se pudo procesar.
    InvalidLeft,
    /// El documento derecho no se pudo procesar.
    InvalidRight,
    /// El documento supera `MAX_INPUT_SIZE` (10 MB).
    TooLarge,
    /// Error de entrada/salida (leer o escribir un archivo).
    Io,
    /// El historial no está disponible (no se pudo abrir la base).
    HistoryUnavailable,
    /// No existe el recurso pedido (sesión de historial, archivo).
    NotFound,
}

/// Error tipado que devuelven todos los comandos.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct CommandError {
    pub code: ErrorCode,
    pub message: String,
}

/// Lado del documento que produjo un error de parseo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

impl CommandError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    /// Alguna de las dos entradas está en blanco (corto-circuito de la GTK).
    pub fn need_input() -> Self {
        Self::new(ErrorCode::NeedInput, "both documents must not be blank")
    }

    pub fn unknown_format(code: &str) -> Self {
        Self::new(
            ErrorCode::UnknownFormat,
            format!("unknown format `{code}` (expected json, xml, sql or text)"),
        )
    }

    pub fn detect_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DetectFailed, message)
    }

    pub fn unsupported_format(fmt: Format) -> Self {
        Self::new(
            ErrorCode::UnsupportedFormat,
            format!("the graph view does not support the {fmt} format"),
        )
    }

    pub fn too_large(limit: usize, actual: usize) -> Self {
        Self::new(
            ErrorCode::TooLarge,
            format!("document exceeds the {limit}-byte limit (is {actual} bytes)"),
        )
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Io, message)
    }

    pub fn history_unavailable(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::HistoryUnavailable, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }

    /// Traduce un `std::io::Error` conservando el `NotFound` del sistema.
    pub fn from_io(err: std::io::Error, context: impl std::fmt::Display) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => Self::not_found(format!("{context}: {err}")),
            _ => Self::io(format!("{context}: {err}")),
        }
    }

    /// Traduce un error del nucleo. `side` distingue el documento izquierdo del
    /// derecho; `None` cuando el comando procesa un único documento.
    pub fn from_parse(err: &ParseError, side: Option<Side>) -> Self {
        match err {
            ParseError::EmptyInput => Self::need_input(),
            ParseError::InputTooLarge { limit, actual } => Self::too_large(*limit, *actual),
            ParseError::UnknownFormat => Self::detect_failed(err.to_string()),
            _ => {
                let code = match side {
                    Some(Side::Left) => ErrorCode::InvalidLeft,
                    Some(Side::Right) => ErrorCode::InvalidRight,
                    None => ErrorCode::InvalidDocument,
                };
                Self::new(code, err.to_string())
            }
        }
    }

    /// Traduce un error de `rustdiff-persist`.
    pub fn from_storage(err: StorageError) -> Self {
        match err {
            StorageError::NotFound(id) => Self::not_found(format!("session {id} does not exist")),
            StorageError::Io(e) => Self::from_io(e, "history database"),
            StorageError::NoDataDir => Self::history_unavailable("could not determine the user data directory"),
            StorageError::Sqlite(e) => Self::history_unavailable(format!("SQLite error: {e}")),
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for CommandError {}

//! Persistencia de sesiones en SQLite (via rusqlite).
//!
//! Guarda el historial de comparaciones en:
//!   `~/.local/share/rustdiff/history.db`
//!
//! Cada sesión almacena los dos documentos, el formato y un resumen
//! del diff. Esto permite al usuario recuperar comparaciones anteriores
//! sin tener que volver a pegar los textos.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

use crate::parser::Format;

// ─────────────────────────────────────────────
// Errores
// ─────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("Error de SQLite: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("No se pudo determinar el directorio de datos del usuario")]
    NoDataDir,

    #[error("Error creando directorio: {0}")]
    Io(#[from] std::io::Error),

    #[error("Sesión no encontrada: id={0}")]
    NotFound(i64),
}

// ─────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────

/// Resumen serializable de un resultado de diff (para guardar en la BD).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub added: usize,
    pub removed: usize,
    pub changed: usize,
    pub total: usize,
}

/// Una sesión de comparación guardada.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: i64,
    pub created_at: String,
    pub format: Format,
    pub left_content: String,
    pub right_content: String,
    pub diff_summary: DiffSummary,
}

/// Límite por defecto de sesiones a retener en el historial.
pub const MAX_SESSIONS: usize = 20;

// ─────────────────────────────────────────────
// Almacenamiento
// ─────────────────────────────────────────────

/// Gestor de persistencia — encapsula la conexión a SQLite.
pub struct Storage {
    conn: Connection,
}

impl Storage {
    /// Abre (o crea) la base de datos en la ruta estándar del usuario.
    ///
    /// Ubicación: `~/.local/share/rustdiff/history.db`
    /// Se crea el directorio si no existe.
    pub fn open_default() -> Result<Self, StorageError> {
        let path = default_db_path()?;
        Self::open(&path)
    }

    /// Abre (o crea) la base de datos en una ruta arbitraria.
    /// Útil para tests que usan un archivo temporal.
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        // Crear el directorio padre si no existe
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;
        let storage = Self { conn };
        storage.init_schema()?;
        Ok(storage)
    }

    /// Abre una base de datos en memoria (para tests).
    pub fn open_in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        let storage = Self { conn };
        storage.init_schema()?;
        Ok(storage)
    }

    /// Guarda una nueva sesión de comparación.
    ///
    /// Devuelve el `id` de la sesión creada.
    /// Si el historial excede `MAX_SESSIONS`, elimina las más antiguas.
    pub fn save_session(
        &self,
        left: &str,
        right: &str,
        fmt: Format,
        summary: &DiffSummary,
    ) -> Result<i64, StorageError> {
        let format_str = format_to_str(fmt);
        let summary_json = serde_json::to_string(summary)
            .unwrap_or_else(|_| "{}".to_string());

        self.conn.execute(
            "INSERT INTO sessions (created_at, format, left_content, right_content, diff_summary)
             VALUES (datetime('now'), ?1, ?2, ?3, ?4)",
            params![format_str, left, right, summary_json],
        )?;

        let id = self.conn.last_insert_rowid();

        // Limitar el historial al máximo configurado
        self.prune_old_sessions()?;

        Ok(id)
    }

    /// Carga las últimas `limit` sesiones, ordenadas de más reciente a más antigua.
    pub fn load_sessions(&self, limit: usize) -> Result<Vec<Session>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, created_at, format, left_content, right_content, diff_summary
             FROM sessions
             ORDER BY id DESC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                created_at: row.get(1)?,
                format: row.get(2)?,
                left_content: row.get(3)?,
                right_content: row.get(4)?,
                diff_summary: row.get(5)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row_result in rows {
            let row = row_result?;
            sessions.push(row_to_session(row));
        }

        Ok(sessions)
    }

    /// Recupera una sesión por su ID.
    pub fn get_session(&self, id: i64) -> Result<Session, StorageError> {
        let row: Option<SessionRow> = self
            .conn
            .query_row(
                "SELECT id, created_at, format, left_content, right_content, diff_summary
                 FROM sessions WHERE id = ?1",
                params![id],
                |row| {
                    Ok(SessionRow {
                        id: row.get(0)?,
                        created_at: row.get(1)?,
                        format: row.get(2)?,
                        left_content: row.get(3)?,
                        right_content: row.get(4)?,
                        diff_summary: row.get(5)?,
                    })
                },
            )
            .optional()?;

        match row {
            Some(r) => Ok(row_to_session(r)),
            None => Err(StorageError::NotFound(id)),
        }
    }

    /// Elimina una sesión por su ID.
    pub fn delete_session(&self, id: i64) -> Result<bool, StorageError> {
        let affected = self
            .conn
            .execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    /// Elimina todas las sesiones del historial.
    /// Devuelve el número de filas borradas.
    pub fn clear_all_sessions(&self) -> Result<usize, StorageError> {
        let affected = self.conn.execute("DELETE FROM sessions", [])?;
        Ok(affected)
    }

    /// Devuelve el número total de sesiones guardadas.
    pub fn count_sessions(&self) -> Result<usize, StorageError> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    // ─────────────────────────────────────────
    // Funciones internas
    // ─────────────────────────────────────────

    /// Crea la tabla de sesiones si no existe.
    fn init_schema(&self) -> Result<(), StorageError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at      TEXT NOT NULL,
                format          TEXT NOT NULL,
                left_content    TEXT NOT NULL,
                right_content   TEXT NOT NULL,
                diff_summary    TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_created
                ON sessions (created_at DESC);",
        )?;
        Ok(())
    }

    /// Elimina sesiones antiguas si el historial excede el límite.
    fn prune_old_sessions(&self) -> Result<(), StorageError> {
        self.conn.execute(
            "DELETE FROM sessions WHERE id NOT IN (
                SELECT id FROM sessions ORDER BY id DESC LIMIT ?1
            )",
            params![MAX_SESSIONS as i64],
        )?;
        Ok(())
    }
}

// ─────────────────────────────────────────────
// Tipos auxiliares (fila cruda de la BD)
// ─────────────────────────────────────────────

struct SessionRow {
    id: i64,
    created_at: String,
    format: String,
    left_content: String,
    right_content: String,
    diff_summary: String,
}

fn row_to_session(row: SessionRow) -> Session {
    let format = str_to_format(&row.format);
    let diff_summary: DiffSummary = serde_json::from_str(&row.diff_summary)
        .unwrap_or(DiffSummary {
            added: 0,
            removed: 0,
            changed: 0,
            total: 0,
        });

    Session {
        id: row.id,
        created_at: row.created_at,
        format,
        left_content: row.left_content,
        right_content: row.right_content,
        diff_summary,
    }
}

// ─────────────────────────────────────────────
// Conversión Format ↔ String
// ─────────────────────────────────────────────

fn format_to_str(fmt: Format) -> &'static str {
    match fmt {
        Format::Json => "json",
        Format::Xml => "xml",
    }
}

fn str_to_format(s: &str) -> Format {
    match s.to_lowercase().as_str() {
        "xml" => Format::Xml,
        _ => Format::Json,
    }
}

// ─────────────────────────────────────────────
// Ruta por defecto de la base de datos
// ─────────────────────────────────────────────

fn default_db_path() -> Result<PathBuf, StorageError> {
    let data_dir = dirs::data_dir().ok_or(StorageError::NoDataDir)?;
    Ok(data_dir.join("rustdiff").join("history.db"))
}

// ─────────────────────────────────────────────
// Métodos de conveniencia para DiffSummary
// ─────────────────────────────────────────────

impl DiffSummary {
    /// Crea un resumen desde un `DiffResult`.
    pub fn from_diff_result(result: &crate::diff_engine::DiffResult) -> Self {
        Self {
            added: result.added.len(),
            removed: result.removed.len(),
            changed: result.changed.len(),
            total: result.total(),
        }
    }

    /// Texto corto para mostrar en la lista de historial.
    pub fn short_text(&self) -> String {
        if self.total == 0 {
            "Idénticos".into()
        } else {
            format!("+{} −{} ~{}", self.added, self.removed, self.changed)
        }
    }
}

impl std::fmt::Display for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "[{}] {} — {} ({})",
            self.id,
            self.created_at,
            self.format,
            self.diff_summary.short_text()
        )
    }
}

// ─────────────────────────────────────────────
// Tests unitarios
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_summary(added: usize, removed: usize, changed: usize) -> DiffSummary {
        DiffSummary {
            added,
            removed,
            changed,
            total: added + removed + changed,
        }
    }

    #[test]
    fn crear_y_recuperar_sesion() {
        let db = Storage::open_in_memory().unwrap();
        let summary = sample_summary(2, 1, 3);
        let id = db
            .save_session(r#"{"a":1}"#, r#"{"a":2}"#, Format::Json, &summary)
            .unwrap();
        assert!(id > 0);

        let session = db.get_session(id).unwrap();
        assert_eq!(session.id, id);
        assert_eq!(session.left_content, r#"{"a":1}"#);
        assert_eq!(session.right_content, r#"{"a":2}"#);
        assert!(matches!(session.format, Format::Json));
        assert_eq!(session.diff_summary.added, 2);
        assert_eq!(session.diff_summary.removed, 1);
        assert_eq!(session.diff_summary.changed, 3);
        assert_eq!(session.diff_summary.total, 6);
    }

    #[test]
    fn sesion_xml() {
        let db = Storage::open_in_memory().unwrap();
        let summary = sample_summary(0, 0, 1);
        let id = db
            .save_session("<a>1</a>", "<a>2</a>", Format::Xml, &summary)
            .unwrap();

        let session = db.get_session(id).unwrap();
        assert!(matches!(session.format, Format::Xml));
    }

    #[test]
    fn listar_sesiones_orden_reciente() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(1, 0, 0);

        let id1 = db.save_session("a", "b", Format::Json, &s).unwrap();
        let id2 = db.save_session("c", "d", Format::Json, &s).unwrap();
        let id3 = db.save_session("e", "f", Format::Xml, &s).unwrap();

        let sessions = db.load_sessions(10).unwrap();
        assert_eq!(sessions.len(), 3);
        // La más reciente primero
        assert_eq!(sessions[0].id, id3);
        assert_eq!(sessions[1].id, id2);
        assert_eq!(sessions[2].id, id1);
    }

    #[test]
    fn listar_con_limite() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(0, 0, 0);

        for i in 0..5 {
            db.save_session(&format!("l{i}"), &format!("r{i}"), Format::Json, &s)
                .unwrap();
        }

        let sessions = db.load_sessions(2).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn sesion_no_encontrada() {
        let db = Storage::open_in_memory().unwrap();
        let result = db.get_session(999);
        assert!(matches!(result, Err(StorageError::NotFound(999))));
    }

    #[test]
    fn eliminar_sesion() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(0, 0, 0);
        let id = db.save_session("x", "y", Format::Json, &s).unwrap();

        assert!(db.delete_session(id).unwrap());
        assert!(matches!(db.get_session(id), Err(StorageError::NotFound(_))));
    }

    #[test]
    fn eliminar_sesion_inexistente() {
        let db = Storage::open_in_memory().unwrap();
        assert!(!db.delete_session(999).unwrap());
    }

    #[test]
    fn borrar_todo_el_historial() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(0, 0, 0);
        for i in 0..5 {
            db.save_session(&format!("l{i}"), &format!("r{i}"), Format::Json, &s)
                .unwrap();
        }
        assert_eq!(db.count_sessions().unwrap(), 5);

        let borradas = db.clear_all_sessions().unwrap();
        assert_eq!(borradas, 5);
        assert_eq!(db.count_sessions().unwrap(), 0);
    }

    #[test]
    fn borrar_todo_vacio() {
        let db = Storage::open_in_memory().unwrap();
        assert_eq!(db.clear_all_sessions().unwrap(), 0);
    }

    #[test]
    fn contar_sesiones() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(0, 0, 0);

        assert_eq!(db.count_sessions().unwrap(), 0);

        db.save_session("a", "b", Format::Json, &s).unwrap();
        db.save_session("c", "d", Format::Xml, &s).unwrap();

        assert_eq!(db.count_sessions().unwrap(), 2);
    }

    #[test]
    fn poda_automatica_al_exceder_limite() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(1, 1, 1);

        // Guardar MAX_SESSIONS + 5 sesiones
        for i in 0..(MAX_SESSIONS + 5) {
            db.save_session(
                &format!("left_{i}"),
                &format!("right_{i}"),
                Format::Json,
                &s,
            )
            .unwrap();
        }

        // Solo deben quedar MAX_SESSIONS
        assert_eq!(db.count_sessions().unwrap(), MAX_SESSIONS);

        // Las más recientes deben sobrevivir
        let sessions = db.load_sessions(MAX_SESSIONS).unwrap();
        assert_eq!(sessions.len(), MAX_SESSIONS);
        // La primera debe ser la última insertada
        assert_eq!(
            sessions[0].left_content,
            format!("left_{}", MAX_SESSIONS + 4)
        );
    }

    #[test]
    fn diff_summary_serializacion_ida_y_vuelta() {
        let original = sample_summary(5, 3, 2);
        let json = serde_json::to_string(&original).unwrap();
        let parsed: DiffSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.added, 5);
        assert_eq!(parsed.removed, 3);
        assert_eq!(parsed.changed, 2);
        assert_eq!(parsed.total, 10);
    }

    #[test]
    fn diff_summary_short_text() {
        assert_eq!(sample_summary(0, 0, 0).short_text(), "Idénticos");
        assert_eq!(sample_summary(2, 1, 3).short_text(), "+2 −1 ~3");
    }

    #[test]
    fn session_display() {
        let session = Session {
            id: 42,
            created_at: "2026-04-14 10:00:00".into(),
            format: Format::Json,
            left_content: String::new(),
            right_content: String::new(),
            diff_summary: sample_summary(1, 2, 3),
        };
        let display = format!("{session}");
        assert!(display.contains("42"));
        assert!(display.contains("JSON"));
        assert!(display.contains("+1 −2 ~3"));
    }

    #[test]
    fn default_db_path_existe() {
        // Verificar que la ruta por defecto se puede calcular
        let path = default_db_path().unwrap();
        assert!(path.to_string_lossy().contains("rustdiff"));
        assert!(path.to_string_lossy().contains("history.db"));
    }

    #[test]
    fn contenido_con_caracteres_especiales() {
        let db = Storage::open_in_memory().unwrap();
        let s = sample_summary(0, 0, 0);

        // Texto con comillas, saltos de línea, unicode
        let left = "{ \"emoji\": \"🦀\", \"quote\": \"dijo \\\"hola\\\"\" }";
        let right = "<root>\n\t<msg>Ñoño's \"café\"</msg>\n</root>";
        let id = db.save_session(left, right, Format::Json, &s).unwrap();

        let session = db.get_session(id).unwrap();
        assert_eq!(session.left_content, left);
        assert_eq!(session.right_content, right);
    }
}

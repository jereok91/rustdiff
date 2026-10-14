//! Historial de comparaciones (SQLite de `rustdiff-persist`).
//!
//! La conexión vive en el `AppState` (detrás de un `Mutex`) y los comandos solo
//! la usan: si abrirla falló, todos devuelven `HistoryUnavailable`. El resumen
//! que se guarda lo calcula Rust a partir del diff — el frontend no puede
//! inventar un resumen.
//!
//! Los cuerpos viven en funciones `*_in` que reciben `&AppState` para que los
//! tests corran contra un `Storage` en memoria sin un `State` de Tauri.

use rustdiff_persist::storage::{DiffSummary, Session};

use crate::commands::shared::{FormatArg, run_diff};
use crate::error::CommandError;
use crate::state::AppState;

/// Tope defensivo del `limit` que llega del frontend: una lista de historial no
/// necesita más y protege la consulta de un valor absurdo.
const MAX_LIMIT: usize = 200;

fn clamp_limit(limit: usize) -> usize {
    limit.clamp(1, MAX_LIMIT)
}

/// Últimas sesiones, paginadas de más reciente a más antigua.
pub fn history_list_in(state: &AppState, offset: usize, limit: usize) -> Result<Vec<Session>, CommandError> {
    state.with_history(|s| s.load_sessions_offset(offset, clamp_limit(limit)))
}

/// Busca sesiones por contenido, formato o fecha.
pub fn history_search_in(state: &AppState, query: &str, limit: usize) -> Result<Vec<Session>, CommandError> {
    state.with_history(|s| s.search_sessions(query, clamp_limit(limit)))
}

/// Recupera una sesión por su id.
pub fn history_get_in(state: &AppState, id: i64) -> Result<Session, CommandError> {
    state.with_history(|s| s.get_session(id))
}

/// Guarda la comparación actual y devuelve el id de la sesión creada.
pub fn history_save_in(
    state: &AppState,
    left: &str,
    right: &str,
    format: Option<&FormatArg>,
) -> Result<i64, CommandError> {
    let (fmt, result) = run_diff(left, right, format)?;
    let summary = DiffSummary::from_diff_result(&result);
    state.with_history(|s| s.save_session(left, right, fmt, &summary))
}

/// Borra una sesión. `true` si existía.
pub fn history_delete_in(state: &AppState, id: i64) -> Result<bool, CommandError> {
    state.with_history(|s| s.delete_session(id))
}

/// Vacía el historial y devuelve cuántas sesiones se borraron.
pub fn history_clear_in(state: &AppState) -> Result<usize, CommandError> {
    state.with_history(|s| s.clear_all_sessions())
}

/// Cantidad total de sesiones guardadas.
pub fn history_count_in(state: &AppState) -> Result<usize, CommandError> {
    state.with_history(|s| s.count_sessions())
}

#[tauri::command]
#[specta::specta]
pub fn history_list(
    state: tauri::State<'_, AppState>,
    offset: usize,
    limit: usize,
) -> Result<Vec<Session>, CommandError> {
    history_list_in(&state, offset, limit)
}

#[tauri::command]
#[specta::specta]
pub fn history_search(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: usize,
) -> Result<Vec<Session>, CommandError> {
    history_search_in(&state, &query, limit)
}

#[tauri::command]
#[specta::specta]
pub fn history_get(state: tauri::State<'_, AppState>, id: i64) -> Result<Session, CommandError> {
    history_get_in(&state, id)
}

#[tauri::command]
#[specta::specta]
pub fn history_save(
    state: tauri::State<'_, AppState>,
    left: String,
    right: String,
    format: Option<FormatArg>,
) -> Result<i64, CommandError> {
    history_save_in(&state, &left, &right, format.as_ref())
}

#[tauri::command]
#[specta::specta]
pub fn history_delete(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, CommandError> {
    history_delete_in(&state, id)
}

#[tauri::command]
#[specta::specta]
pub fn history_clear(state: tauri::State<'_, AppState>) -> Result<usize, CommandError> {
    history_clear_in(&state)
}

#[tauri::command]
#[specta::specta]
pub fn history_count(state: tauri::State<'_, AppState>) -> Result<usize, CommandError> {
    history_count_in(&state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_limite_no_puede_quedar_en_cero_ni_sin_tope() {
        assert_eq!(clamp_limit(0), 1);
        assert_eq!(clamp_limit(20), 20);
        assert_eq!(clamp_limit(usize::MAX), MAX_LIMIT);
    }
}

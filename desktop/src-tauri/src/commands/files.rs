//! Lectura y escritura de documentos (S8).
//!
//! El frontend nunca abre archivos: pide la ruta con `tauri-plugin-dialog` y
//! pasa el path a estos comandos, que son los que aplican `MAX_INPUT_SIZE` y
//! devuelven errores con código.

use std::path::{Path, PathBuf};

use rustdiff_core::parser::MAX_INPUT_SIZE;
use serde::{Deserialize, Serialize};

use crate::error::CommandError;
use crate::state::AppState;

/// Un documento de disco listo para los editores.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct FileContents {
    /// Ruta absoluta o relativa tal como la dio el diálogo.
    pub path: String,
    /// Nombre del archivo, para el título de la pestaña.
    pub name: String,
    pub content: String,
}

/// Aplica el límite del núcleo antes de leer: evita cargar 10 MB para fallar.
pub fn check_input_size(size: usize) -> Result<(), CommandError> {
    if size > MAX_INPUT_SIZE {
        Err(CommandError::too_large(MAX_INPUT_SIZE, size))
    } else {
        Ok(())
    }
}

/// Lee un documento de disco con el límite de tamaño del núcleo.
pub fn read_document(path: &Path) -> Result<FileContents, CommandError> {
    let context = format!("could not read `{}`", path.display());

    let metadata = std::fs::metadata(path).map_err(|e| CommandError::from_io(e, &context))?;
    check_input_size(metadata.len() as usize)?;

    let content = std::fs::read_to_string(path).map_err(|e| CommandError::from_io(e, &context))?;
    // El archivo pudo crecer entre el `metadata` y la lectura.
    check_input_size(content.len())?;

    Ok(FileContents {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        content,
    })
}

/// Lee los documentos con los que se lanzó la app (0, 1 o 2).
pub fn read_startup_files(paths: &[PathBuf]) -> Result<Vec<FileContents>, CommandError> {
    paths.iter().map(|path| read_document(path)).collect()
}

/// Lee un documento del disco.
#[tauri::command]
#[specta::specta]
pub fn read_text_file(path: String) -> Result<FileContents, CommandError> {
    read_document(Path::new(&path))
}

/// Escribe un documento en disco.
///
/// El contenido se valida con el mismo límite que la lectura: lo que la app no
/// puede volver a abrir no lo debería guardar.
#[tauri::command]
#[specta::specta]
pub fn write_text_file(path: String, content: String) -> Result<(), CommandError> {
    check_input_size(content.len())?;
    std::fs::write(&path, content).map_err(|e| CommandError::from_io(e, format!("could not write `{path}`")))
}

/// Documentos con los que arrancó la app (`rustdiff a.json b.json`).
///
/// El cuerpo vive en `read_startup_files` para poder testearlo sin un `State`
/// de Tauri: los tests construyen el `AppState` con paths inyectados.
#[tauri::command]
#[specta::specta]
pub fn startup_files(state: tauri::State<'_, AppState>) -> Result<Vec<FileContents>, CommandError> {
    read_startup_files(state.startup_paths())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn un_documento_inexistente_es_not_found() {
        let err = read_document(Path::new("/no/existe/rustdiff.json")).unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
    }

    #[test]
    fn escribir_mas_del_limite_es_too_large() {
        let err = check_input_size(MAX_INPUT_SIZE + 1).unwrap_err();
        assert_eq!(err.code, ErrorCode::TooLarge);
        assert_eq!(check_input_size(MAX_INPUT_SIZE), Ok(()));
    }
}

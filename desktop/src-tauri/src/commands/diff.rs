//! Diff semántico y rangos de caracteres para el resaltado de los editores.
//!
//! Los dos comandos son puros: reciben texto, no tocan el disco (S8) y toda la
//! decisión sobre el contenido la toma `rustdiff-core`.

use rustdiff_core::diff_engine::{DiffResult, inline_char_ranges as core_inline_char_ranges};
use rustdiff_core::parser::Format;
use serde::{Deserialize, Serialize};

use crate::commands::shared::{FormatArg, run_diff};
use crate::error::CommandError;

/// Respuesta de `diff_documents`: el diff y el formato con el que se calculó.
///
/// `Format` viaja serializado (`"Json"`, `"Xml"`, `"Sql"`, `"Text"`) para que
/// la UI pueda mostrarlo y ofrecer el cambio manual de formato.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DiffResponse {
    pub format: Format,
    pub result: DiffResult,
}

/// Compara dos documentos y devuelve el resultado semántico.
///
/// Semántica idéntica a la app GTK (F1 la dejó probada): formato explícito
/// manda, si no se detecta del documento izquierdo, y cada lado reporta su
/// propio error (`InvalidLeft` / `InvalidRight`). Lo que agrega F2 es el
/// corto-circuito de entrada vacía (`NeedInput`) y los errores con código.
#[tauri::command]
#[specta::specta]
pub fn diff_documents(left: String, right: String, format: Option<FormatArg>) -> Result<DiffResponse, CommandError> {
    let (format, result) = run_diff(&left, &right, format.as_ref())?;
    Ok(DiffResponse { format, result })
}

/// Un rango de caracteres (no de bytes), como los devuelve el núcleo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct CharRange {
    pub start: usize,
    pub end: usize,
}

/// Rangos a resaltar dentro de cada documento.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct InlineRanges {
    pub left: Vec<CharRange>,
    pub right: Vec<CharRange>,
}

/// Rangos de caracteres que difieren entre dos cadenas.
///
/// El núcleo devuelve `Range<usize>` (offsets de caracteres), que no es
/// serializable; acá se traduce al par `{ start, end }` que consume la UI.
/// Nunca falla: comparar dos cadenas cualesquiera siempre da un resultado.
#[tauri::command]
#[specta::specta]
pub fn inline_char_ranges(left: String, right: String) -> InlineRanges {
    let (left_ranges, right_ranges) = core_inline_char_ranges(&left, &right);
    InlineRanges {
        left: left_ranges.into_iter().map(to_char_range).collect(),
        right: right_ranges.into_iter().map(to_char_range).collect(),
    }
}

fn to_char_range(range: std::ops::Range<usize>) -> CharRange {
    CharRange {
        start: range.start,
        end: range.end,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_rangos_son_de_caracteres_y_no_de_bytes() {
        // "ñ" ocupa 2 bytes y 1 caracter: si el comando devolviera offsets de
        // bytes, el rango derecho mediria dos posiciones en vez de una.
        let ranges = inline_char_ranges("año".into(), "ano".into());

        assert_eq!(
            ranges.left,
            vec![CharRange { start: 1, end: 2 }],
            "el rango izquierdo debe cubrir un caracter (ñ), no sus dos bytes"
        );
        assert_eq!(ranges.right, vec![CharRange { start: 1, end: 2 }]);
    }

    #[test]
    fn un_diff_identico_no_tiene_rangos() {
        let ranges = inline_char_ranges("igual".into(), "igual".into());
        assert!(ranges.left.is_empty() && ranges.right.is_empty());
    }
}

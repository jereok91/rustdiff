//! Formato y pretty-print.
//!
//! La detección y el formateo viven en `rustdiff-core`; acá solo se traducen
//! los errores a códigos y se respeta el corto-circuito de la GTK: un documento
//! en blanco no llega al núcleo.

use rustdiff_core::parser::{Format, format_pretty as core_format_pretty};

use crate::commands::shared::{FormatArg, detect_format_code, resolve_format};
use crate::error::CommandError;

/// Detecta el formato de un documento sin parsearlo del todo.
///
/// Devuelve `Result` en vez de `Format` a secas porque el texto vacío también
/// es una respuesta del comando, y el contrato la tipa como `NeedInput`.
#[tauri::command]
#[specta::specta]
pub fn detect_format(text: String) -> Result<Format, CommandError> {
    detect_format_code(&text)
}

/// Pretty-print de un documento.
///
/// Con `format` nulo se detecta del propio texto: así el botón "Format" de la
/// UI funciona antes de haber comparado nada.
#[tauri::command]
#[specta::specta]
pub fn format_pretty(text: String, format: Option<FormatArg>) -> Result<String, CommandError> {
    if text.trim().is_empty() {
        return Err(CommandError::need_input());
    }

    let fmt = resolve_format(format.as_ref(), &text)?;
    core_format_pretty(&text, fmt).map_err(|e| CommandError::from_parse(&e, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn el_texto_en_blanco_no_llega_al_nucleo() {
        assert_eq!(detect_format("   ".into()).unwrap_err().code, ErrorCode::NeedInput);
        assert_eq!(format_pretty("\n".into(), None).unwrap_err().code, ErrorCode::NeedInput);
    }

    #[test]
    fn el_formato_explicito_manda_sobre_la_deteccion() {
        // Un JSON válido formateado como texto se devuelve tal cual.
        let json = "{\"a\":1}";
        assert_eq!(format_pretty(json.into(), Some(FormatArg::new("text"))).unwrap(), json);
        assert!(format_pretty(json.into(), None).unwrap().contains("\n  \"a\": 1"));
    }

    #[test]
    fn un_documento_invalido_es_invalid_document() {
        let err = format_pretty("{".into(), Some(FormatArg::new("json"))).unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidDocument);
    }
}

//! Export a texto plano y a HTML.
//!
//! Los dos comandos recalculan el diff (no aceptan un `DiffResult` del
//! frontend: el contrato es texto, y así el núcleo sigue siendo la única
//! autoridad sobre el contenido) y delegan el render en `rustdiff-core::export`.

use rustdiff_core::export::{export_html as core_export_html, export_txt as core_export_txt};

use crate::commands::shared::{FormatArg, run_diff};
use crate::error::CommandError;

/// Reporte de diferencias en texto plano.
#[tauri::command]
#[specta::specta]
pub fn export_txt(left: String, right: String, format: Option<FormatArg>) -> Result<String, CommandError> {
    let (fmt, result) = run_diff(&left, &right, format.as_ref())?;
    Ok(core_export_txt(&result, fmt))
}

/// Reporte de diferencias en HTML autocontenido.
#[tauri::command]
#[specta::specta]
pub fn export_html(left: String, right: String, format: Option<FormatArg>) -> Result<String, CommandError> {
    let (fmt, result) = run_diff(&left, &right, format.as_ref())?;
    Ok(core_export_html(&result, fmt, &left, &right))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    const IZQUIERDO: &str = r#"{"a":1}"#;
    const DERECHO: &str = r#"{"a":2}"#;

    #[test]
    fn el_txt_lista_la_diferencia() {
        let reporte = export_txt(IZQUIERDO.into(), DERECHO.into(), None).unwrap();
        assert!(reporte.contains("$.a"), "reporte inesperado: {reporte}");
    }

    #[test]
    fn el_html_es_un_documento_con_la_diferencia() {
        let reporte = export_html(IZQUIERDO.into(), DERECHO.into(), None).unwrap();
        assert!(reporte.starts_with("<!DOCTYPE html>"));
        assert!(reporte.contains("$.a"));
    }

    #[test]
    fn exportar_sin_documentos_es_need_input() {
        assert_eq!(
            export_txt(String::new(), DERECHO.into(), None).unwrap_err().code,
            ErrorCode::NeedInput
        );
    }
}

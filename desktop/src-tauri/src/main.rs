//! Shell de escritorio de RustDiff (Tauri v2).
//!
//! Fase F1 de la migracion: un unico comando real que ejerce la cadena
//! completa React -> IPC -> `rustdiff-core` -> React. La semantica del diff la
//! aporta el nucleo compartido con la app GTK, asi que el frontend no decide
//! nada sobre el contenido: solo lo muestra.
//!
//! El frontend nunca toca el disco ni parsea (S8): pedir el diff es pedir un
//! comando, y esa es la razon por la que los limites del nucleo
//! (`MAX_INPUT_SIZE`) siguen valiendo.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rustdiff_core::diff_engine::{DiffResult, diff_json, diff_sql, diff_text, diff_xml};
use rustdiff_core::parser::{Format, auto_detect_format, parse_json, parse_sql, parse_text, parse_xml};
use serde::Serialize;

/// Respuesta del comando: el diff y el formato con el que se calculo.
///
/// `Format` viaja serializado (`"Json"`, `"Xml"`, `"Sql"`, `"Text"`) para que
/// la UI pueda mostrarlo y, mas adelante, ofrecer el cambio manual de formato.
#[derive(Debug, Serialize)]
struct DiffResponse {
    format: Format,
    result: DiffResult,
}

/// Resuelve el formato a usar: el explicito del usuario manda, y si no hay,
/// se detecta del documento izquierdo (misma regla que la app GTK).
fn resolve_format(explicit: Option<&str>, left: &str) -> Result<Format, String> {
    match explicit {
        Some("json") => Ok(Format::Json),
        Some("xml") => Ok(Format::Xml),
        Some("sql") => Ok(Format::Sql),
        Some("text") => Ok(Format::Text),
        Some(other) => Err(format!("unknown format `{other}`")),
        None => auto_detect_format(left).map_err(|e| format!("could not detect format: {e}")),
    }
}

/// Compara dos documentos y devuelve el resultado semantico.
///
/// Los errores son texto porque el frontend es quien los traduce (D3); la
/// taxonomia de errores con codigo llega en F2 junto con los tipos generados.
#[tauri::command]
fn diff_documents(left: String, right: String, format: Option<String>) -> Result<DiffResponse, String> {
    let fmt = resolve_format(format.as_deref(), &left)?;

    let result = match fmt {
        Format::Json => {
            let l = parse_json(&left).map_err(|e| format!("invalid left document: {e}"))?;
            let r = parse_json(&right).map_err(|e| format!("invalid right document: {e}"))?;
            diff_json(&l, &r)
        }
        Format::Xml => {
            let l = parse_xml(&left).map_err(|e| format!("invalid left document: {e}"))?;
            let r = parse_xml(&right).map_err(|e| format!("invalid right document: {e}"))?;
            diff_xml(&l, &r)
        }
        Format::Sql => {
            parse_sql(&left).map_err(|e| format!("invalid left document: {e}"))?;
            parse_sql(&right).map_err(|e| format!("invalid right document: {e}"))?;
            diff_sql(&left, &right)
        }
        Format::Text => {
            parse_text(&left).map_err(|e| format!("invalid left document: {e}"))?;
            parse_text(&right).map_err(|e| format!("invalid right document: {e}"))?;
            diff_text(&left, &right)
        }
    };

    Ok(DiffResponse { format: fmt, result })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![diff_documents])
        .run(tauri::generate_context!())
        .expect("error while running RustDiff");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    const IZQUIERDO: &str = r#"{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}"#;
    const DERECHO: &str = r#"{"usuario":{"nombre":"ana","edad":31},"tags":["a","c"],"activo":true}"#;

    #[test]
    fn el_comando_devuelve_un_diff_semantico_real() {
        let respuesta = diff_documents(IZQUIERDO.into(), DERECHO.into(), None).unwrap();

        assert_eq!(respuesta.format, Format::Json);
        assert!(respuesta.result.changed.iter().any(|i| i.path == "$.usuario.edad"));
        assert!(respuesta.result.changed.iter().any(|i| i.path == "$.tags[1]"));
        assert!(respuesta.result.added.iter().any(|i| i.path == "$.activo"));
    }

    #[test]
    fn el_formato_explicito_manda_sobre_la_deteccion() {
        // Un JSON valido comparado como texto tiene que dar Text, no Json.
        let respuesta = diff_documents(IZQUIERDO.into(), DERECHO.into(), Some("text".into())).unwrap();

        assert_eq!(respuesta.format, Format::Text);
        assert!(
            !respuesta.result.changed.is_empty(),
            "el diff de texto debe ver diferencias"
        );
    }

    #[test]
    fn un_formato_desconocido_no_cae_a_la_deteccion() {
        let error = diff_documents(IZQUIERDO.into(), DERECHO.into(), Some("yaml".into())).unwrap_err();

        assert!(error.contains("unknown format"), "error inesperado: {error}");
    }

    #[test]
    fn cada_lado_reporta_su_propio_error() {
        let izquierdo = diff_documents("{".into(), DERECHO.into(), Some("json".into())).unwrap_err();
        let derecho = diff_documents(IZQUIERDO.into(), "{".into(), Some("json".into())).unwrap_err();

        assert!(izquierdo.starts_with("invalid left document"), "error: {izquierdo}");
        assert!(derecho.starts_with("invalid right document"), "error: {derecho}");
    }

    #[test]
    fn el_payload_serializado_tiene_la_forma_que_espera_el_frontend() {
        // Este es el contrato que espejan los tipos de desktop/src/App.tsx:
        // si el nucleo cambia de forma, este test lo dice antes que la UI.
        let respuesta = diff_documents(IZQUIERDO.into(), DERECHO.into(), None).unwrap();
        let serializado: Value = serde_json::to_value(&respuesta).unwrap();

        assert_eq!(serializado["format"], json!("Json"));
        let cambiado = &serializado["result"]["changed"][0];
        assert!(cambiado["path"].is_string());
        assert_eq!(cambiado["kind"], json!("Changed"));
        assert!(cambiado["left"].is_string());
        assert!(cambiado["right"].is_string());
        assert!(serializado["result"]["added"].is_array());
        assert!(serializado["result"]["removed"].is_array());
    }
}

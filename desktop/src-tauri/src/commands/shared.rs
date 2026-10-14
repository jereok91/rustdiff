//! Piezas compartidas por los comandos: el formato que llega del frontend y el
//! único camino del diff.
//!
//! La semántica del diff es la del núcleo y no se toca acá: este módulo solo
//! decide *con qué formato* se compara (explícito del usuario o detectado del
//! documento izquierdo, igual que la app GTK) y traduce los errores a códigos.

use rustdiff_core::diff_engine::{DiffResult, diff_json, diff_sql, diff_text, diff_xml};
use rustdiff_core::parser::{Format, auto_detect_format, parse_json, parse_sql, parse_text, parse_xml};
use serde::{Deserialize, Serialize};

use crate::error::{CommandError, Side};

/// Formato pedido por el frontend.
///
/// En TypeScript se ve como el enum `Format` (`#[specta(type = Format)]`), pero
/// se deserializa como texto a propósito: así un valor desconocido (`"yaml"`)
/// llega hasta el comando y se convierte en `UnknownFormat` — un error con
/// código que el frontend puede traducir — en vez de morir en el
/// deserializador de Tauri como un mensaje opaco.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(transparent)]
pub struct FormatArg(#[specta(type = Format)] String);

impl FormatArg {
    pub fn new(code: impl Into<String>) -> Self {
        Self(code.into())
    }

    pub fn code(&self) -> &str {
        &self.0
    }

    /// Convierte el texto al enum del núcleo. Acepta la grafía del enum
    /// (`"Json"`, la que genera el binding) y la minúscula (`"json"`), porque
    /// los dos formatos circulan en la app.
    pub fn to_format(&self) -> Result<Format, CommandError> {
        let code = self.0.trim().to_ascii_lowercase();
        match code.as_str() {
            "json" => Ok(Format::Json),
            "xml" => Ok(Format::Xml),
            "sql" => Ok(Format::Sql),
            "text" => Ok(Format::Text),
            other => Err(CommandError::unknown_format(other)),
        }
    }
}

/// Detecta el formato de un documento. Sin estructura reconocible el núcleo
/// devuelve `Text` (fallback), así que el único fallo real es la entrada vacía.
pub fn detect_format_code(text: &str) -> Result<Format, CommandError> {
    if text.trim().is_empty() {
        return Err(CommandError::need_input());
    }
    auto_detect_format(text).map_err(|e| CommandError::from_parse(&e, None))
}

/// Resuelve el formato a usar: el explícito manda; si no hay, se detecta del
/// documento izquierdo. Misma regla que la app GTK, ahora con error tipado.
pub fn resolve_format(explicit: Option<&FormatArg>, left: &str) -> Result<Format, CommandError> {
    match explicit {
        Some(arg) => arg.to_format(),
        None => detect_format_code(left),
    }
}

/// Compara dos documentos: el único camino del diff en el IPC.
///
/// Incluye el corto-circuito de la GTK (`execute_diff`): si alguno de los dos
/// documentos está en blanco no se toca el núcleo, se devuelve `NeedInput`.
pub fn run_diff(left: &str, right: &str, format: Option<&FormatArg>) -> Result<(Format, DiffResult), CommandError> {
    if left.trim().is_empty() || right.trim().is_empty() {
        return Err(CommandError::need_input());
    }

    let fmt = resolve_format(format, left)?;

    let result = match fmt {
        Format::Json => {
            let l = parse_json(left).map_err(|e| CommandError::from_parse(&e, Some(Side::Left)))?;
            let r = parse_json(right).map_err(|e| CommandError::from_parse(&e, Some(Side::Right)))?;
            diff_json(&l, &r)
        }
        Format::Xml => {
            let l = parse_xml(left).map_err(|e| CommandError::from_parse(&e, Some(Side::Left)))?;
            let r = parse_xml(right).map_err(|e| CommandError::from_parse(&e, Some(Side::Right)))?;
            diff_xml(&l, &r)
        }
        Format::Sql => {
            parse_sql(left).map_err(|e| CommandError::from_parse(&e, Some(Side::Left)))?;
            parse_sql(right).map_err(|e| CommandError::from_parse(&e, Some(Side::Right)))?;
            diff_sql(left, right)
        }
        Format::Text => {
            parse_text(left).map_err(|e| CommandError::from_parse(&e, Some(Side::Left)))?;
            parse_text(right).map_err(|e| CommandError::from_parse(&e, Some(Side::Right)))?;
            diff_text(left, right)
        }
    };

    Ok((fmt, result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn el_codigo_de_formato_acepta_la_grafia_del_enum_y_la_minuscula() {
        assert_eq!(FormatArg::new("Json").to_format().unwrap(), Format::Json);
        assert_eq!(FormatArg::new("  xml ").to_format().unwrap(), Format::Xml);
        assert_eq!(FormatArg::new("TEXT").to_format().unwrap(), Format::Text);
    }

    #[test]
    fn un_codigo_desconocido_es_unknown_format() {
        let err = FormatArg::new("yaml").to_format().unwrap_err();
        assert_eq!(err.code, ErrorCode::UnknownFormat);
    }

    #[test]
    fn detectar_no_es_lo_mismo_que_invalidar() {
        // Un texto sin estructura no es un error: el núcleo cae a `Text`.
        assert_eq!(detect_format_code("hola mundo").unwrap(), Format::Text);
        // Sin documento, sí.
        assert_eq!(detect_format_code("   ").unwrap_err().code, ErrorCode::NeedInput);
        // `DetectFailed` es la red de seguridad para un `ParseError` de detección.
        let err = CommandError::from_parse(&rustdiff_core::parser::ParseError::UnknownFormat, None);
        assert_eq!(err.code, ErrorCode::DetectFailed);
    }
}

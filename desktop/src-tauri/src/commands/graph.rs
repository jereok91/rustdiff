//! Grafo del documento con el layout ya calculado.
//!
//! El núcleo separa el modelo (`build_*_graph`) de la geometría (`layout`), y
//! esa división es la que hace barato el canvas de la F6: el frontend recibe
//! posiciones finales y solo dibuja.
//!
//! Las métricas de fuente las mide el llamador (el canvas conoce su fuente); el
//! núcleo no mide tipografías. Si llegan valores absurdos (0, negativos, NaN)
//! se cae a las métricas por defecto del `LayoutConfig`, porque un `NaN` haría
//! panicar el `clamp` del layout.

use rustdiff_core::graph::{
    FontMetrics, Graph, LayoutConfig, bounds as graph_bounds, build_json_graph, build_xml_graph, layout,
};
use rustdiff_core::parser::{Format, parse_json, parse_xml};
use serde::Serialize;

use crate::commands::shared::{FormatArg, resolve_format};
use crate::error::CommandError;

/// Rectángulo que encierra el grafo ya posicionado (zoom-to-fit del canvas).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
pub struct GraphBounds {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

/// Respuesta del comando: modelo, caja y flag de truncado.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct GraphResponse {
    pub format: Format,
    pub graph: Graph,
    pub bounds: GraphBounds,
    /// `true` si el documento superó `MAX_GRAPH_NODES` (3000): el grafo está
    /// incompleto y la UI lo avisa.
    pub truncated: bool,
}

/// Construye el grafo de un documento y calcula su layout.
///
/// Solo JSON y XML tienen grafo (igual que la app GTK); SQL y texto plano
/// devuelven `UnsupportedFormat` para que la UI muestre su estado vacío.
#[tauri::command]
#[specta::specta]
pub fn build_graph(
    text: String,
    format: Option<FormatArg>,
    char_width: f64,
    row_height: f64,
) -> Result<GraphResponse, CommandError> {
    if text.trim().is_empty() {
        return Err(CommandError::need_input());
    }

    let fmt = resolve_format(format.as_ref(), &text)?;

    let mut graph = match fmt {
        Format::Json => {
            let value = parse_json(&text).map_err(|e| CommandError::from_parse(&e, None))?;
            build_json_graph(&value)
        }
        Format::Xml => {
            let root = parse_xml(&text).map_err(|e| CommandError::from_parse(&e, None))?;
            build_xml_graph(&root)
        }
        Format::Sql | Format::Text => return Err(CommandError::unsupported_format(fmt)),
    };

    let defaults = LayoutConfig::default();
    let cfg = LayoutConfig {
        metrics: FontMetrics {
            char_width: usable_metric(char_width, defaults.metrics.char_width),
            row_height: usable_metric(row_height, defaults.metrics.row_height),
        },
        ..defaults
    };
    layout(&mut graph, &cfg);

    let (min_x, min_y, max_x, max_y) = graph_bounds(&graph);
    let truncated = graph.truncated;

    Ok(GraphResponse {
        format: fmt,
        graph,
        bounds: GraphBounds {
            min_x,
            min_y,
            max_x,
            max_y,
        },
        truncated,
    })
}

/// Una métrica sirve si es finita y positiva; si no, se usa el default.
fn usable_metric(value: f64, fallback: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn sql_y_texto_no_tienen_grafo() {
        let err = build_graph("SELECT 1;".into(), Some(FormatArg::new("sql")), 8.0, 20.0).unwrap_err();
        assert_eq!(err.code, ErrorCode::UnsupportedFormat);
    }

    #[test]
    fn una_metrica_absurda_cae_al_default() {
        assert_eq!(usable_metric(f64::NAN, 8.0), 8.0);
        assert_eq!(usable_metric(0.0, 8.0), 8.0);
        assert_eq!(usable_metric(-3.0, 8.0), 8.0);
        assert_eq!(usable_metric(7.2, 8.0), 7.2);
    }
}

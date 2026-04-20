//! Exportación de resultados de diff a archivos `.txt` y `.html`.
//!
//! Genera reportes legibles de las diferencias encontradas,
//! útiles para compartir o archivar comparaciones.

use rust_i18n::t;

use crate::diff_engine::{DiffKind, DiffResult};
use crate::parser::Format;

// ─────────────────────────────────────────────
// Exportación a texto plano
// ─────────────────────────────────────────────

/// Genera un reporte de diferencias en texto plano.
pub fn export_txt(result: &DiffResult, fmt: Format) -> String {
    let mut out = String::new();

    out.push_str("═══════════════════════════════════════════\n");
    out.push_str(&format!("  {}\n", t!("export.report_title")));
    out.push_str(&format!(
        "  {}\n",
        t!("export.report_meta_format", fmt = fmt.to_string())
    ));
    out.push_str(&format!("  {}\n", result.summary()));
    out.push_str("═══════════════════════════════════════════\n\n");

    if !result.added.is_empty() {
        out.push_str(&format!(
            "{}\n",
            t!("export.section_added", count = result.added.len())
        ));
        for item in &result.added {
            out.push_str(&format!("  {item}\n"));
        }
        out.push('\n');
    }

    if !result.removed.is_empty() {
        out.push_str(&format!(
            "{}\n",
            t!("export.section_removed", count = result.removed.len())
        ));
        for item in &result.removed {
            out.push_str(&format!("  {item}\n"));
        }
        out.push('\n');
    }

    if !result.changed.is_empty() {
        out.push_str(&format!(
            "{}\n",
            t!("export.section_changed", count = result.changed.len())
        ));
        for item in &result.changed {
            out.push_str(&format!("  {item}\n"));
        }
        out.push('\n');
    }

    if result.is_empty() {
        out.push_str(&format!("  {}\n", t!("export.identical_text")));
    }

    out
}

// ─────────────────────────────────────────────
// Exportación a HTML
// ─────────────────────────────────────────────

/// Genera un reporte de diferencias en HTML con colores.
pub fn export_html(result: &DiffResult, fmt: Format, left_text: &str, right_text: &str) -> String {
    let mut out = String::new();

    let lang = rust_i18n::locale();
    out.push_str(&format!(
        "<!DOCTYPE html>\n<html lang=\"{}\">\n<head>\n",
        &*lang
    ));
    out.push_str("  <meta charset=\"UTF-8\">\n");
    out.push_str(&format!(
        "  <title>{}</title>\n",
        escape_html(&t!("export.report_title"))
    ));
    out.push_str("  <style>\n");
    out.push_str(HTML_STYLE);
    out.push_str("  </style>\n</head>\n<body>\n");

    // Encabezado
    out.push_str(&format!(
        "  <h1>{}</h1>\n",
        escape_html(&t!("export.report_title"))
    ));
    out.push_str(&format!(
        "  <p class=\"meta\">{} | {}</p>\n",
        escape_html(&t!("export.report_meta_format", fmt = fmt.to_string())),
        escape_html(&result.summary())
    ));

    // Tabla de diferencias
    if !result.is_empty() {
        out.push_str("  <table>\n");
        out.push_str("    <thead><tr>");
        out.push_str(&format!(
            "<th>{}</th><th>{}</th><th>{}</th><th>{}</th>",
            escape_html(&t!("panel.col_type")),
            escape_html(&t!("panel.col_path")),
            escape_html(&t!("panel.col_left")),
            escape_html(&t!("panel.col_right")),
        ));
        out.push_str("</tr></thead>\n    <tbody>\n");

        for item in result.all_items() {
            let css_class = match item.kind {
                DiffKind::Added => "added",
                DiffKind::Removed => "removed",
                DiffKind::Changed => "changed",
            };
            out.push_str(&format!("      <tr class=\"{css_class}\">"));
            out.push_str(&format!("<td>{}</td>", escape_html(&item.kind.to_string())));
            out.push_str(&format!(
                "<td><code>{}</code></td>",
                escape_html(&item.path)
            ));
            out.push_str(&format!(
                "<td>{}</td>",
                escape_html(item.left.as_deref().unwrap_or(""))
            ));
            out.push_str(&format!(
                "<td>{}</td>",
                escape_html(item.right.as_deref().unwrap_or(""))
            ));
            out.push_str("</tr>\n");
        }

        out.push_str("    </tbody>\n  </table>\n");
    } else {
        out.push_str(&format!(
            "  <p class=\"identical\">{}</p>\n",
            escape_html(&t!("export.identical_text"))
        ));
    }

    // Documentos originales (colapsables)
    out.push_str(&format!(
        "  <details>\n    <summary>{}</summary>\n",
        escape_html(&t!("export.html_left"))
    ));
    out.push_str(&format!(
        "    <pre><code>{}</code></pre>\n",
        escape_html(left_text)
    ));
    out.push_str("  </details>\n");

    out.push_str(&format!(
        "  <details>\n    <summary>{}</summary>\n",
        escape_html(&t!("export.html_right"))
    ));
    out.push_str(&format!(
        "    <pre><code>{}</code></pre>\n",
        escape_html(right_text)
    ));
    out.push_str("  </details>\n");

    out.push_str("</body>\n</html>\n");
    out
}

/// Escapa caracteres especiales para HTML.
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

const HTML_STYLE: &str = r#"
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 1200px; margin: 2rem auto; padding: 0 1rem;
      color: #333; background: #fafafa;
    }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
    .meta { color: #666; }
    .identical { color: #27ae60; font-weight: bold; }
    table {
      width: 100%; border-collapse: collapse; margin: 1rem 0;
      font-size: 0.9rem;
    }
    th { background: #34495e; color: white; padding: 0.5rem; text-align: left; }
    td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #ddd; word-break: break-word; }
    code { font-family: "Fira Code", "Cascadia Code", monospace; font-size: 0.85rem; }
    tr.added { background: rgba(46, 204, 113, 0.15); }
    tr.removed { background: rgba(231, 76, 60, 0.15); }
    tr.changed { background: rgba(241, 196, 15, 0.15); }
    details { margin: 1rem 0; }
    summary { cursor: pointer; font-weight: bold; color: #2c3e50; }
    pre {
      background: #2c3e50; color: #ecf0f1; padding: 1rem;
      border-radius: 4px; overflow-x: auto; font-size: 0.85rem;
    }
"#;

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff_engine::{DiffItem, diff_json};
    use serde_json::json;

    #[test]
    fn txt_documentos_identicos() {
        let result = DiffResult::default();
        let txt = export_txt(&result, Format::Json);
        assert!(txt.contains("identical"));
        assert!(txt.contains("JSON"));
    }

    #[test]
    fn txt_con_diferencias() {
        let left = json!({"a": 1, "b": 2});
        let right = json!({"a": 10, "c": 3});
        let result = diff_json(&left, &right);
        let txt = export_txt(&result, Format::Json);

        assert!(txt.contains("ADDED"));
        assert!(txt.contains("REMOVED"));
        assert!(txt.contains("CHANGED"));
        assert!(txt.contains("$.a"));
    }

    #[test]
    fn html_estructura_valida() {
        let left = json!({"x": 1});
        let right = json!({"x": 2, "y": 3});
        let result = diff_json(&left, &right);
        let html = export_html(&result, Format::Json, r#"{"x":1}"#, r#"{"x":2,"y":3}"#);

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("</html>"));
        assert!(html.contains("<table>"));
        assert!(html.contains("class=\"changed\""));
        assert!(html.contains("class=\"added\""));
    }

    #[test]
    fn html_escapa_caracteres() {
        let item = DiffItem {
            path: "$.html".into(),
            kind: DiffKind::Changed,
            left: Some("<b>old</b>".into()),
            right: Some("<b>new</b>".into()),
        };
        let result = DiffResult {
            added: vec![],
            removed: vec![],
            changed: vec![item],
        };
        let html = export_html(&result, Format::Json, "<b>old</b>", "<b>new</b>");
        // No debe contener tags HTML crudos del contenido
        assert!(!html.contains("<b>old</b></td>"));
        assert!(html.contains("&lt;b&gt;old&lt;/b&gt;"));
    }

    #[test]
    fn html_documentos_identicos() {
        let result = DiffResult::default();
        let html = export_html(&result, Format::Xml, "<r/>", "<r/>");
        assert!(html.contains("identical"));
        assert!(!html.contains("<table>"));
    }

    #[test]
    fn txt_formato_xml() {
        let result = DiffResult::default();
        let txt = export_txt(&result, Format::Xml);
        assert!(txt.contains("XML"));
    }
}

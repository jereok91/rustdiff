//! Resaltado visual de diferencias directamente en los editores SourceView.
//!
//! Cuando se ejecuta una comparación, este módulo busca las regiones afectadas
//! en el texto de cada editor y les aplica `GtkTextTag` con colores de fondo,
//! creando un efecto visual similar a un diff de código.
//!
//! Estrategia:
//! - Para cada `DiffItem`, extraemos el segmento de su ruta que identifica
//!   la clave o valor en el texto formateado (pretty-printed).
//! - Buscamos ese fragmento en el buffer y aplicamos un tag de color.
//! - También usamos `similar` para diff línea-por-línea como complemento
//!   del diff semántico, resaltando las líneas exactas que difieren.

use gtk4 as gtk;
use gtk::prelude::*;
use similar::{ChangeTag, TextDiff};
use sourceview5 as sv;

use crate::diff_engine::{DiffItem, DiffKind, DiffResult};

// ─────────────────────────────────────────────
// Nombres de los TextTags
// ─────────────────────────────────────────────

const TAG_ADDED: &str = "rustdiff-added";
const TAG_REMOVED: &str = "rustdiff-removed";
const TAG_CHANGED: &str = "rustdiff-changed";

// ─────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────

/// Aplica resaltado visual en ambos editores basándose en el resultado del diff.
///
/// Combina dos estrategias:
/// 1. **Diff línea-por-línea** (via `similar`): resalta líneas completas que
///    difieren entre los dos textos. Esto da una vista general inmediata.
/// 2. **Resaltado por ruta semántica**: busca valores específicos del `DiffItem`
///    en el texto y los marca con mayor precisión.
pub fn apply_highlights(
    left_view: &sv::View,
    right_view: &sv::View,
    left_text: &str,
    right_text: &str,
    diff_result: &DiffResult,
) {
    let left_buf = left_view.buffer();
    let right_buf = right_view.buffer();

    // Limpiar tags anteriores
    clear_highlights(&left_buf);
    clear_highlights(&right_buf);

    // Asegurar que los tags existen en ambos buffers
    ensure_tags(&left_buf);
    ensure_tags(&right_buf);

    // 1. Diff línea-por-línea con `similar` para resaltado general
    apply_line_diff(&left_buf, &right_buf, left_text, right_text);

    // 2. Resaltado preciso por valor semántico
    apply_semantic_highlights(&left_buf, left_text, diff_result, Side::Left);
    apply_semantic_highlights(&right_buf, right_text, diff_result, Side::Right);
}

/// Elimina todo el resaltado de diferencias de un buffer.
pub fn clear_highlights(buffer: &gtk::TextBuffer) {
    let start = buffer.start_iter();
    let end = buffer.end_iter();

    buffer.remove_tag_by_name(TAG_ADDED, &start, &end);
    buffer.remove_tag_by_name(TAG_REMOVED, &start, &end);
    buffer.remove_tag_by_name(TAG_CHANGED, &start, &end);
}

/// Hace scroll en un SourceView hasta la primera ocurrencia de `search_text`.
/// Devuelve `true` si encontró el texto.
pub fn scroll_to_text(view: &sv::View, search_text: &str) -> bool {
    let buffer = view.buffer();
    let start = buffer.start_iter();

    if let Some((match_start, match_end)) = start.forward_search(
        search_text,
        gtk::TextSearchFlags::CASE_INSENSITIVE,
        None,
    ) {
        // Colocar el cursor en la coincidencia
        buffer.place_cursor(&match_start);
        // Seleccionar el texto encontrado
        buffer.select_range(&match_start, &match_end);
        // Hacer scroll hasta la marca del cursor
        view.scroll_to_iter(&mut match_start.clone(), 0.1, false, 0.0, 0.0);
        true
    } else {
        false
    }
}

/// Busca y resalta un `DiffItem` específico en ambos editores.
/// Se usa cuando el usuario hace click en una fila del panel de diferencias.
pub fn highlight_and_scroll_to_item(
    left_view: &sv::View,
    right_view: &sv::View,
    item: &DiffItem,
) {
    // Buscar en el panel izquierdo (valor eliminado o cambiado)
    if let Some(ref left_val) = item.left {
        let search = clean_search_value(left_val);
        scroll_to_text(left_view, &search);
    }

    // Buscar en el panel derecho (valor añadido o cambiado)
    if let Some(ref right_val) = item.right {
        let search = clean_search_value(right_val);
        scroll_to_text(right_view, &search);
    }

    // Si no hay valor (solo ruta), buscar la clave en ambos paneles
    if item.left.is_none() && item.right.is_none() {
        let key = extract_key_from_path(&item.path);
        scroll_to_text(left_view, &key);
        scroll_to_text(right_view, &key);
    }
}

// ─────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────

#[derive(Clone, Copy)]
enum Side {
    Left,
    Right,
}

// ─────────────────────────────────────────────
// Funciones internas
// ─────────────────────────────────────────────

/// Crea los `GtkTextTag` necesarios si aún no existen en el buffer.
fn ensure_tags(buffer: &gtk::TextBuffer) {
    let table = buffer.tag_table();

    if table.lookup(TAG_ADDED).is_none() {
        let tag = gtk::TextTag::builder()
            .name(TAG_ADDED)
            .background("rgba(0,200,0,0.15)")
            .paragraph_background("rgba(0,200,0,0.08)")
            .build();
        table.add(&tag);
    }

    if table.lookup(TAG_REMOVED).is_none() {
        let tag = gtk::TextTag::builder()
            .name(TAG_REMOVED)
            .background("rgba(200,0,0,0.15)")
            .paragraph_background("rgba(200,0,0,0.08)")
            .build();
        table.add(&tag);
    }

    if table.lookup(TAG_CHANGED).is_none() {
        let tag = gtk::TextTag::builder()
            .name(TAG_CHANGED)
            .background("rgba(200,200,0,0.15)")
            .paragraph_background("rgba(200,200,0,0.08)")
            .build();
        table.add(&tag);
    }
}

/// Diff línea-por-línea entre los dos textos usando `similar`.
/// Resalta líneas completas que fueron añadidas, eliminadas o cambiadas.
fn apply_line_diff(
    left_buf: &gtk::TextBuffer,
    right_buf: &gtk::TextBuffer,
    left_text: &str,
    right_text: &str,
) {
    let diff = TextDiff::from_lines(left_text, right_text);

    // Rastrear la línea actual en cada buffer
    let mut left_line: i32 = 0;
    let mut right_line: i32 = 0;

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {
                // Línea sin cambios: avanzar ambos contadores
                left_line += 1;
                right_line += 1;
            }
            ChangeTag::Delete => {
                // Línea eliminada (solo en el izquierdo)
                tag_line(left_buf, left_line, TAG_REMOVED);
                left_line += 1;
            }
            ChangeTag::Insert => {
                // Línea añadida (solo en el derecho)
                tag_line(right_buf, right_line, TAG_ADDED);
                right_line += 1;
            }
        }
    }
}

/// Aplica un tag a una línea completa del buffer.
fn tag_line(buffer: &gtk::TextBuffer, line: i32, tag_name: &str) {
    let total_lines = buffer.line_count();
    if line >= total_lines {
        return;
    }

    let start = buffer.iter_at_line(line);
    let end = buffer.iter_at_line(line);

    // Algunas versiones de gtk4-rs devuelven Option<TextIter>
    // y otras devuelven bool + modifican in-place.
    // Usamos iter_at_line que devuelve Option en gtk4 0.9+
    if let (Some(ref mut s), Some(ref mut e)) = (start, end) {
        e.forward_to_line_end();
        buffer.apply_tag_by_name(tag_name, s, e);
    }
}

/// Resaltado semántico: busca valores específicos del diff en el texto del editor.
fn apply_semantic_highlights(
    buffer: &gtk::TextBuffer,
    _text: &str,
    diff_result: &DiffResult,
    side: Side,
) {
    // Para cada item del diff, buscar su valor en el texto
    let items = match side {
        Side::Left => {
            // En el lado izquierdo: resaltar removed y changed (valor viejo)
            diff_result
                .removed
                .iter()
                .chain(diff_result.changed.iter())
                .collect::<Vec<_>>()
        }
        Side::Right => {
            // En el lado derecho: resaltar added y changed (valor nuevo)
            diff_result
                .added
                .iter()
                .chain(diff_result.changed.iter())
                .collect::<Vec<_>>()
        }
    };

    for item in items {
        let (search_value, tag_name) = match side {
            Side::Left => {
                let val = item.left.as_deref().unwrap_or_default();
                let tag = match item.kind {
                    DiffKind::Removed => TAG_REMOVED,
                    DiffKind::Changed => TAG_CHANGED,
                    _ => continue,
                };
                (val, tag)
            }
            Side::Right => {
                let val = item.right.as_deref().unwrap_or_default();
                let tag = match item.kind {
                    DiffKind::Added => TAG_ADDED,
                    DiffKind::Changed => TAG_CHANGED,
                    _ => continue,
                };
                (val, tag)
            }
        };

        if search_value.is_empty() {
            continue;
        }

        // Limpiar comillas para búsqueda en el texto formateado
        let clean = clean_search_value(search_value);
        if clean.is_empty() {
            continue;
        }

        // Buscar y marcar la primera ocurrencia en el buffer
        highlight_first_occurrence(buffer, &clean, tag_name);

        // También intentar buscar con la clave completa "key": value
        let key = extract_key_from_path(&item.path);
        if !key.is_empty() {
            // Buscar patrones tipo "key": valor o <key>valor</key>
            let json_pattern = format!("\"{key}\"");
            highlight_first_occurrence(buffer, &json_pattern, tag_name);
        }
    }
}

/// Busca la primera ocurrencia de `needle` en el buffer y aplica el tag.
fn highlight_first_occurrence(buffer: &gtk::TextBuffer, needle: &str, tag_name: &str) {
    let start_iter = buffer.start_iter();

    if let Some((match_start, match_end)) = start_iter.forward_search(
        needle,
        gtk::TextSearchFlags::CASE_INSENSITIVE,
        None,
    ) {
        buffer.apply_tag_by_name(tag_name, &match_start, &match_end);
    }
}

/// Limpia un valor de búsqueda eliminando comillas JSON externas.
fn clean_search_value(value: &str) -> String {
    let trimmed = value.trim();
    // Quitar comillas envolventes de strings JSON
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        trimmed[1..trimmed.len() - 1].to_string()
    } else {
        trimmed.to_string()
    }
}

/// Extrae el último segmento de una ruta de diff como nombre de clave.
/// Ejemplo: `"$.usuario.perfil.ciudad"` → `"ciudad"`
/// Ejemplo: `"config.db[@host]"` → `"host"`
/// Ejemplo: `"$.users[0].nombre"` → `"nombre"`
fn extract_key_from_path(path: &str) -> String {
    // Manejar atributos XML: [@attr] al final
    if let Some(start) = path.rfind("[@") {
        if let Some(end) = path[start..].find(']') {
            return path[start + 2..start + end].to_string();
        }
    }

    // Manejar texto XML: [text] al final
    if path.ends_with("[text]") {
        let without_text = path.trim_end_matches(".[text]");
        return extract_last_segment(without_text);
    }

    // Tomar el último segmento separado por '.'
    let last = path.rsplit('.').next().unwrap_or(path);

    // Si el último segmento termina con índice de array [N], quitarlo
    if let Some(bracket) = last.rfind('[') {
        let name = &last[..bracket];
        if !name.is_empty() {
            return name.to_string();
        }
    }

    last.to_string()
}

/// Extrae el último segmento separado por `.`
fn extract_last_segment(path: &str) -> String {
    path.rsplit('.')
        .next()
        .unwrap_or(path)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_search_value_quita_comillas() {
        assert_eq!(clean_search_value("\"hola\""), "hola");
        assert_eq!(clean_search_value("42"), "42");
        assert_eq!(clean_search_value("  \"test\"  "), "test");
        assert_eq!(clean_search_value("null"), "null");
    }

    #[test]
    fn extract_key_ruta_json() {
        assert_eq!(extract_key_from_path("$.usuario.perfil.ciudad"), "ciudad");
        assert_eq!(extract_key_from_path("$.data"), "data");
        assert_eq!(extract_key_from_path("$"), "$");
    }

    #[test]
    fn extract_key_ruta_con_indice() {
        assert_eq!(extract_key_from_path("$.users[0].nombre"), "nombre");
        assert_eq!(extract_key_from_path("$.items[2]"), "items");
    }

    #[test]
    fn extract_key_ruta_xml_atributo() {
        assert_eq!(extract_key_from_path("server[@version]"), "version");
        assert_eq!(extract_key_from_path("config.db[@host]"), "host");
    }

    #[test]
    fn extract_key_ruta_xml_texto() {
        assert_eq!(extract_key_from_path("config.db.host.[text]"), "host");
        assert_eq!(extract_key_from_path("root.[text]"), "root");
    }
}

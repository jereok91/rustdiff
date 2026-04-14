//! Motor de diferencias semánticas para JSON y XML.
//!
//! A diferencia de un diff línea-por-línea (como `git diff`), este módulo
//! compara la **estructura** de los documentos:
//! - JSON: compara clave por clave en objetos, índice por índice en arrays.
//! - XML: compara nodos por tag, atributos y contenido de texto.
//!
//! Cada diferencia incluye la ruta (path) al elemento afectado,
//! permitiendo localización precisa en documentos profundamente anidados.

use crate::parser::{XmlChild, XmlNode};
use serde_json::Value as JsonValue;
use std::collections::BTreeSet;
use std::fmt;

// ─────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────

/// Tipo de diferencia detectada entre dos documentos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffKind {
    /// El elemento existe solo en el documento derecho (fue añadido).
    Added,
    /// El elemento existe solo en el documento izquierdo (fue eliminado).
    Removed,
    /// El elemento existe en ambos pero con valor distinto.
    Changed,
}

/// Una diferencia individual entre dos documentos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffItem {
    /// Ruta al elemento afectado, usando notación de puntos.
    /// Ejemplo: `"persona.direccion.calle"` o `"usuarios[2].nombre"`
    pub path: String,
    /// Tipo de diferencia.
    pub kind: DiffKind,
    /// Valor en el documento izquierdo (None si fue añadido).
    pub left: Option<String>,
    /// Valor en el documento derecho (None si fue eliminado).
    pub right: Option<String>,
}

/// Resultado completo de una comparación entre dos documentos.
#[derive(Debug, Clone, Default)]
pub struct DiffResult {
    /// Elementos presentes solo en el documento derecho.
    pub added: Vec<DiffItem>,
    /// Elementos presentes solo en el documento izquierdo.
    pub removed: Vec<DiffItem>,
    /// Elementos con valores diferentes entre ambos documentos.
    pub changed: Vec<DiffItem>,
}

// ─────────────────────────────────────────────
// Implementaciones de Display
// ─────────────────────────────────────────────

impl fmt::Display for DiffKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DiffKind::Added => write!(f, "ADDED"),
            DiffKind::Removed => write!(f, "REMOVED"),
            DiffKind::Changed => write!(f, "CHANGED"),
        }
    }
}

impl fmt::Display for DiffItem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.kind {
            DiffKind::Added => {
                write!(f, "[+] {} = {}", self.path, self.right.as_deref().unwrap_or(""))
            }
            DiffKind::Removed => {
                write!(f, "[-] {} = {}", self.path, self.left.as_deref().unwrap_or(""))
            }
            DiffKind::Changed => {
                write!(
                    f,
                    "[~] {} : {} → {}",
                    self.path,
                    self.left.as_deref().unwrap_or(""),
                    self.right.as_deref().unwrap_or("")
                )
            }
        }
    }
}

impl DiffResult {
    /// Número total de diferencias encontradas.
    pub fn total(&self) -> usize {
        self.added.len() + self.removed.len() + self.changed.len()
    }

    /// Devuelve `true` si no hay ninguna diferencia.
    pub fn is_empty(&self) -> bool {
        self.total() == 0
    }

    /// Devuelve todas las diferencias en una sola lista, ordenadas por ruta.
    pub fn all_items(&self) -> Vec<&DiffItem> {
        let mut items: Vec<&DiffItem> = self
            .added
            .iter()
            .chain(self.removed.iter())
            .chain(self.changed.iter())
            .collect();
        items.sort_by(|a, b| a.path.cmp(&b.path));
        items
    }

    /// Resumen textual de las diferencias (para la barra de estado).
    pub fn summary(&self) -> String {
        if self.is_empty() {
            "Los documentos son idénticos".into()
        } else {
            format!(
                "{} diferencia(s): {} añadida(s), {} eliminada(s), {} modificada(s)",
                self.total(),
                self.added.len(),
                self.removed.len(),
                self.changed.len()
            )
        }
    }
}

// ─────────────────────────────────────────────
// Diff semántico para JSON
// ─────────────────────────────────────────────

/// Compara dos valores JSON de forma semántica (estructura, no texto).
///
/// Recorre recursivamente objetos y arrays, reportando diferencias
/// con rutas completas tipo `"root.key.subkey"` o `"root[0].field"`.
pub fn diff_json(left: &JsonValue, right: &JsonValue) -> DiffResult {
    let mut result = DiffResult::default();
    compare_json_values(left, right, "$", &mut result);
    result
}

/// Compara recursivamente dos valores JSON y acumula diferencias.
fn compare_json_values(
    left: &JsonValue,
    right: &JsonValue,
    path: &str,
    result: &mut DiffResult,
) {
    // Si son iguales, no hay nada que reportar
    if left == right {
        return;
    }

    match (left, right) {
        // Ambos son objetos: comparar clave por clave
        (JsonValue::Object(left_map), JsonValue::Object(right_map)) => {
            // Recopilar todas las claves de ambos lados
            let all_keys: BTreeSet<&String> =
                left_map.keys().chain(right_map.keys()).collect();

            for key in all_keys {
                let child_path = format!("{path}.{key}");
                match (left_map.get(key), right_map.get(key)) {
                    (Some(lv), Some(rv)) => {
                        // Clave existe en ambos: comparar recursivamente
                        compare_json_values(lv, rv, &child_path, result);
                    }
                    (Some(lv), None) => {
                        // Clave solo en el izquierdo: fue eliminada
                        result.removed.push(DiffItem {
                            path: child_path,
                            kind: DiffKind::Removed,
                            left: Some(value_to_compact_string(lv)),
                            right: None,
                        });
                    }
                    (None, Some(rv)) => {
                        // Clave solo en el derecho: fue añadida
                        result.added.push(DiffItem {
                            path: child_path,
                            kind: DiffKind::Added,
                            left: None,
                            right: Some(value_to_compact_string(rv)),
                        });
                    }
                    (None, None) => unreachable!(),
                }
            }
        }

        // Ambos son arrays: comparar índice por índice
        (JsonValue::Array(left_arr), JsonValue::Array(right_arr)) => {
            let max_len = left_arr.len().max(right_arr.len());
            for i in 0..max_len {
                let child_path = format!("{path}[{i}]");
                match (left_arr.get(i), right_arr.get(i)) {
                    (Some(lv), Some(rv)) => {
                        compare_json_values(lv, rv, &child_path, result);
                    }
                    (Some(lv), None) => {
                        // Elemento solo en el izquierdo (array derecho es más corto)
                        result.removed.push(DiffItem {
                            path: child_path,
                            kind: DiffKind::Removed,
                            left: Some(value_to_compact_string(lv)),
                            right: None,
                        });
                    }
                    (None, Some(rv)) => {
                        // Elemento solo en el derecho (array izquierdo es más corto)
                        result.added.push(DiffItem {
                            path: child_path,
                            kind: DiffKind::Added,
                            left: None,
                            right: Some(value_to_compact_string(rv)),
                        });
                    }
                    (None, None) => unreachable!(),
                }
            }
        }

        // Tipos distintos o valores primitivos distintos → Changed
        _ => {
            result.changed.push(DiffItem {
                path: path.to_string(),
                kind: DiffKind::Changed,
                left: Some(value_to_compact_string(left)),
                right: Some(value_to_compact_string(right)),
            });
        }
    }
}

/// Convierte un `JsonValue` en su representación compacta como String.
/// Para strings, incluye las comillas; para otros tipos, usa formato JSON.
fn value_to_compact_string(value: &JsonValue) -> String {
    match value {
        JsonValue::Null => "null".into(),
        JsonValue::Bool(b) => b.to_string(),
        JsonValue::Number(n) => n.to_string(),
        JsonValue::String(s) => format!("\"{s}\""),
        // Objetos y arrays se muestran en formato compacto
        _ => serde_json::to_string(value).unwrap_or_else(|_| format!("{value:?}")),
    }
}

// ─────────────────────────────────────────────
// Diff semántico para XML
// ─────────────────────────────────────────────

/// Compara dos árboles XML de forma semántica.
///
/// Compara nodos por posición dentro de su padre, verificando:
/// tag, atributos, texto y nodos hijos recursivamente.
pub fn diff_xml(left: &XmlNode, right: &XmlNode) -> DiffResult {
    let mut result = DiffResult::default();
    compare_xml_nodes(left, right, &left.tag, &mut result);
    result
}

/// Compara recursivamente dos nodos XML y acumula diferencias.
fn compare_xml_nodes(
    left: &XmlNode,
    right: &XmlNode,
    path: &str,
    result: &mut DiffResult,
) {
    // 1. Comparar nombre de etiqueta
    if left.tag != right.tag {
        result.changed.push(DiffItem {
            path: path.to_string(),
            kind: DiffKind::Changed,
            left: Some(format!("<{}>", left.tag)),
            right: Some(format!("<{}>", right.tag)),
        });
        // Si los tags difieren, no tiene sentido comparar contenido
        return;
    }

    // 2. Comparar atributos
    compare_attributes(&left.attributes, &right.attributes, path, result);

    // 3. Comparar texto directo
    let left_text = direct_text(left);
    let right_text = direct_text(right);
    if left_text != right_text {
        if left_text.is_empty() && !right_text.is_empty() {
            result.added.push(DiffItem {
                path: format!("{path}.[text]"),
                kind: DiffKind::Added,
                left: None,
                right: Some(right_text),
            });
        } else if !left_text.is_empty() && right_text.is_empty() {
            result.removed.push(DiffItem {
                path: format!("{path}.[text]"),
                kind: DiffKind::Removed,
                left: Some(left_text),
                right: None,
            });
        } else {
            result.changed.push(DiffItem {
                path: format!("{path}.[text]"),
                kind: DiffKind::Changed,
                left: Some(left_text),
                right: Some(right_text),
            });
        }
    }

    // 4. Comparar nodos hijos por posición
    let left_children = child_nodes(left);
    let right_children = child_nodes(right);
    let max_len = left_children.len().max(right_children.len());

    for i in 0..max_len {
        match (left_children.get(i), right_children.get(i)) {
            (Some(ln), Some(rn)) => {
                // Construir ruta: si el hijo tiene el mismo tag que otros hermanos,
                // añadir índice para distinguir
                let child_path = build_child_path(path, &ln.tag, i, &left_children, &right_children);
                compare_xml_nodes(ln, rn, &child_path, result);
            }
            (Some(ln), None) => {
                let child_path = format!("{path}.{}", ln.tag);
                result.removed.push(DiffItem {
                    path: child_path,
                    kind: DiffKind::Removed,
                    left: Some(summarize_xml_node(ln)),
                    right: None,
                });
            }
            (None, Some(rn)) => {
                let child_path = format!("{path}.{}", rn.tag);
                result.added.push(DiffItem {
                    path: child_path,
                    kind: DiffKind::Added,
                    left: None,
                    right: Some(summarize_xml_node(rn)),
                });
            }
            (None, None) => unreachable!(),
        }
    }
}

/// Compara atributos entre dos nodos XML.
fn compare_attributes(
    left_attrs: &[(String, String)],
    right_attrs: &[(String, String)],
    path: &str,
    result: &mut DiffResult,
) {
    // Recopilar todas las claves de atributo de ambos lados
    let all_keys: BTreeSet<&str> = left_attrs
        .iter()
        .map(|(k, _)| k.as_str())
        .chain(right_attrs.iter().map(|(k, _)| k.as_str()))
        .collect();

    for key in all_keys {
        let left_val = left_attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str());
        let right_val = right_attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str());
        let attr_path = format!("{path}[@{key}]");

        match (left_val, right_val) {
            (Some(lv), Some(rv)) if lv != rv => {
                result.changed.push(DiffItem {
                    path: attr_path,
                    kind: DiffKind::Changed,
                    left: Some(lv.to_string()),
                    right: Some(rv.to_string()),
                });
            }
            (Some(lv), None) => {
                result.removed.push(DiffItem {
                    path: attr_path,
                    kind: DiffKind::Removed,
                    left: Some(lv.to_string()),
                    right: None,
                });
            }
            (None, Some(rv)) => {
                result.added.push(DiffItem {
                    path: attr_path,
                    kind: DiffKind::Added,
                    left: None,
                    right: Some(rv.to_string()),
                });
            }
            _ => {} // Iguales o ambos ausentes
        }
    }
}

/// Extrae el texto directo de un nodo (sin incluir texto de hijos).
fn direct_text(node: &XmlNode) -> String {
    node.children
        .iter()
        .filter_map(|c| match c {
            XmlChild::Text(t) => Some(t.as_str()),
            XmlChild::Node(_) => None,
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Extrae solo los nodos hijos (sin fragmentos de texto).
fn child_nodes(node: &XmlNode) -> Vec<&XmlNode> {
    node.children
        .iter()
        .filter_map(|c| match c {
            XmlChild::Node(n) => Some(n),
            XmlChild::Text(_) => None,
        })
        .collect()
}

/// Construye la ruta para un nodo hijo, añadiendo índice si hay
/// hermanos con el mismo tag (ej. `biblioteca.libro[0]` vs `biblioteca.libro[1]`).
fn build_child_path(
    parent_path: &str,
    tag: &str,
    index: usize,
    left_children: &[&XmlNode],
    right_children: &[&XmlNode],
) -> String {
    // Contar cuántos hermanos comparten el mismo tag en ambos lados
    let count_left = left_children.iter().filter(|n| n.tag == tag).count();
    let count_right = right_children.iter().filter(|n| n.tag == tag).count();

    if count_left > 1 || count_right > 1 {
        format!("{parent_path}.{tag}[{index}]")
    } else {
        format!("{parent_path}.{tag}")
    }
}

/// Genera un resumen corto de un nodo XML (para mostrar en la UI).
fn summarize_xml_node(node: &XmlNode) -> String {
    let text = direct_text(node);
    let child_count = child_nodes(node).len();
    let attr_count = node.attributes.len();

    let mut parts = vec![format!("<{}>", node.tag)];
    if !text.is_empty() {
        // Truncar texto largo
        if text.len() > 50 {
            parts.push(format!("\"{}...\"", &text[..47]));
        } else {
            parts.push(format!("\"{text}\""));
        }
    }
    if attr_count > 0 {
        parts.push(format!("{attr_count} attr(s)"));
    }
    if child_count > 0 {
        parts.push(format!("{child_count} hijo(s)"));
    }
    parts.join(" ")
}

// ─────────────────────────────────────────────
// Tests unitarios
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── JSON: documentos idénticos ──────────────

    #[test]
    fn json_identicos_sin_diferencias() {
        let left = json!({"a": 1, "b": "dos", "c": [1, 2, 3]});
        let right = json!({"a": 1, "b": "dos", "c": [1, 2, 3]});
        let result = diff_json(&left, &right);
        assert!(result.is_empty());
        assert_eq!(result.total(), 0);
        assert_eq!(result.summary(), "Los documentos son idénticos");
    }

    // ── JSON: valores primitivos cambiados ──────

    #[test]
    fn json_valor_cambiado() {
        let left = json!({"nombre": "Juan", "edad": 30});
        let right = json!({"nombre": "Juan", "edad": 31});
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "$.edad");
        assert_eq!(result.changed[0].left.as_deref(), Some("30"));
        assert_eq!(result.changed[0].right.as_deref(), Some("31"));
    }

    #[test]
    fn json_tipo_cambiado() {
        // Número a string: cambio de tipo
        let left = json!({"valor": 42});
        let right = json!({"valor": "cuarenta y dos"});
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "$.valor");
    }

    #[test]
    fn json_null_a_valor() {
        let left = json!({"campo": null});
        let right = json!({"campo": "ahora tiene valor"});
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1);
    }

    // ── JSON: claves añadidas y eliminadas ──────

    #[test]
    fn json_clave_añadida() {
        let left = json!({"a": 1});
        let right = json!({"a": 1, "b": 2});
        let result = diff_json(&left, &right);
        assert_eq!(result.added.len(), 1);
        assert_eq!(result.added[0].path, "$.b");
        assert_eq!(result.added[0].right.as_deref(), Some("2"));
        assert!(result.removed.is_empty());
        assert!(result.changed.is_empty());
    }

    #[test]
    fn json_clave_eliminada() {
        let left = json!({"a": 1, "b": 2});
        let right = json!({"a": 1});
        let result = diff_json(&left, &right);
        assert_eq!(result.removed.len(), 1);
        assert_eq!(result.removed[0].path, "$.b");
        assert_eq!(result.removed[0].left.as_deref(), Some("2"));
    }

    #[test]
    fn json_multiples_cambios() {
        let left = json!({"a": 1, "b": 2, "c": 3});
        let right = json!({"a": 1, "b": 20, "d": 4});
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1); // b: 2 → 20
        assert_eq!(result.removed.len(), 1); // c eliminada
        assert_eq!(result.added.len(), 1);   // d añadida
        assert_eq!(result.total(), 3);
    }

    // ── JSON: arrays ────────────────────────────

    #[test]
    fn json_array_elemento_cambiado() {
        let left = json!([1, 2, 3]);
        let right = json!([1, 99, 3]);
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "$[1]");
    }

    #[test]
    fn json_array_mas_largo_derecho() {
        let left = json!([1, 2]);
        let right = json!([1, 2, 3, 4]);
        let result = diff_json(&left, &right);
        assert_eq!(result.added.len(), 2);
        assert_eq!(result.added[0].path, "$[2]");
        assert_eq!(result.added[1].path, "$[3]");
    }

    #[test]
    fn json_array_mas_largo_izquierdo() {
        let left = json!([1, 2, 3]);
        let right = json!([1]);
        let result = diff_json(&left, &right);
        assert_eq!(result.removed.len(), 2);
    }

    // ── JSON: objetos anidados ──────────────────

    #[test]
    fn json_anidado_cambio_profundo() {
        let left = json!({
            "usuario": {
                "perfil": {
                    "nombre": "Ana",
                    "ciudad": "Madrid"
                }
            }
        });
        let right = json!({
            "usuario": {
                "perfil": {
                    "nombre": "Ana",
                    "ciudad": "Barcelona"
                }
            }
        });
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "$.usuario.perfil.ciudad");
        assert_eq!(result.changed[0].left.as_deref(), Some("\"Madrid\""));
        assert_eq!(result.changed[0].right.as_deref(), Some("\"Barcelona\""));
    }

    #[test]
    fn json_anidado_seccion_nueva() {
        let left = json!({"config": {"debug": true}});
        let right = json!({"config": {"debug": true, "logging": {"level": "info"}}});
        let result = diff_json(&left, &right);
        assert_eq!(result.added.len(), 1);
        assert_eq!(result.added[0].path, "$.config.logging");
        // El valor añadido debe ser el objeto completo en formato compacto
        assert!(result.added[0].right.as_ref().unwrap().contains("level"));
    }

    #[test]
    fn json_array_de_objetos() {
        let left = json!([
            {"id": 1, "nombre": "A"},
            {"id": 2, "nombre": "B"}
        ]);
        let right = json!([
            {"id": 1, "nombre": "A"},
            {"id": 2, "nombre": "B-modificado"}
        ]);
        let result = diff_json(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "$[1].nombre");
    }

    // ── JSON: cambio de tipo estructural ────────

    #[test]
    fn json_objeto_a_array() {
        let left = json!({"data": {"key": "value"}});
        let right = json!({"data": [1, 2, 3]});
        let result = diff_json(&left, &right);
        // Un objeto cambiado a array es un "Changed" en esa ruta
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "$.data");
    }

    // ── JSON: all_items ordenado ────────────────

    #[test]
    fn json_all_items_ordenados_por_ruta() {
        let left = json!({"z": 1, "a": 2, "m": 3});
        let right = json!({"z": 10, "a": 20, "m": 30});
        let result = diff_json(&left, &right);
        let items = result.all_items();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].path, "$.a");
        assert_eq!(items[1].path, "$.m");
        assert_eq!(items[2].path, "$.z");
    }

    // ── JSON: Display para DiffItem ─────────────

    #[test]
    fn diff_item_display() {
        let added = DiffItem {
            path: "$.nuevo".into(),
            kind: DiffKind::Added,
            left: None,
            right: Some("42".into()),
        };
        assert_eq!(format!("{added}"), "[+] $.nuevo = 42");

        let removed = DiffItem {
            path: "$.viejo".into(),
            kind: DiffKind::Removed,
            left: Some("\"hola\"".into()),
            right: None,
        };
        assert_eq!(format!("{removed}"), "[-] $.viejo = \"hola\"");

        let changed = DiffItem {
            path: "$.campo".into(),
            kind: DiffKind::Changed,
            left: Some("1".into()),
            right: Some("2".into()),
        };
        assert_eq!(format!("{changed}"), "[~] $.campo : 1 → 2");
    }

    // ── XML: nodos idénticos ────────────────────

    #[test]
    fn xml_identicos_sin_diferencias() {
        let left = XmlNode {
            tag: "raiz".into(),
            attributes: vec![("id".into(), "1".into())],
            children: vec![XmlChild::Text("hola".into())],
        };
        let right = left.clone();
        let result = diff_xml(&left, &right);
        assert!(result.is_empty());
    }

    // ── XML: texto cambiado ─────────────────────

    #[test]
    fn xml_texto_cambiado() {
        let left = XmlNode {
            tag: "msg".into(),
            attributes: vec![],
            children: vec![XmlChild::Text("hola".into())],
        };
        let right = XmlNode {
            tag: "msg".into(),
            attributes: vec![],
            children: vec![XmlChild::Text("adiós".into())],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert!(result.changed[0].path.contains("[text]"));
        assert_eq!(result.changed[0].left.as_deref(), Some("hola"));
        assert_eq!(result.changed[0].right.as_deref(), Some("adiós"));
    }

    // ── XML: atributos ──────────────────────────

    #[test]
    fn xml_atributo_cambiado() {
        let left = XmlNode {
            tag: "elem".into(),
            attributes: vec![("color".into(), "rojo".into())],
            children: vec![],
        };
        let right = XmlNode {
            tag: "elem".into(),
            attributes: vec![("color".into(), "azul".into())],
            children: vec![],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].path, "elem[@color]");
    }

    #[test]
    fn xml_atributo_añadido() {
        let left = XmlNode {
            tag: "elem".into(),
            attributes: vec![],
            children: vec![],
        };
        let right = XmlNode {
            tag: "elem".into(),
            attributes: vec![("nuevo".into(), "valor".into())],
            children: vec![],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.added.len(), 1);
        assert_eq!(result.added[0].path, "elem[@nuevo]");
    }

    #[test]
    fn xml_atributo_eliminado() {
        let left = XmlNode {
            tag: "elem".into(),
            attributes: vec![("viejo".into(), "valor".into())],
            children: vec![],
        };
        let right = XmlNode {
            tag: "elem".into(),
            attributes: vec![],
            children: vec![],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.removed.len(), 1);
        assert_eq!(result.removed[0].path, "elem[@viejo]");
    }

    // ── XML: nodos hijos ────────────────────────

    #[test]
    fn xml_hijo_añadido() {
        let left = XmlNode {
            tag: "padre".into(),
            attributes: vec![],
            children: vec![],
        };
        let right = XmlNode {
            tag: "padre".into(),
            attributes: vec![],
            children: vec![XmlChild::Node(XmlNode {
                tag: "hijo".into(),
                attributes: vec![],
                children: vec![XmlChild::Text("nuevo".into())],
            })],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.added.len(), 1);
        assert!(result.added[0].path.contains("hijo"));
    }

    #[test]
    fn xml_hijo_eliminado() {
        let left = XmlNode {
            tag: "padre".into(),
            attributes: vec![],
            children: vec![XmlChild::Node(XmlNode {
                tag: "hijo".into(),
                attributes: vec![],
                children: vec![XmlChild::Text("viejo".into())],
            })],
        };
        let right = XmlNode {
            tag: "padre".into(),
            attributes: vec![],
            children: vec![],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.removed.len(), 1);
    }

    #[test]
    fn xml_tag_diferente() {
        let left = XmlNode {
            tag: "alfa".into(),
            attributes: vec![],
            children: vec![],
        };
        let right = XmlNode {
            tag: "beta".into(),
            attributes: vec![],
            children: vec![],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.changed.len(), 1);
        assert_eq!(result.changed[0].left.as_deref(), Some("<alfa>"));
        assert_eq!(result.changed[0].right.as_deref(), Some("<beta>"));
    }

    // ── XML: estructura anidada compleja ────────

    #[test]
    fn xml_anidado_multiples_cambios() {
        let left = XmlNode {
            tag: "config".into(),
            attributes: vec![("version".into(), "1".into())],
            children: vec![
                XmlChild::Node(XmlNode {
                    tag: "db".into(),
                    attributes: vec![("host".into(), "localhost".into())],
                    children: vec![XmlChild::Text("5432".into())],
                }),
                XmlChild::Node(XmlNode {
                    tag: "cache".into(),
                    attributes: vec![],
                    children: vec![XmlChild::Text("redis".into())],
                }),
            ],
        };
        let right = XmlNode {
            tag: "config".into(),
            attributes: vec![("version".into(), "2".into())],
            children: vec![
                XmlChild::Node(XmlNode {
                    tag: "db".into(),
                    attributes: vec![("host".into(), "prod-server".into())],
                    children: vec![XmlChild::Text("5432".into())],
                }),
                XmlChild::Node(XmlNode {
                    tag: "cache".into(),
                    attributes: vec![],
                    children: vec![XmlChild::Text("memcached".into())],
                }),
            ],
        };
        let result = diff_xml(&left, &right);
        // version: 1 → 2, host: localhost → prod-server, cache text: redis → memcached
        assert_eq!(result.changed.len(), 3);
        assert_eq!(result.total(), 3);
    }

    // ── XML: hermanos con mismo tag ─────────────

    #[test]
    fn xml_hermanos_mismo_tag_con_indice() {
        let left = XmlNode {
            tag: "lista".into(),
            attributes: vec![],
            children: vec![
                XmlChild::Node(XmlNode {
                    tag: "item".into(),
                    attributes: vec![],
                    children: vec![XmlChild::Text("uno".into())],
                }),
                XmlChild::Node(XmlNode {
                    tag: "item".into(),
                    attributes: vec![],
                    children: vec![XmlChild::Text("dos".into())],
                }),
            ],
        };
        let right = XmlNode {
            tag: "lista".into(),
            attributes: vec![],
            children: vec![
                XmlChild::Node(XmlNode {
                    tag: "item".into(),
                    attributes: vec![],
                    children: vec![XmlChild::Text("uno".into())],
                }),
                XmlChild::Node(XmlNode {
                    tag: "item".into(),
                    attributes: vec![],
                    children: vec![XmlChild::Text("MODIFICADO".into())],
                }),
            ],
        };
        let result = diff_xml(&left, &right);
        assert_eq!(result.changed.len(), 1);
        // La ruta debe incluir índice porque hay varios <item>
        assert!(result.changed[0].path.contains("item[1]"));
    }

    // ── Resumen (summary) ───────────────────────

    #[test]
    fn summary_con_diferencias() {
        let left = json!({"a": 1, "b": 2});
        let right = json!({"a": 10, "c": 3});
        let result = diff_json(&left, &right);
        let summary = result.summary();
        assert!(summary.contains("3 diferencia(s)"));
        assert!(summary.contains("1 añadida(s)"));
        assert!(summary.contains("1 eliminada(s)"));
        assert!(summary.contains("1 modificada(s)"));
    }
}

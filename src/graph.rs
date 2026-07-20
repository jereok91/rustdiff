//! Módulo de grafo semántico (estilo JSON Crack).
//!
//! Convierte un documento parseado (`serde_json::Value` o `XmlNode`) en un
//! modelo de nodos y aristas, y calcula un layout de árbol por capas
//! (izquierda → derecha). Es lógica pura, sin dependencias de GTK, para que
//! sea testeable con `cargo test` — el renderizado vive en `ui/graph_view.rs`.

use std::collections::VecDeque;

use serde_json::Value as JsonValue;

use crate::parser::{XmlChild, XmlNode};

// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

/// Límite de nodos del grafo para mantener el canvas fluido.
/// Al alcanzarlo se marca `Graph::truncated` y se deja de expandir.
pub const MAX_GRAPH_NODES: usize = 3000;

/// Longitud máxima (en caracteres) de un valor mostrado en una fila.
/// Valores más largos se truncan con `…`.
pub const MAX_VALUE_CHARS: usize = 60;

// ─────────────────────────────────────────────
// Modelo de datos
// ─────────────────────────────────────────────

/// Tipo semántico del valor de una fila, usado por la UI para colorear.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    String,
    Number,
    Bool,
    Null,
    /// Referencia a un objeto anidado (`{N keys}`).
    ObjectRef,
    /// Referencia a un array anidado (`[N items]`).
    ArrayRef,
    /// Texto XML (`#text`).
    Text,
}

/// Una fila `clave: valor` dentro de un nodo del grafo.
#[derive(Debug, Clone)]
pub struct GraphRow {
    /// Clave de la fila. Vacía para escalares sueltos (ej. raíz escalar).
    pub key: String,
    /// Valor ya formateado y truncado, listo para dibujar.
    pub value: String,
    pub kind: ValueKind,
}

/// Identificador de nodo: índice dentro de `Graph::nodes`.
pub type NodeId = usize;

/// Un nodo del grafo: una tarjeta con filas `clave: valor`.
#[derive(Debug, Clone)]
pub struct GraphNode {
    pub id: NodeId,
    /// Clave/tag por el que se llegó a este nodo (útil para búsqueda).
    pub label: String,
    pub rows: Vec<GraphRow>,
    /// Columna del layout (0 = raíz).
    pub depth: usize,
    // Rellenados por `layout()`:
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Arista dirigida entre un nodo padre y uno hijo.
#[derive(Debug, Clone)]
pub struct GraphEdge {
    pub from: NodeId,
    /// Índice de la fila del padre donde ancla la curva (la fila `{N keys}`).
    /// `None` cuando el padre no tiene fila de referencia asociada.
    pub from_row: Option<usize>,
    pub to: NodeId,
    /// Etiqueta de la arista (clave, índice de array o tag XML).
    pub label: String,
}

/// Grafo completo: nodos (id == índice), aristas y flag de truncado.
#[derive(Debug, Default, Clone)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    /// `true` si se alcanzó `MAX_GRAPH_NODES` y el grafo está incompleto.
    pub truncated: bool,
}

// ─────────────────────────────────────────────
// Configuración de layout
// ─────────────────────────────────────────────

/// Métricas de fuente monoespaciada suministradas por el llamador.
/// La UI las mide con cairo; los tests usan valores fijos.
#[derive(Debug, Clone, Copy)]
pub struct FontMetrics {
    /// Ancho de un carácter en píxeles.
    pub char_width: f64,
    /// Alto de una fila en píxeles.
    pub row_height: f64,
}

/// Parámetros geométricos del layout por capas.
#[derive(Debug, Clone, Copy)]
pub struct LayoutConfig {
    pub metrics: FontMetrics,
    /// Relleno interno de cada nodo.
    pub node_padding: f64,
    /// Separación horizontal entre columnas.
    pub column_gap: f64,
    /// Separación vertical entre hermanos.
    pub sibling_gap: f64,
    /// Ancho máximo de un nodo (los textos largos se recortan al dibujar).
    pub max_node_width: f64,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            metrics: FontMetrics {
                char_width: 8.0,
                row_height: 20.0,
            },
            node_padding: 8.0,
            column_gap: 80.0,
            sibling_gap: 24.0,
            max_node_width: 480.0,
        }
    }
}

// ─────────────────────────────────────────────
// Construcción desde JSON
// ─────────────────────────────────────────────

/// Trabajo pendiente durante la construcción BFS del grafo.
struct Pending<'a, T> {
    /// Nodo padre y fila de anclaje, si existen (la raíz no tiene).
    from: Option<(NodeId, Option<usize>)>,
    label: String,
    depth: usize,
    payload: &'a T,
}

/// Devuelve `true` si el valor se representa como fila (escalar o
/// contenedor vacío) en lugar de generar un nodo hijo propio.
fn is_row_like(value: &JsonValue) -> bool {
    match value {
        JsonValue::Object(map) => map.is_empty(),
        JsonValue::Array(arr) => arr.is_empty(),
        _ => true,
    }
}

/// Formatea un escalar (o contenedor vacío) para mostrarlo en una fila.
fn format_scalar(value: &JsonValue) -> (String, ValueKind) {
    match value {
        JsonValue::Null => ("null".to_string(), ValueKind::Null),
        JsonValue::Bool(b) => (b.to_string(), ValueKind::Bool),
        JsonValue::Number(n) => (n.to_string(), ValueKind::Number),
        JsonValue::String(s) => (truncate_chars(&format!("\"{s}\""), MAX_VALUE_CHARS), ValueKind::String),
        JsonValue::Object(map) => (container_ref_text(map.len(), true), ValueKind::ObjectRef),
        JsonValue::Array(arr) => (container_ref_text(arr.len(), false), ValueKind::ArrayRef),
    }
}

/// Texto de una fila de referencia: `{N keys}` para objetos, `[N items]` para arrays.
fn container_ref_text(count: usize, is_object: bool) -> String {
    match (is_object, count) {
        (true, 1) => "{1 key}".to_string(),
        (true, n) => format!("{{{n} keys}}"),
        (false, 1) => "[1 item]".to_string(),
        (false, n) => format!("[{n} items]"),
    }
}

/// Recorta `text` a `max` caracteres (no bytes) añadiendo `…` si excede.
fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Construye el grafo de un documento JSON con recorrido BFS.
///
/// Semántica (comportamiento estilo jsoncrack):
/// - Un objeto genera un nodo; sus campos escalares son filas y sus campos
///   objeto/array generan una fila de referencia (`clave: {N keys}`) más una
///   arista hacia el nodo hijo.
/// - Un array de contenedores genera un hijo por elemento (arista = índice);
///   el array en sí no genera nodo intermedio.
/// - Los elementos escalares de un array se agrupan en UN solo nodo.
/// - Contenedores vacíos se muestran como fila sin hijo.
///
/// BFS (no recursión): inmune a stack overflow con anidamiento patológico y,
/// al truncar por `MAX_GRAPH_NODES`, los niveles superficiales quedan completos.
pub fn build_json_graph(value: &JsonValue) -> Graph {
    let mut graph = Graph::default();
    let mut queue: VecDeque<Pending<'_, JsonValue>> = VecDeque::new();
    queue.push_back(Pending {
        from: None,
        label: String::new(),
        depth: 0,
        payload: value,
    });

    while let Some(pending) = queue.pop_front() {
        match pending.payload {
            JsonValue::Object(map) if !map.is_empty() => {
                let Some(id) = alloc_node(&mut graph, &pending, |rows| {
                    for (key, val) in map {
                        let (value, kind) = format_scalar(val);
                        rows.push(GraphRow {
                            key: key.clone(),
                            value,
                            kind,
                        });
                    }
                }) else {
                    continue;
                };
                // Encolar los campos que generan nodos hijos propios.
                for (row_idx, (key, val)) in map.iter().enumerate() {
                    if !is_row_like(val) {
                        queue.push_back(Pending {
                            from: Some((id, Some(row_idx))),
                            label: key.clone(),
                            depth: pending.depth + 1,
                            payload: val,
                        });
                    }
                }
            }
            JsonValue::Array(arr) if !arr.is_empty() => {
                // Elementos escalares agrupados en un solo nodo.
                let scalars: Vec<(usize, &JsonValue)> =
                    arr.iter().enumerate().filter(|(_, v)| is_row_like(v)).collect();
                if !scalars.is_empty() {
                    alloc_node(&mut graph, &pending, |rows| {
                        for (idx, val) in &scalars {
                            let (value, kind) = format_scalar(val);
                            rows.push(GraphRow {
                                key: idx.to_string(),
                                value,
                                kind,
                            });
                        }
                    });
                }
                // Cada elemento contenedor cuelga del mismo anclaje del padre.
                for (idx, val) in arr.iter().enumerate() {
                    if !is_row_like(val) {
                        queue.push_back(Pending {
                            from: pending.from,
                            label: idx.to_string(),
                            depth: pending.depth,
                            payload: val,
                        });
                    }
                }
            }
            // Escalar suelto o contenedor vacío (solo posible como raíz).
            other => {
                alloc_node(&mut graph, &pending, |rows| {
                    let (value, kind) = format_scalar(other);
                    rows.push(GraphRow {
                        key: String::new(),
                        value,
                        kind,
                    });
                });
            }
        }
    }
    graph
}

/// Crea un nodo (y su arista de llegada) respetando el presupuesto de nodos.
/// Devuelve `None` si el grafo ya está lleno, marcándolo como truncado.
fn alloc_node<T>(
    graph: &mut Graph,
    pending: &Pending<'_, T>,
    fill_rows: impl FnOnce(&mut Vec<GraphRow>),
) -> Option<NodeId> {
    if graph.nodes.len() >= MAX_GRAPH_NODES {
        graph.truncated = true;
        return None;
    }
    let id = graph.nodes.len();
    let mut rows = Vec::new();
    fill_rows(&mut rows);
    graph.nodes.push(GraphNode {
        id,
        label: pending.label.clone(),
        rows,
        depth: pending.depth,
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
    });
    if let Some((from, from_row)) = pending.from {
        graph.edges.push(GraphEdge {
            from,
            from_row,
            to: id,
            label: pending.label.clone(),
        });
    }
    Some(id)
}

// ─────────────────────────────────────────────
// Construcción desde XML
// ─────────────────────────────────────────────

/// Concatena el texto directo de un nodo XML (hijos `XmlChild::Text`).
fn xml_text_content(node: &XmlNode) -> String {
    let mut parts = Vec::new();
    for child in &node.children {
        if let XmlChild::Text(text) = child {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed);
            }
        }
    }
    parts.join(" ")
}

/// Construye el grafo de un árbol XML con recorrido BFS.
///
/// Cada elemento genera un nodo con filas: una por atributo (`@nombre`),
/// una `#text` con el texto directo, y una fila de referencia por grupo de
/// hijos con el mismo tag. Cada hijo elemento genera su propio nodo
/// (arista etiquetada con el tag).
pub fn build_xml_graph(root: &XmlNode) -> Graph {
    let mut graph = Graph::default();
    let mut queue: VecDeque<Pending<'_, XmlNode>> = VecDeque::new();
    queue.push_back(Pending {
        from: None,
        label: root.tag.clone(),
        depth: 0,
        payload: root,
    });

    while let Some(pending) = queue.pop_front() {
        let node = pending.payload;
        // Agrupar hijos elemento por tag preservando el orden de aparición.
        let mut tag_groups: Vec<(String, usize)> = Vec::new();
        for child in node.child_nodes() {
            match tag_groups.iter_mut().find(|(tag, _)| *tag == child.tag) {
                Some((_, count)) => *count += 1,
                None => tag_groups.push((child.tag.clone(), 1)),
            }
        }

        let mut ref_row_base = 0;
        let Some(id) = alloc_node(&mut graph, &pending, |rows| {
            for (name, value) in &node.attributes {
                rows.push(GraphRow {
                    key: format!("@{name}"),
                    value: truncate_chars(value, MAX_VALUE_CHARS),
                    kind: ValueKind::String,
                });
            }
            let text = xml_text_content(node);
            if !text.is_empty() {
                rows.push(GraphRow {
                    key: "#text".to_string(),
                    value: truncate_chars(&text, MAX_VALUE_CHARS),
                    kind: ValueKind::Text,
                });
            }
            ref_row_base = rows.len();
            for (tag, count) in &tag_groups {
                let value = if *count == 1 {
                    "{1 node}".to_string()
                } else {
                    format!("[{count} nodes]")
                };
                rows.push(GraphRow {
                    key: tag.clone(),
                    value,
                    kind: ValueKind::ObjectRef,
                });
            }
            // Elemento completamente vacío: mostrar una fila atenuada.
            if rows.is_empty() {
                rows.push(GraphRow {
                    key: String::new(),
                    value: "{empty}".to_string(),
                    kind: ValueKind::Null,
                });
            }
        }) else {
            continue;
        };

        for child in node.child_nodes() {
            let row_idx = tag_groups
                .iter()
                .position(|(tag, _)| *tag == child.tag)
                .map(|group_idx| ref_row_base + group_idx);
            queue.push_back(Pending {
                from: Some((id, row_idx)),
                label: child.tag.clone(),
                depth: pending.depth + 1,
                payload: child,
            });
        }
    }
    graph
}

// ─────────────────────────────────────────────
// Layout de árbol por capas
// ─────────────────────────────────────────────

/// Calcula posiciones y tamaños de todos los nodos (izquierda → derecha).
///
/// 1. Tamaño de cada nodo según sus filas y las métricas de fuente.
/// 2. `x` común por columna (profundidad), con ancho = máximo de la columna.
/// 3. Vertical: cada hijo recibe una banda disjunta de alto `subtree_h` y el
///    padre se centra en la suya — garantiza que no hay solapes verticales.
///
/// Sin recursión: los nodos se crean por BFS, así que todo hijo tiene un id
/// mayor que su padre y basta iterar los ids en orden inverso/directo.
pub fn layout(graph: &mut Graph, cfg: &LayoutConfig) {
    let n = graph.nodes.len();
    if n == 0 {
        return;
    }

    // 1. Tamaños.
    for node in &mut graph.nodes {
        let max_chars = node
            .rows
            .iter()
            .map(|row| {
                let sep = if row.key.is_empty() { 0 } else { 2 }; // ": "
                row.key.chars().count() + sep + row.value.chars().count()
            })
            .max()
            .unwrap_or(1);
        let width = 2.0 * cfg.node_padding + max_chars as f64 * cfg.metrics.char_width;
        node.width = width.clamp(cfg.metrics.char_width * 4.0, cfg.max_node_width);
        node.height = 2.0 * cfg.node_padding + node.rows.len().max(1) as f64 * cfg.metrics.row_height;
    }

    // 2. Columnas: x acumulado por profundidad.
    let max_depth = graph.nodes.iter().map(|node| node.depth).max().unwrap_or(0);
    let mut col_widths = vec![0.0_f64; max_depth + 1];
    for node in &graph.nodes {
        col_widths[node.depth] = col_widths[node.depth].max(node.width);
    }
    let mut col_x = vec![0.0_f64; max_depth + 1];
    for depth in 1..=max_depth {
        col_x[depth] = col_x[depth - 1] + col_widths[depth - 1] + cfg.column_gap;
    }
    for node in &mut graph.nodes {
        node.x = col_x[node.depth];
    }

    // Hijos por nodo (las aristas se crearon en orden BFS).
    let mut children: Vec<Vec<NodeId>> = vec![Vec::new(); n];
    let mut has_parent = vec![false; n];
    for edge in &graph.edges {
        children[edge.from].push(edge.to);
        has_parent[edge.to] = true;
    }

    // 3a. Alto de cada subárbol (orden inverso de id = hijos antes que padres).
    let mut subtree_h = vec![0.0_f64; n];
    for id in (0..n).rev() {
        let children_total: f64 = children[id].iter().map(|&child| subtree_h[child]).sum::<f64>()
            + cfg.sibling_gap * children[id].len().saturating_sub(1) as f64;
        subtree_h[id] = graph.nodes[id].height.max(children_total);
    }

    // 3b. Colocación: banda vertical disjunta por subárbol (padres antes que hijos).
    let mut band_top = vec![0.0_f64; n];
    let mut root_cursor = 0.0_f64;
    for id in 0..n {
        if !has_parent[id] {
            band_top[id] = root_cursor;
            root_cursor += subtree_h[id] + cfg.sibling_gap;
        }
        let node_height = graph.nodes[id].height;
        graph.nodes[id].y = band_top[id] + (subtree_h[id] - node_height) / 2.0;

        let children_total: f64 = children[id].iter().map(|&child| subtree_h[child]).sum::<f64>()
            + cfg.sibling_gap * children[id].len().saturating_sub(1) as f64;
        let mut cursor = band_top[id] + (subtree_h[id] - children_total) / 2.0;
        for &child in &children[id] {
            band_top[child] = cursor;
            cursor += subtree_h[child] + cfg.sibling_gap;
        }
    }
}

/// Bounding box `(min_x, min_y, max_x, max_y)` del grafo ya posicionado.
/// Devuelve ceros si el grafo está vacío (útil para zoom-to-fit).
pub fn bounds(graph: &Graph) -> (f64, f64, f64, f64) {
    if graph.nodes.is_empty() {
        return (0.0, 0.0, 0.0, 0.0);
    }
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for node in &graph.nodes {
        min_x = min_x.min(node.x);
        min_y = min_y.min(node.y);
        max_x = max_x.max(node.x + node.width);
        max_y = max_y.max(node.y + node.height);
    }
    (min_x, min_y, max_x, max_y)
}

// ─────────────────────────────────────────────
// Tests unitarios
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_fijo() -> LayoutConfig {
        LayoutConfig {
            metrics: FontMetrics {
                char_width: 8.0,
                row_height: 18.0,
            },
            ..LayoutConfig::default()
        }
    }

    #[test]
    fn truncar_respeta_caracteres_no_bytes() {
        // 70 caracteres multibyte no deben partirse por la mitad de un byte.
        let largo = "ñ".repeat(70);
        let out = truncate_chars(&largo, MAX_VALUE_CHARS);
        assert_eq!(out.chars().count(), MAX_VALUE_CHARS);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn texto_de_referencia_singular_y_plural() {
        assert_eq!(container_ref_text(1, true), "{1 key}");
        assert_eq!(container_ref_text(2, true), "{2 keys}");
        assert_eq!(container_ref_text(1, false), "[1 item]");
        assert_eq!(container_ref_text(3, false), "[3 items]");
    }

    #[test]
    fn bounds_de_grafo_vacio_es_cero() {
        let graph = Graph::default();
        assert_eq!(bounds(&graph), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn layout_de_un_nodo_arranca_en_origen() {
        let value = serde_json::json!({"a": 1});
        let mut graph = build_json_graph(&value);
        layout(&mut graph, &cfg_fijo());
        assert_eq!(graph.nodes[0].x, 0.0);
        assert!(graph.nodes[0].width > 0.0);
        assert!(graph.nodes[0].height > 0.0);
    }
}

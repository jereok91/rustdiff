//! Tests de integración para el módulo graph.
//!
//! Validan la construcción del grafo (JSON y XML), el truncado por
//! presupuesto de nodos y los invariantes del layout por capas.
//!
//! Nota: serde_json (sin `preserve_order`) ordena las claves de los objetos
//! alfabéticamente; los tests asumen ese orden en las filas.

use pretty_assertions::assert_eq;
use rustdiff::graph::*;
use rustdiff::parser::{parse_json, parse_xml};

fn cfg_fijo() -> LayoutConfig {
    LayoutConfig {
        metrics: FontMetrics {
            char_width: 8.0,
            row_height: 18.0,
        },
        ..LayoutConfig::default()
    }
}

// ─────────────────────────────────────────────
// Builder JSON
// ─────────────────────────────────────────────

#[test]
fn json_plano_un_nodo_sin_edges() {
    let value = parse_json(r#"{"a": 1, "b": "x", "c": true, "d": null}"#).unwrap();
    let graph = build_json_graph(&value);

    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.edges.len(), 0);
    assert!(!graph.truncated);

    let rows = &graph.nodes[0].rows;
    assert_eq!(rows.len(), 4);
    assert_eq!(
        (rows[0].key.as_str(), rows[0].value.as_str(), rows[0].kind),
        ("a", "1", ValueKind::Number)
    );
    assert_eq!(
        (rows[1].key.as_str(), rows[1].value.as_str(), rows[1].kind),
        ("b", "\"x\"", ValueKind::String)
    );
    assert_eq!(
        (rows[2].key.as_str(), rows[2].value.as_str(), rows[2].kind),
        ("c", "true", ValueKind::Bool)
    );
    assert_eq!(
        (rows[3].key.as_str(), rows[3].value.as_str(), rows[3].kind),
        ("d", "null", ValueKind::Null)
    );
}

#[test]
fn json_anidado_crea_hijos_con_edges() {
    let value = parse_json(r#"{"name": "Apple", "details": {"type": "Pome", "season": "Fall"}}"#).unwrap();
    let graph = build_json_graph(&value);

    // Raíz + nodo hijo "details".
    assert_eq!(graph.nodes.len(), 2);
    assert_eq!(graph.edges.len(), 1);

    // Claves ordenadas alfabéticamente: details (0), name (1).
    let root = &graph.nodes[0];
    assert_eq!(root.rows[0].key, "details");
    assert_eq!(root.rows[0].value, "{2 keys}");
    assert_eq!(root.rows[0].kind, ValueKind::ObjectRef);
    assert_eq!(root.rows[1].key, "name");

    let edge = &graph.edges[0];
    assert_eq!(edge.from, 0);
    assert_eq!(edge.from_row, Some(0)); // ancla en la fila "details"
    assert_eq!(edge.to, 1);
    assert_eq!(edge.label, "details");

    let child = &graph.nodes[1];
    assert_eq!(child.label, "details");
    assert_eq!(child.depth, 1);
    assert_eq!(child.rows.len(), 2);
}

#[test]
fn array_de_objetos_un_hijo_por_elemento() {
    let value = parse_json(r#"{"fruits": [{"name": "Apple"}, {"name": "Banana"}]}"#).unwrap();
    let graph = build_json_graph(&value);

    // Raíz + 2 elementos (el array no genera nodo intermedio).
    assert_eq!(graph.nodes.len(), 3);
    assert_eq!(graph.edges.len(), 2);
    assert_eq!(graph.nodes[0].rows[0].value, "[2 items]");
    assert_eq!(graph.nodes[0].rows[0].kind, ValueKind::ArrayRef);

    let labels: Vec<&str> = graph.edges.iter().map(|e| e.label.as_str()).collect();
    assert_eq!(labels, vec!["0", "1"]);
    // Ambas aristas anclan en la misma fila de referencia del padre.
    assert!(graph.edges.iter().all(|e| e.from == 0 && e.from_row == Some(0)));
}

#[test]
fn array_de_escalares_agrupado_en_un_nodo() {
    let value = parse_json(r#"{"nums": [1, 2, 3]}"#).unwrap();
    let graph = build_json_graph(&value);

    // Raíz + UN nodo agrupando los 3 escalares.
    assert_eq!(graph.nodes.len(), 2);
    assert_eq!(graph.edges.len(), 1);

    let group = &graph.nodes[1];
    assert_eq!(group.rows.len(), 3);
    let keys: Vec<&str> = group.rows.iter().map(|r| r.key.as_str()).collect();
    assert_eq!(keys, vec!["0", "1", "2"]);
    assert!(group.rows.iter().all(|r| r.kind == ValueKind::Number));
}

#[test]
fn raiz_escalar_y_objeto_vacio() {
    // Raíz escalar → un nodo de una fila.
    let graph = build_json_graph(&parse_json("42").unwrap());
    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.nodes[0].rows.len(), 1);
    assert_eq!(graph.nodes[0].rows[0].value, "42");

    // Objeto vacío como raíz → fila de referencia, sin hijos.
    let graph = build_json_graph(&parse_json("{}").unwrap());
    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.nodes[0].rows[0].value, "{0 keys}");

    // Contenedor vacío como campo → fila sin arista ni hijo.
    let graph = build_json_graph(&parse_json(r#"{"a": {}, "b": []}"#).unwrap());
    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.edges.len(), 0);
    assert_eq!(graph.nodes[0].rows[0].value, "{0 keys}");
    assert_eq!(graph.nodes[0].rows[1].value, "[0 items]");
}

#[test]
fn valores_largos_se_truncan_con_elipsis() {
    let largo = "x".repeat(200);
    let value = parse_json(&format!(r#"{{"a": "{largo}"}}"#)).unwrap();
    let graph = build_json_graph(&value);
    let row = &graph.nodes[0].rows[0];
    assert_eq!(row.value.chars().count(), MAX_VALUE_CHARS);
    assert!(row.value.ends_with('…'));
}

// ─────────────────────────────────────────────
// Builder XML
// ─────────────────────────────────────────────

#[test]
fn xml_atributos_texto_y_hijos() {
    let xml = r#"<persona id="1" activo="si">
        <nombre>María</nombre>
        <email>maria@ejemplo.com</email>
    </persona>"#;
    let root = parse_xml(xml).unwrap();
    let graph = build_xml_graph(&root);

    // persona + nombre + email.
    assert_eq!(graph.nodes.len(), 3);
    assert_eq!(graph.edges.len(), 2);

    let persona = &graph.nodes[0];
    assert_eq!(persona.label, "persona");
    // Filas: @id, @activo, y una referencia por cada tag hijo.
    assert_eq!(persona.rows[0].key, "@id");
    assert_eq!(persona.rows[0].value, "1");
    assert_eq!(persona.rows[1].key, "@activo");
    assert_eq!(persona.rows[2].key, "nombre");
    assert_eq!(persona.rows[3].key, "email");

    let labels: Vec<&str> = graph.edges.iter().map(|e| e.label.as_str()).collect();
    assert_eq!(labels, vec!["nombre", "email"]);

    // El texto directo del hijo aparece como fila #text.
    let nombre = graph.nodes.iter().find(|n| n.label == "nombre").unwrap();
    assert_eq!(nombre.rows[0].key, "#text");
    assert_eq!(nombre.rows[0].value, "María");
    assert_eq!(nombre.rows[0].kind, ValueKind::Text);
}

#[test]
fn xml_tags_repetidos_agrupan_fila_pero_generan_nodos_propios() {
    let xml = "<lista><item>a</item><item>b</item><item>c</item></lista>";
    let root = parse_xml(xml).unwrap();
    let graph = build_xml_graph(&root);

    assert_eq!(graph.nodes.len(), 4);
    // Una sola fila de referencia para el grupo "item".
    assert_eq!(graph.nodes[0].rows.len(), 1);
    assert_eq!(graph.nodes[0].rows[0].value, "[3 nodes]");
    // Las 3 aristas anclan en esa misma fila.
    assert!(graph.edges.iter().all(|e| e.from == 0 && e.from_row == Some(0)));
}

// ─────────────────────────────────────────────
// Truncado por presupuesto
// ─────────────────────────────────────────────

#[test]
fn truncado_respeta_limite() {
    // Array ancho: cada elemento objeto genera un nodo → excede el límite.
    let elems: Vec<String> = (0..MAX_GRAPH_NODES + 100).map(|i| format!(r#"{{"i": {i}}}"#)).collect();
    let json = format!("[{}]", elems.join(","));
    let value = parse_json(&json).unwrap();
    let graph = build_json_graph(&value);

    assert!(graph.truncated);
    assert!(graph.nodes.len() <= MAX_GRAPH_NODES);
    // Ninguna arista apunta a un nodo inexistente.
    assert!(
        graph
            .edges
            .iter()
            .all(|e| e.to < graph.nodes.len() && e.from < graph.nodes.len())
    );
}

#[test]
fn truncado_bfs_conserva_niveles_superficiales() {
    // Un nivel intermedio ancho seguido de profundidad: BFS garantiza que
    // los hijos directos de la raíz existen aunque se trunque más abajo.
    let elems: Vec<String> = (0..MAX_GRAPH_NODES)
        .map(|i| format!(r#"{{"i": {i}, "sub": {{"x": {i}}}}}"#))
        .collect();
    let json = format!(r#"{{"top": [{}]}}"#, elems.join(","));
    let graph = build_json_graph(&parse_json(&json).unwrap());

    assert!(graph.truncated);
    // Todos los nodos de profundidad 1 (hijos directos) están presentes
    // antes que cualquier nodo de profundidad 2.
    let first_depth2 = graph.nodes.iter().position(|n| n.depth == 2);
    if let Some(pos) = first_depth2 {
        assert!(graph.nodes[..pos].iter().filter(|n| n.depth == 1).count() > 0);
        assert!(graph.nodes[pos..].iter().all(|n| n.depth >= 2));
    }
}

#[test]
fn anidamiento_profundo_no_desborda_pila() {
    // 50k niveles de anidamiento: el builder BFS y el layout iterativo no
    // recursan. Ojo: el `Drop` de serde_json::Value SÍ es recursivo, así que
    // el test corre en un hilo con pila grande para poder liberar el Value;
    // lo que se valida aquí es que build/layout no añaden recursión propia.
    std::thread::Builder::new()
        .stack_size(64 * 1024 * 1024)
        .spawn(|| {
            // Construcción manual O(n): el macro json! re-serializaría el
            // valor interpolado en cada iteración (O(n²) total).
            let mut value = serde_json::json!({"leaf": 1});
            for _ in 0..50_000 {
                let mut map = serde_json::Map::new();
                map.insert("child".to_string(), value);
                value = serde_json::Value::Object(map);
            }
            let mut graph = build_json_graph(&value);
            assert!(graph.truncated); // 50k > MAX_GRAPH_NODES
            layout(&mut graph, &cfg_fijo());
            let (min_x, _, max_x, _) = bounds(&graph);
            assert!(max_x > min_x);
        })
        .unwrap()
        .join()
        .unwrap();
}

// ─────────────────────────────────────────────
// Invariantes del layout
// ─────────────────────────────────────────────

fn grafo_ejemplo() -> Graph {
    let value = parse_json(
        r#"{
        "fruits": [
            {"name": "Apple", "details": {"type": "Pome", "season": "Fall"},
             "nutrients": {"calories": 52, "fiber": "2.4g", "vitaminC": "4.6mg"}},
            {"name": "Banana", "details": {"type": "Berry", "season": "Year-round"},
             "nutrients": {"calories": 89, "fiber": "2.6g", "potassium": "358mg"}},
            {"name": "Orange", "details": {"type": "Citrus", "season": "Winter"},
             "nutrients": {"calories": 47, "fiber": "2.4g", "vitaminC": "53.2mg"}}
        ]
    }"#,
    )
    .unwrap();
    let mut graph = build_json_graph(&value);
    layout(&mut graph, &cfg_fijo());
    graph
}

#[test]
fn layout_hijos_a_la_derecha_del_padre() {
    let graph = grafo_ejemplo();
    for edge in &graph.edges {
        let parent = &graph.nodes[edge.from];
        let child = &graph.nodes[edge.to];
        assert!(
            child.x >= parent.x + parent.width,
            "el hijo {} (x={}) debe quedar a la derecha del padre {} (x+w={})",
            child.id,
            child.x,
            parent.id,
            parent.x + parent.width
        );
    }
}

#[test]
fn layout_sin_solape_vertical_en_columna() {
    let graph = grafo_ejemplo();
    let max_depth = graph.nodes.iter().map(|n| n.depth).max().unwrap();
    for depth in 0..=max_depth {
        let mut column: Vec<&GraphNode> = graph.nodes.iter().filter(|n| n.depth == depth).collect();
        column.sort_by(|a, b| a.y.total_cmp(&b.y));
        for pair in column.windows(2) {
            assert!(
                pair[1].y >= pair[0].y + pair[0].height,
                "solape vertical en columna {depth}: nodo {} (y={}, h={}) vs nodo {} (y={})",
                pair[0].id,
                pair[0].y,
                pair[0].height,
                pair[1].id,
                pair[1].y
            );
        }
    }
}

#[test]
fn layout_dimensiones_positivas_y_deterministico() {
    let a = grafo_ejemplo();
    let b = grafo_ejemplo();
    for (na, nb) in a.nodes.iter().zip(&b.nodes) {
        assert!(na.width > 0.0 && na.height > 0.0);
        assert_eq!((na.x, na.y, na.width, na.height), (nb.x, nb.y, nb.width, nb.height));
    }
}

#[test]
fn layout_ancho_clampeado() {
    let largo = "y".repeat(500);
    let value = parse_json(&format!(r#"{{"clave": "{largo}"}}"#)).unwrap();
    let mut graph = build_json_graph(&value);
    let cfg = cfg_fijo();
    layout(&mut graph, &cfg);
    assert!(graph.nodes[0].width <= cfg.max_node_width);
}

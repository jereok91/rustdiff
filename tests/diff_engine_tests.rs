//! Tests de integración para el motor de diferencias.
//!
//! Estos tests simulan escenarios realistas: comparar documentos JSON
//! y XML completos como los que un usuario pegaría en la aplicación.

use rustdiff::diff_engine::*;
use rustdiff::parser::{parse_json, parse_xml, XmlChild, XmlNode};

// ═══════════════════════════════════════════════
// JSON: escenario API REST — respuesta de usuario
// ═══════════════════════════════════════════════

const JSON_LEFT: &str = r#"{
    "status": "ok",
    "data": {
        "users": [
            {
                "id": 1,
                "name": "María García",
                "email": "maria@ejemplo.com",
                "active": true
            },
            {
                "id": 2,
                "name": "Pedro López",
                "email": "pedro@ejemplo.com",
                "active": true
            }
        ],
        "total": 2
    }
}"#;

const JSON_RIGHT: &str = r#"{
    "status": "ok",
    "data": {
        "users": [
            {
                "id": 1,
                "name": "María García",
                "email": "maria@nuevo-dominio.com",
                "active": true
            },
            {
                "id": 2,
                "name": "Pedro López",
                "email": "pedro@ejemplo.com",
                "active": false
            },
            {
                "id": 3,
                "name": "Ana Ruiz",
                "email": "ana@ejemplo.com",
                "active": true
            }
        ],
        "total": 3,
        "page": 1
    }
}"#;

#[test]
fn json_api_diferencias_completas() {
    let left = parse_json(JSON_LEFT).unwrap();
    let right = parse_json(JSON_RIGHT).unwrap();
    let result = diff_json(&left, &right);

    // Debe detectar:
    // - Changed: users[0].email, users[1].active, data.total
    // - Added: users[2] (nuevo usuario), data.page
    assert!(!result.is_empty());

    // email de María cambió
    let email_change = result
        .changed
        .iter()
        .find(|d| d.path.contains("users") && d.path.contains("[0]") && d.path.contains("email"));
    assert!(email_change.is_some(), "Debe detectar cambio de email de María");

    // active de Pedro cambió a false
    let active_change = result
        .changed
        .iter()
        .find(|d| d.path.contains("[1]") && d.path.contains("active"));
    assert!(active_change.is_some(), "Debe detectar cambio de active de Pedro");

    // total cambió de 2 a 3
    let total_change = result
        .changed
        .iter()
        .find(|d| d.path.contains("total"));
    assert!(total_change.is_some(), "Debe detectar cambio en total");

    // Se añadió un tercer usuario
    let user_added = result
        .added
        .iter()
        .any(|d| d.path.contains("[2]"));
    assert!(user_added, "Debe detectar usuario añadido en índice 2");

    // Se añadió el campo page
    let page_added = result
        .added
        .iter()
        .any(|d| d.path.contains("page"));
    assert!(page_added, "Debe detectar campo page añadido");
}

#[test]
fn json_api_todas_las_rutas_empiezan_con_dolar() {
    let left = parse_json(JSON_LEFT).unwrap();
    let right = parse_json(JSON_RIGHT).unwrap();
    let result = diff_json(&left, &right);

    for item in result.all_items() {
        assert!(
            item.path.starts_with('$'),
            "Ruta '{}' no empieza con '$'",
            item.path
        );
    }
}

// ═══════════════════════════════════════════════
// JSON: escenario package.json
// ═══════════════════════════════════════════════

const PACKAGE_LEFT: &str = r#"{
    "name": "mi-app",
    "version": "1.0.0",
    "dependencies": {
        "react": "^18.0.0",
        "lodash": "^4.17.0",
        "moment": "^2.29.0"
    },
    "scripts": {
        "start": "node index.js",
        "test": "jest"
    }
}"#;

const PACKAGE_RIGHT: &str = r#"{
    "name": "mi-app",
    "version": "1.1.0",
    "dependencies": {
        "react": "^19.0.0",
        "lodash": "^4.17.0",
        "dayjs": "^1.11.0"
    },
    "scripts": {
        "start": "node index.js",
        "test": "vitest",
        "build": "vite build"
    }
}"#;

#[test]
fn json_package_json_diff() {
    let left = parse_json(PACKAGE_LEFT).unwrap();
    let right = parse_json(PACKAGE_RIGHT).unwrap();
    let result = diff_json(&left, &right);

    // version: 1.0.0 → 1.1.0
    assert!(result.changed.iter().any(|d| d.path.contains("version")));

    // react: ^18 → ^19
    assert!(result.changed.iter().any(|d| d.path.contains("react")));

    // moment eliminado
    assert!(result.removed.iter().any(|d| d.path.contains("moment")));

    // dayjs añadido
    assert!(result.added.iter().any(|d| d.path.contains("dayjs")));

    // test: jest → vitest
    assert!(result.changed.iter().any(|d| d.path.contains("test")));

    // build script añadido
    assert!(result.added.iter().any(|d| d.path.contains("build")));

    // lodash y start no cambiaron: no deben aparecer
    assert!(!result.all_items().iter().any(|d| d.path.contains("lodash")));
    assert!(!result.all_items().iter().any(|d| d.path.contains("start")));
}

// ═══════════════════════════════════════════════
// JSON: documento vacío vs poblado
// ═══════════════════════════════════════════════

#[test]
fn json_vacio_vs_poblado() {
    let left = parse_json("{}").unwrap();
    let right = parse_json(r#"{"a": 1, "b": [1, 2]}"#).unwrap();
    let result = diff_json(&left, &right);
    assert_eq!(result.added.len(), 2); // a y b
    assert!(result.removed.is_empty());
    assert!(result.changed.is_empty());
}

#[test]
fn json_poblado_vs_vacio() {
    let left = parse_json(r#"{"a": 1, "b": 2}"#).unwrap();
    let right = parse_json("{}").unwrap();
    let result = diff_json(&left, &right);
    assert_eq!(result.removed.len(), 2);
    assert!(result.added.is_empty());
}

// ═══════════════════════════════════════════════
// XML: escenario configuración de servidor
// ═══════════════════════════════════════════════

const XML_LEFT: &str = r#"
<server name="produccion" version="1.0">
    <database>
        <host>db.ejemplo.com</host>
        <port>5432</port>
        <name>mi_app_prod</name>
    </database>
    <cache enabled="true">
        <provider>redis</provider>
        <ttl>3600</ttl>
    </cache>
    <logging level="warn"/>
</server>
"#;

const XML_RIGHT: &str = r#"
<server name="produccion" version="2.0">
    <database>
        <host>nueva-db.ejemplo.com</host>
        <port>5432</port>
        <name>mi_app_prod</name>
        <pool-size>10</pool-size>
    </database>
    <cache enabled="false">
        <provider>memcached</provider>
        <ttl>7200</ttl>
    </cache>
    <logging level="info"/>
    <metrics enabled="true"/>
</server>
"#;

#[test]
fn xml_config_servidor_diferencias() {
    let left = parse_xml(XML_LEFT).unwrap();
    let right = parse_xml(XML_RIGHT).unwrap();
    let result = diff_xml(&left, &right);

    assert!(!result.is_empty());

    // version del server cambió: 1.0 → 2.0
    assert!(
        result.changed.iter().any(|d| d.path.contains("@version")),
        "Debe detectar cambio en atributo version"
    );

    // host cambió
    assert!(
        result.changed.iter().any(|d| d.path.contains("host") && d.path.contains("[text]")),
        "Debe detectar cambio en host"
    );

    // cache enabled: true → false
    assert!(
        result.changed.iter().any(|d| d.path.contains("cache") && d.path.contains("@enabled")),
        "Debe detectar cambio en cache enabled"
    );

    // provider: redis → memcached
    assert!(
        result
            .changed
            .iter()
            .any(|d| d.path.contains("provider") && d.path.contains("[text]")),
        "Debe detectar cambio en provider"
    );

    // pool-size añadido
    assert!(
        result.added.iter().any(|d| d.path.contains("pool-size")),
        "Debe detectar pool-size añadido"
    );

    // metrics añadido
    assert!(
        result.added.iter().any(|d| d.path.contains("metrics")),
        "Debe detectar nodo metrics añadido"
    );

    // logging level: warn → info
    assert!(
        result
            .changed
            .iter()
            .any(|d| d.path.contains("logging") && d.path.contains("@level")),
        "Debe detectar cambio en logging level"
    );
}

// ═══════════════════════════════════════════════
// XML: nodos idénticos parseados desde string
// ═══════════════════════════════════════════════

#[test]
fn xml_identicos_parseados() {
    let xml = "<root><a>1</a><b x=\"y\">2</b></root>";
    let left = parse_xml(xml).unwrap();
    let right = parse_xml(xml).unwrap();
    let result = diff_xml(&left, &right);
    assert!(result.is_empty());
    assert_eq!(result.summary(), "Los documentos son idénticos");
}

// ═══════════════════════════════════════════════
// XML: lista de items con hermanos del mismo tag
// ═══════════════════════════════════════════════

#[test]
fn xml_lista_items_multiples() {
    let left_xml = r#"
    <menu>
        <item precio="5.00">Café</item>
        <item precio="3.50">Té</item>
        <item precio="4.00">Jugo</item>
    </menu>
    "#;
    let right_xml = r#"
    <menu>
        <item precio="5.50">Café</item>
        <item precio="3.50">Té</item>
        <item precio="4.00">Limonada</item>
    </menu>
    "#;

    let left = parse_xml(left_xml).unwrap();
    let right = parse_xml(right_xml).unwrap();
    let result = diff_xml(&left, &right);

    // Primer item: precio cambió 5.00 → 5.50
    assert!(result.changed.iter().any(|d| d.path.contains("item[0]") && d.path.contains("@precio")));

    // Tercer item: texto cambió Jugo → Limonada
    assert!(result.changed.iter().any(|d| d.path.contains("item[2]") && d.path.contains("[text]")));

    // Segundo item (Té) no cambió
    let te_changes: Vec<_> = result
        .all_items()
        .iter()
        .filter(|d| d.path.contains("item[1]"))
        .cloned()
        .collect();
    assert!(te_changes.is_empty(), "Té no debe tener cambios");
}

// ═══════════════════════════════════════════════
// Integración: flujo completo detect → parse → diff
// ═══════════════════════════════════════════════

use rustdiff::parser::{auto_detect_format, Format};

#[test]
fn flujo_completo_json() {
    let left_str = r#"{"x": 1, "y": 2}"#;
    let right_str = r#"{"x": 1, "y": 3, "z": 4}"#;

    // 1. Detectar formato
    let fmt = auto_detect_format(left_str).unwrap();
    assert_eq!(fmt, Format::Json);

    // 2. Parsear
    let left = parse_json(left_str).unwrap();
    let right = parse_json(right_str).unwrap();

    // 3. Comparar
    let result = diff_json(&left, &right);
    assert_eq!(result.changed.len(), 1); // y: 2 → 3
    assert_eq!(result.added.len(), 1);   // z añadida
    assert_eq!(result.total(), 2);
}

#[test]
fn flujo_completo_xml() {
    let left_str = r#"<root><a>1</a></root>"#;
    let right_str = r#"<root><a>2</a><b>3</b></root>"#;

    let fmt = auto_detect_format(left_str).unwrap();
    assert_eq!(fmt, Format::Xml);

    let left = parse_xml(left_str).unwrap();
    let right = parse_xml(right_str).unwrap();

    let result = diff_xml(&left, &right);
    assert_eq!(result.changed.len(), 1); // a text: 1 → 2
    assert_eq!(result.added.len(), 1);   // <b> añadido
}

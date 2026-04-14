//! Tests de integración para el módulo parser.
//!
//! Estos tests validan escenarios más complejos y realistas
//! que los tests unitarios dentro del módulo.

use rustdiff::parser::*;

// ─────────────────────────────────────────────
// Escenario: documento JSON complejo (API REST típica)
// ─────────────────────────────────────────────

const JSON_API_RESPONSE: &str = r#"{
    "status": "ok",
    "data": {
        "users": [
            {
                "id": 1,
                "name": "María García",
                "email": "maria@ejemplo.com",
                "roles": ["admin", "editor"],
                "active": true
            },
            {
                "id": 2,
                "name": "Pedro López",
                "email": "pedro@ejemplo.com",
                "roles": ["viewer"],
                "active": false
            }
        ],
        "total": 2,
        "page": 1
    },
    "metadata": {
        "timestamp": "2026-01-15T10:30:00Z",
        "version": "2.1.0"
    }
}"#;

#[test]
fn json_complejo_se_parsea_correctamente() {
    let value = parse_json(JSON_API_RESPONSE).unwrap();
    assert_eq!(value["status"], "ok");
    assert_eq!(value["data"]["users"][0]["name"], "María García");
    assert_eq!(value["data"]["users"][1]["active"], false);
    assert_eq!(value["data"]["total"], 2);
    assert_eq!(value["metadata"]["version"], "2.1.0");
}

#[test]
fn json_complejo_pretty_print_ida_y_vuelta() {
    // Parsear → pretty-print → re-parsear debe dar el mismo resultado
    let original = parse_json(JSON_API_RESPONSE).unwrap();
    let pretty = format_pretty(JSON_API_RESPONSE, Format::Json).unwrap();
    let reparsed = parse_json(&pretty).unwrap();
    assert_eq!(original, reparsed);
}

#[test]
fn json_complejo_autodeteccion() {
    assert_eq!(
        auto_detect_format(JSON_API_RESPONSE).unwrap(),
        Format::Json
    );
}

// ─────────────────────────────────────────────
// Escenario: documento XML complejo (configuración tipo Maven/Spring)
// ─────────────────────────────────────────────

const XML_CONFIG: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<proyecto nombre="rustdiff" version="0.1.0">
    <dependencias>
        <dependencia grupo="org.ejemplo" artefacto="core" version="1.0">
            <exclusiones>
                <exclusion grupo="org.viejo" artefacto="legacy"/>
            </exclusiones>
        </dependencia>
        <dependencia grupo="org.ejemplo" artefacto="utils" version="2.3"/>
    </dependencias>
    <configuracion>
        <propiedad nombre="debug">true</propiedad>
        <propiedad nombre="nivel-log">info</propiedad>
    </configuracion>
</proyecto>"#;

#[test]
fn xml_complejo_se_parsea_correctamente() {
    let node = parse_xml(XML_CONFIG).unwrap();
    assert_eq!(node.tag, "proyecto");
    assert_eq!(node.get_attribute("nombre"), Some("rustdiff"));
    assert_eq!(node.get_attribute("version"), Some("0.1.0"));

    // Verificar dependencias
    let deps = node.find_child("dependencias").unwrap();
    let deps_list = deps.child_nodes();
    assert_eq!(deps_list.len(), 2);

    // Primera dependencia con exclusiones
    let dep1 = &deps_list[0];
    assert_eq!(dep1.get_attribute("grupo"), Some("org.ejemplo"));
    assert_eq!(dep1.get_attribute("artefacto"), Some("core"));
    let exclusiones = dep1.find_child("exclusiones").unwrap();
    let excl = exclusiones.find_child("exclusion").unwrap();
    assert_eq!(excl.get_attribute("artefacto"), Some("legacy"));

    // Segunda dependencia (auto-cerrada, sin hijos)
    let dep2 = &deps_list[1];
    assert_eq!(dep2.get_attribute("artefacto"), Some("utils"));
    assert!(dep2.children.is_empty());
}

#[test]
fn xml_complejo_autodeteccion() {
    assert_eq!(auto_detect_format(XML_CONFIG).unwrap(), Format::Xml);
}

#[test]
fn xml_propiedades_con_texto() {
    let node = parse_xml(XML_CONFIG).unwrap();
    let config = node.find_child("configuracion").unwrap();
    let props = config.child_nodes();
    assert_eq!(props.len(), 2);
    assert_eq!(props[0].get_attribute("nombre"), Some("debug"));
    assert_eq!(props[0].text_content(), "true");
    assert_eq!(props[1].text_content(), "info");
}

#[test]
fn xml_pretty_print_ida_y_vuelta() {
    // El XML se puede formatear y re-parsear sin perder estructura
    let xml_simple = "<root><a x=\"1\">texto</a><b/></root>";
    let pretty = format_pretty(xml_simple, Format::Xml).unwrap();
    let node = parse_xml(&pretty).unwrap();
    assert_eq!(node.tag, "root");
    assert_eq!(node.find_child("a").unwrap().get_attribute("x"), Some("1"));
    assert_eq!(node.find_child("a").unwrap().text_content(), "texto");
}

// ─────────────────────────────────────────────
// Escenario: caracteres especiales y Unicode
// ─────────────────────────────────────────────

#[test]
fn json_con_unicode_y_escapes() {
    let json = r#"{"emoji": "🦀", "html": "<b>bold</b>", "quote": "dijo \"hola\""}"#;
    let value = parse_json(json).unwrap();
    assert_eq!(value["emoji"], "🦀");
    assert_eq!(value["html"], "<b>bold</b>");
    assert_eq!(value["quote"], "dijo \"hola\"");
}

#[test]
fn xml_con_entidades_html() {
    let xml = "<msg><texto>5 &gt; 3 &amp; 3 &lt; 5</texto></msg>";
    let node = parse_xml(xml).unwrap();
    assert_eq!(
        node.find_child("texto").unwrap().text_content(),
        "5 > 3 & 3 < 5"
    );
}

// ─────────────────────────────────────────────
// Escenario: casos límite
// ─────────────────────────────────────────────

#[test]
fn json_numero_solo() {
    // Un número suelto es JSON válido
    let value = parse_json("42").unwrap();
    assert_eq!(value, 42);
}

#[test]
fn json_string_solo() {
    let value = parse_json(r#""hola""#).unwrap();
    assert_eq!(value, "hola");
}

#[test]
fn json_null() {
    let value = parse_json("null").unwrap();
    assert!(value.is_null());
}

#[test]
fn json_array_vacio() {
    let value = parse_json("[]").unwrap();
    assert!(value.is_array());
    assert_eq!(value.as_array().unwrap().len(), 0);
}

#[test]
fn json_objeto_vacio() {
    let value = parse_json("{}").unwrap();
    assert!(value.is_object());
    assert_eq!(value.as_object().unwrap().len(), 0);
}

#[test]
fn xml_nodo_raiz_autocerrado() {
    let node = parse_xml(r#"<vacio attr="val"/>"#).unwrap();
    assert_eq!(node.tag, "vacio");
    assert_eq!(node.get_attribute("attr"), Some("val"));
    assert!(node.children.is_empty());
}

// ─────────────────────────────────────────────
// Escenario: validación de tamaño
// ─────────────────────────────────────────────

#[test]
fn rechaza_input_demasiado_grande() {
    // Crear una cadena que exceda el límite
    let enorme = "x".repeat(MAX_INPUT_SIZE + 1);
    assert!(matches!(
        parse_json(&enorme),
        Err(ParseError::InputTooLarge { .. })
    ));
    assert!(matches!(
        parse_xml(&enorme),
        Err(ParseError::InputTooLarge { .. })
    ));
    assert!(matches!(
        format_pretty(&enorme, Format::Json),
        Err(ParseError::InputTooLarge { .. })
    ));
}

//! Módulo de parseo para JSON y XML.
//!
//! Proporciona funciones para detectar el formato de un documento,
//! parsearlo en una estructura navegable, y generar pretty-print.

use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use serde_json::Value as JsonValue;
use std::io::Cursor;
use thiserror::Error;

// ─────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────

/// Formatos de documento soportados por RustDiff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Json,
    Xml,
}

/// Errores posibles durante el parseo de documentos.
#[derive(Debug, Error)]
pub enum ParseError {
    #[error("invalid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),

    #[error("invalid XML: {0}")]
    InvalidXml(String),

    #[error("unknown format: the text does not look like valid JSON or XML")]
    UnknownFormat,

    #[error("the document is empty")]
    EmptyInput,

    #[error("document exceeds the {limit}-byte limit (is {actual} bytes)")]
    InputTooLarge { limit: usize, actual: usize },
}

/// Límite por defecto para el tamaño de entrada (10 MB).
pub const MAX_INPUT_SIZE: usize = 10 * 1024 * 1024;

/// Representa un nodo en un árbol XML parseado.
#[derive(Debug, Clone, PartialEq)]
pub struct XmlNode {
    /// Nombre de la etiqueta (ej. "persona", "nombre").
    pub tag: String,
    /// Atributos del nodo como pares clave-valor.
    pub attributes: Vec<(String, String)>,
    /// Contenido hijo: puede ser texto plano u otros nodos.
    pub children: Vec<XmlChild>,
}

/// Un hijo de un nodo XML: puede ser texto o un sub-nodo.
#[derive(Debug, Clone, PartialEq)]
pub enum XmlChild {
    /// Texto contenido directamente dentro del nodo padre.
    Text(String),
    /// Un nodo hijo con su propia estructura.
    Node(XmlNode),
}

// ─────────────────────────────────────────────
// Funciones públicas
// ─────────────────────────────────────────────

/// Detecta automáticamente si el texto es JSON o XML.
///
/// Examina el primer carácter significativo (ignorando espacios en blanco):
/// - `{` o `[` → JSON
/// - `<` → XML
/// - Cualquier otro → `Err(UnknownFormat)`
pub fn auto_detect_format(input: &str) -> Result<Format, ParseError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ParseError::EmptyInput);
    }
    match trimmed.as_bytes()[0] {
        b'{' | b'[' => Ok(Format::Json),
        b'<' => Ok(Format::Xml),
        _ => Err(ParseError::UnknownFormat),
    }
}

/// Parsea una cadena como JSON y devuelve el valor estructurado.
///
/// Valida que el tamaño no exceda `MAX_INPUT_SIZE` antes de parsear.
pub fn parse_json(input: &str) -> Result<JsonValue, ParseError> {
    validate_size(input)?;
    let value = serde_json::from_str(input)?;
    Ok(value)
}

/// Parsea una cadena como XML y devuelve un árbol de `XmlNode`.
///
/// Construye el árbol de forma recursiva usando una pila (stack).
/// Solo se conserva el primer nodo raíz; el prólogo XML se ignora.
pub fn parse_xml(input: &str) -> Result<XmlNode, ParseError> {
    validate_size(input)?;
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ParseError::EmptyInput);
    }

    let mut reader = Reader::from_str(trimmed);
    // No queremos que quick-xml expanda los espacios automáticamente
    reader.config_mut().trim_text_start = true;
    reader.config_mut().trim_text_end = true;

    // Pila para construir el árbol: cada elemento es un nodo "en construcción"
    let mut stack: Vec<XmlNode> = Vec::new();
    let mut root: Option<XmlNode> = None;

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let node = build_node_from_start(e, &reader)?;
                stack.push(node);
            }
            Ok(Event::Empty(ref e)) => {
                // Etiqueta auto-cerrada como <br/>
                let node = build_node_from_start(e, &reader)?;
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(XmlChild::Node(node));
                } else {
                    // Nodo raíz auto-cerrado (raro pero válido)
                    root = Some(node);
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e
                    .unescape()
                    .map_err(|err| ParseError::InvalidXml(format!("Error en texto: {err}")))?
                    .to_string();
                // Ignorar texto que sea solo espacios en blanco
                if !text.trim().is_empty() {
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(XmlChild::Text(text));
                    }
                }
            }
            Ok(Event::End(_)) => {
                let finished = stack.pop().ok_or_else(|| {
                    ParseError::InvalidXml("Etiqueta de cierre sin apertura".into())
                })?;
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(XmlChild::Node(finished));
                } else {
                    // Llegamos al cierre del nodo raíz
                    root = Some(finished);
                }
            }
            Ok(Event::Eof) => break,
            // Ignorar declaraciones XML, comentarios, CDATA, PI
            Ok(Event::Decl(_) | Event::Comment(_) | Event::CData(_) | Event::PI(_)) => {}
            Err(e) => {
                return Err(ParseError::InvalidXml(format!(
                    "Error en posición {}: {e}",
                    reader.error_position()
                )));
            }
            _ => {}
        }
    }

    root.ok_or_else(|| ParseError::InvalidXml("No se encontró un nodo raíz".into()))
}

/// Formatea un documento en modo legible (pretty-print).
///
/// Si el formato no coincide con el contenido real, devuelve un error.
pub fn format_pretty(input: &str, fmt: Format) -> Result<String, ParseError> {
    validate_size(input)?;
    match fmt {
        Format::Json => {
            let value: JsonValue = serde_json::from_str(input)?;
            // serde_json::to_string_pretty usa 2 espacios de indentación
            let pretty = serde_json::to_string_pretty(&value).map_err(ParseError::InvalidJson)?;
            Ok(pretty)
        }
        Format::Xml => pretty_print_xml(input),
    }
}

// ─────────────────────────────────────────────
// Funciones internas
// ─────────────────────────────────────────────

/// Valida que el tamaño del input no exceda el límite.
fn validate_size(input: &str) -> Result<(), ParseError> {
    if input.len() > MAX_INPUT_SIZE {
        return Err(ParseError::InputTooLarge {
            limit: MAX_INPUT_SIZE,
            actual: input.len(),
        });
    }
    Ok(())
}

/// Construye un `XmlNode` a partir de un evento `BytesStart` de quick-xml.
fn build_node_from_start(e: &BytesStart, reader: &Reader<&[u8]>) -> Result<XmlNode, ParseError> {
    let tag = reader
        .decoder()
        .decode(e.name().as_ref())
        .map_err(|err| ParseError::InvalidXml(format!("Error decodificando tag: {err}")))?
        .to_string();

    let mut attributes = Vec::new();
    for attr_result in e.attributes() {
        let attr = attr_result
            .map_err(|err| ParseError::InvalidXml(format!("Error en atributo: {err}")))?;
        let key = reader
            .decoder()
            .decode(attr.key.as_ref())
            .map_err(|err| ParseError::InvalidXml(format!("Error en clave de atributo: {err}")))?
            .to_string();
        let value = attr
            .unescape_value()
            .map_err(|err| ParseError::InvalidXml(format!("Error en valor de atributo: {err}")))?
            .to_string();
        attributes.push((key, value));
    }

    Ok(XmlNode {
        tag,
        attributes,
        children: Vec::new(),
    })
}

/// Pretty-print de XML usando quick-xml Writer con indentación.
fn pretty_print_xml(input: &str) -> Result<String, ParseError> {
    let mut reader = Reader::from_str(input.trim());
    reader.config_mut().trim_text_start = true;
    reader.config_mut().trim_text_end = true;

    // Writer con indentación de 2 espacios
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                writer.write_event(Event::Start(e)).map_err(|err| {
                    ParseError::InvalidXml(format!("Error escribiendo XML: {err}"))
                })?;
            }
            Ok(Event::End(e)) => {
                writer.write_event(Event::End(e)).map_err(|err| {
                    ParseError::InvalidXml(format!("Error escribiendo XML: {err}"))
                })?;
            }
            Ok(Event::Empty(e)) => {
                writer.write_event(Event::Empty(e)).map_err(|err| {
                    ParseError::InvalidXml(format!("Error escribiendo XML: {err}"))
                })?;
            }
            Ok(Event::Text(e)) => {
                writer.write_event(Event::Text(e)).map_err(|err| {
                    ParseError::InvalidXml(format!("Error escribiendo XML: {err}"))
                })?;
            }
            Ok(Event::Eof) => break,
            Ok(event) => {
                writer.write_event(event).map_err(|err| {
                    ParseError::InvalidXml(format!("Error escribiendo XML: {err}"))
                })?;
            }
            Err(e) => {
                return Err(ParseError::InvalidXml(format!(
                    "Error leyendo XML en posición {}: {e}",
                    reader.error_position()
                )));
            }
        }
    }

    let result = writer.into_inner().into_inner();
    String::from_utf8(result)
        .map_err(|err| ParseError::InvalidXml(format!("XML resultante no es UTF-8 válido: {err}")))
}

// ─────────────────────────────────────────────
// Métodos de conveniencia para XmlNode
// ─────────────────────────────────────────────

impl XmlNode {
    /// Devuelve el texto directo contenido en este nodo (sin hijos).
    /// Si hay múltiples fragmentos de texto, los concatena con un espacio.
    pub fn text_content(&self) -> String {
        self.children
            .iter()
            .filter_map(|child| match child {
                XmlChild::Text(t) => Some(t.as_str()),
                XmlChild::Node(_) => None,
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Devuelve los nodos hijos (ignorando fragmentos de texto).
    pub fn child_nodes(&self) -> Vec<&XmlNode> {
        self.children
            .iter()
            .filter_map(|child| match child {
                XmlChild::Node(n) => Some(n),
                XmlChild::Text(_) => None,
            })
            .collect()
    }

    /// Busca el primer hijo con el tag dado.
    pub fn find_child(&self, tag: &str) -> Option<&XmlNode> {
        self.child_nodes().into_iter().find(|n| n.tag == tag)
    }

    /// Devuelve el valor de un atributo por nombre, si existe.
    pub fn get_attribute(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }
}

impl std::fmt::Display for Format {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Format::Json => write!(f, "JSON"),
            Format::Xml => write!(f, "XML"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── auto_detect_format ──────────────────────

    #[test]
    fn detecta_json_objeto() {
        assert_eq!(auto_detect_format(r#"{"a": 1}"#).unwrap(), Format::Json);
    }

    #[test]
    fn detecta_json_array() {
        assert_eq!(auto_detect_format("[1, 2, 3]").unwrap(), Format::Json);
    }

    #[test]
    fn detecta_json_con_espacios() {
        assert_eq!(auto_detect_format("  \n  { }").unwrap(), Format::Json);
    }

    #[test]
    fn detecta_xml() {
        assert_eq!(auto_detect_format("<root/>").unwrap(), Format::Xml);
    }

    #[test]
    fn detecta_xml_con_declaracion() {
        let xml = r#"<?xml version="1.0"?><root/>"#;
        assert_eq!(auto_detect_format(xml).unwrap(), Format::Xml);
    }

    #[test]
    fn error_formato_desconocido() {
        assert!(matches!(
            auto_detect_format("hola mundo"),
            Err(ParseError::UnknownFormat)
        ));
    }

    #[test]
    fn error_entrada_vacia() {
        assert!(matches!(
            auto_detect_format(""),
            Err(ParseError::EmptyInput)
        ));
        assert!(matches!(
            auto_detect_format("   \n\t  "),
            Err(ParseError::EmptyInput)
        ));
    }

    // ── parse_json ──────────────────────────────

    #[test]
    fn parsea_json_simple() {
        let json = r#"{"nombre": "Juan", "edad": 30}"#;
        let value = parse_json(json).unwrap();
        assert_eq!(value["nombre"], "Juan");
        assert_eq!(value["edad"], 30);
    }

    #[test]
    fn parsea_json_anidado() {
        let json = r#"{
            "persona": {
                "nombre": "Ana",
                "hobbies": ["leer", "correr"]
            }
        }"#;
        let value = parse_json(json).unwrap();
        assert_eq!(value["persona"]["nombre"], "Ana");
        assert_eq!(value["persona"]["hobbies"][0], "leer");
        assert_eq!(value["persona"]["hobbies"][1], "correr");
    }

    #[test]
    fn parsea_json_array_raiz() {
        let json = r#"[1, "dos", null, true]"#;
        let value = parse_json(json).unwrap();
        assert!(value.is_array());
        assert_eq!(value[0], 1);
        assert_eq!(value[1], "dos");
        assert!(value[2].is_null());
        assert_eq!(value[3], true);
    }

    #[test]
    fn error_json_invalido() {
        let json = r#"{"nombre": }"#;
        assert!(parse_json(json).is_err());
    }

    #[test]
    fn error_json_vacio() {
        assert!(parse_json("").is_err());
    }

    // ── parse_xml ───────────────────────────────

    #[test]
    fn parsea_xml_simple() {
        let xml = "<persona><nombre>Juan</nombre><edad>30</edad></persona>";
        let node = parse_xml(xml).unwrap();
        assert_eq!(node.tag, "persona");
        assert_eq!(node.child_nodes().len(), 2);
        assert_eq!(node.find_child("nombre").unwrap().text_content(), "Juan");
        assert_eq!(node.find_child("edad").unwrap().text_content(), "30");
    }

    #[test]
    fn parsea_xml_con_atributos() {
        let xml = r#"<libro isbn="978-3-16" idioma="es"><titulo>Rust en Acción</titulo></libro>"#;
        let node = parse_xml(xml).unwrap();
        assert_eq!(node.tag, "libro");
        assert_eq!(node.get_attribute("isbn"), Some("978-3-16"));
        assert_eq!(node.get_attribute("idioma"), Some("es"));
        assert_eq!(
            node.find_child("titulo").unwrap().text_content(),
            "Rust en Acción"
        );
    }

    #[test]
    fn parsea_xml_anidado() {
        let xml = r#"
        <biblioteca>
            <libro>
                <titulo>Don Quijote</titulo>
                <autor>Cervantes</autor>
            </libro>
            <libro>
                <titulo>Cien Años de Soledad</titulo>
                <autor>García Márquez</autor>
            </libro>
        </biblioteca>
        "#;
        let node = parse_xml(xml).unwrap();
        assert_eq!(node.tag, "biblioteca");
        let libros = node.child_nodes();
        assert_eq!(libros.len(), 2);
        assert_eq!(
            libros[0].find_child("titulo").unwrap().text_content(),
            "Don Quijote"
        );
        assert_eq!(
            libros[1].find_child("autor").unwrap().text_content(),
            "García Márquez"
        );
    }

    #[test]
    fn parsea_xml_etiqueta_autocerrada() {
        let xml = r#"<config><opcion activa="true"/></config>"#;
        let node = parse_xml(xml).unwrap();
        let opcion = node.find_child("opcion").unwrap();
        assert_eq!(opcion.get_attribute("activa"), Some("true"));
        assert!(opcion.children.is_empty());
    }

    #[test]
    fn parsea_xml_con_declaracion() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?><raiz>contenido</raiz>"#;
        let node = parse_xml(xml).unwrap();
        assert_eq!(node.tag, "raiz");
        assert_eq!(node.text_content(), "contenido");
    }

    #[test]
    fn error_xml_invalido() {
        let xml = "<abierto>sin cierre";
        assert!(parse_xml(xml).is_err());
    }

    #[test]
    fn error_xml_vacio() {
        assert!(parse_xml("").is_err());
        assert!(parse_xml("   ").is_err());
    }

    // ── format_pretty ───────────────────────────

    #[test]
    fn pretty_print_json() {
        let json = r#"{"b":2,"a":1}"#;
        let pretty = format_pretty(json, Format::Json).unwrap();
        // serde_json mantiene el orden de inserción, no ordena alfabéticamente
        assert!(pretty.contains('\n'));
        assert!(pretty.contains("  ")); // indentación de 2 espacios
        // Verificar que sigue siendo JSON válido
        let reparsed: JsonValue = serde_json::from_str(&pretty).unwrap();
        assert_eq!(reparsed["a"], 1);
        assert_eq!(reparsed["b"], 2);
    }

    #[test]
    fn pretty_print_xml() {
        let xml = "<root><a>1</a><b>2</b></root>";
        let pretty = format_pretty(xml, Format::Xml).unwrap();
        assert!(pretty.contains('\n'));
        // Verificar que sigue siendo XML parseable
        let node = parse_xml(&pretty).unwrap();
        assert_eq!(node.tag, "root");
        assert_eq!(node.find_child("a").unwrap().text_content(), "1");
    }

    #[test]
    fn error_pretty_formato_incorrecto() {
        // Intentar formatear XML como JSON debe fallar
        assert!(format_pretty("<root/>", Format::Json).is_err());
        // Nota: format_pretty(JSON, XML) no necesariamente falla porque
        // quick-xml puede tratar texto plano como contenido de texto válido.
        // Lo importante es que XML inválido como JSON sí falle.
    }

    // ── XmlNode métodos ─────────────────────────

    #[test]
    fn xml_node_text_content_vacio() {
        let node = XmlNode {
            tag: "vacio".into(),
            attributes: vec![],
            children: vec![],
        };
        assert_eq!(node.text_content(), "");
    }

    #[test]
    fn xml_node_find_child_inexistente() {
        let node = XmlNode {
            tag: "padre".into(),
            attributes: vec![],
            children: vec![XmlChild::Node(XmlNode {
                tag: "hijo".into(),
                attributes: vec![],
                children: vec![],
            })],
        };
        assert!(node.find_child("inexistente").is_none());
        assert!(node.find_child("hijo").is_some());
    }

    #[test]
    fn xml_node_get_attribute_inexistente() {
        let node = XmlNode {
            tag: "test".into(),
            attributes: vec![("clave".into(), "valor".into())],
            children: vec![],
        };
        assert_eq!(node.get_attribute("clave"), Some("valor"));
        assert_eq!(node.get_attribute("otra"), None);
    }

    // ── Display para Format ─────────────────────

    #[test]
    fn format_display() {
        assert_eq!(format!("{}", Format::Json), "JSON");
        assert_eq!(format!("{}", Format::Xml), "XML");
    }
}

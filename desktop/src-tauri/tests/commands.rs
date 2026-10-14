//! Tests del contrato IPC (F2).
//!
//! Un test por regla del contrato, llamando a las funciones Rust directas (sin
//! pasar por `invoke`). Lo que sí ejercita el binding real es el smoke e2e
//! (`desktop/scripts/smoke-headless.sh`): renombrar un argumento compila y solo
//! se rompe en runtime.
//!
//! Los fixtures en disco viven en `CARGO_TARGET_TMPDIR` (el temporal que cargo
//! da a los tests de integración, dentro del `target/` del crate) para no tocar
//! `$HOME` ni el repositorio.

use std::path::{Path, PathBuf};

use rustdiff_core::graph::MAX_GRAPH_NODES;
use rustdiff_core::parser::{Format, MAX_INPUT_SIZE};
use rustdiff_desktop::commands::diff::{CharRange, diff_documents, inline_char_ranges};
use rustdiff_desktop::commands::files::{check_input_size, read_document, read_startup_files, write_text_file};
use rustdiff_desktop::commands::graph::build_graph;
use rustdiff_desktop::commands::history::{
    history_clear_in, history_count_in, history_delete_in, history_get_in, history_list_in, history_save_in,
    history_search_in,
};
use rustdiff_desktop::commands::shared::FormatArg;
use rustdiff_desktop::error::{CommandError, ErrorCode};
use rustdiff_desktop::state::AppState;
use rustdiff_persist::storage::Storage;
use serde_json::{Value, json};

const IZQUIERDO: &str = r#"{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}"#;
const DERECHO: &str = r#"{"usuario":{"nombre":"ana","edad":31},"tags":["a","c"],"activo":true}"#;

fn ruta_temporal(nombre: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("{}-{nombre}", std::process::id()))
}

fn estado_con_historial() -> AppState {
    AppState::with_storage(Storage::open_in_memory().expect("no se pudo abrir el historial en memoria"))
}

// ─────────────────────────────────────────────
// diff_documents
// ─────────────────────────────────────────────

#[test]
fn diff_vacio_devuelve_need_input_sin_tocar_el_nucleo() {
    // Corto-circuito de la GTK: con un lado en blanco no se intenta comparar.
    for (izquierdo, derecho) in [("", DERECHO), ("   ", DERECHO), (IZQUIERDO, "\n")] {
        let error = diff_documents(izquierdo.into(), derecho.into(), None).unwrap_err();
        assert_eq!(error.code, ErrorCode::NeedInput);
    }
}

#[test]
fn un_formato_desconocido_es_unknown_format_y_no_cae_a_la_deteccion() {
    let error = diff_documents(IZQUIERDO.into(), DERECHO.into(), Some(FormatArg::new("yaml"))).unwrap_err();
    assert_eq!(error.code, ErrorCode::UnknownFormat);
}

#[test]
fn cada_lado_reporta_su_propio_codigo() {
    let izquierdo = diff_documents("{".into(), DERECHO.into(), Some(FormatArg::new("json"))).unwrap_err();
    let derecho = diff_documents(IZQUIERDO.into(), "{".into(), Some(FormatArg::new("json"))).unwrap_err();

    assert_eq!(izquierdo.code, ErrorCode::InvalidLeft);
    assert_eq!(derecho.code, ErrorCode::InvalidRight);
}

#[test]
fn el_diff_semantico_y_el_formato_siguen_siendo_los_del_nucleo() {
    let respuesta = diff_documents(IZQUIERDO.into(), DERECHO.into(), None).unwrap();

    assert_eq!(respuesta.format, Format::Json);
    assert!(respuesta.result.changed.iter().any(|i| i.path == "$.usuario.edad"));
    assert!(respuesta.result.added.iter().any(|i| i.path == "$.activo"));
}

#[test]
fn el_formato_explicito_manda_sobre_la_deteccion() {
    let respuesta = diff_documents(IZQUIERDO.into(), DERECHO.into(), Some(FormatArg::new("text"))).unwrap();

    assert_eq!(respuesta.format, Format::Text);
    assert!(!respuesta.result.changed.is_empty());
}

// ─────────────────────────────────────────────
// inline_char_ranges
// ─────────────────────────────────────────────

#[test]
fn los_rangos_inline_marcan_exactamente_lo_que_cambia() {
    let izquierdo = "color: rojo";
    let derecho = "color: azul";
    let rangos = inline_char_ranges(izquierdo.into(), derecho.into());

    // Concatenar lo que cubren los rangos tiene que dar lo que cambia: si los
    // offsets fueran de bytes, en un texto con acentos partirian un caracter.
    let cubierto = |texto: &str, rangos: &[CharRange]| -> String {
        let chars: Vec<char> = texto.chars().collect();
        rangos
            .iter()
            .flat_map(|rango| chars[rango.start..rango.end].iter().copied())
            .collect()
    };

    assert!(!rangos.left.is_empty() && !rangos.right.is_empty());
    assert_eq!(cubierto(izquierdo, &rangos.left), "rojo");
    assert_eq!(cubierto(derecho, &rangos.right), "azul");
}

#[test]
fn un_caracter_multibyte_ocupa_una_sola_posicion() {
    // "ñ" son 2 bytes y 1 caracter: un offset de bytes daria 1..3.
    let rangos = inline_char_ranges("año".into(), "ano".into());

    assert_eq!(rangos.left, vec![CharRange { start: 1, end: 2 }]);
    assert_eq!(rangos.right, vec![CharRange { start: 1, end: 2 }]);
}

// ─────────────────────────────────────────────
// build_graph
// ─────────────────────────────────────────────

#[test]
fn un_json_grande_marca_el_grafo_como_truncado() {
    // Ancho (no profundo): el limite de recursion de serde_json es 128 niveles.
    let mut texto = String::from("{");
    for i in 0..MAX_GRAPH_NODES + 10 {
        if i > 0 {
            texto.push(',');
        }
        texto.push_str(&format!("\"k{i}\":{{\"v\":{i}}}"));
    }
    texto.push('}');

    let respuesta = build_graph(texto, Some(FormatArg::new("json")), 8.0, 20.0).unwrap();

    assert!(respuesta.truncated, "el grafo debio marcarse truncado");
    assert!(respuesta.graph.truncated);
    assert_eq!(respuesta.graph.nodes.len(), MAX_GRAPH_NODES);
    assert!(
        respuesta.bounds.max_x > respuesta.bounds.min_x,
        "el layout asigna ancho"
    );
}

#[test]
fn sql_y_texto_no_tienen_grafo() {
    let error = build_graph("SELECT 1;".into(), Some(FormatArg::new("sql")), 8.0, 20.0).unwrap_err();
    assert_eq!(error.code, ErrorCode::UnsupportedFormat);
}

// ─────────────────────────────────────────────
// Archivos
// ─────────────────────────────────────────────

#[test]
fn leer_un_documento_demasiado_grande_es_too_large() {
    let ruta = ruta_temporal("demasiado-grande.json");
    std::fs::write(&ruta, vec![b' '; MAX_INPUT_SIZE + 1]).expect("no se pudo crear el fixture");

    let error = read_document(&ruta).unwrap_err();

    let _ = std::fs::remove_file(&ruta);
    assert_eq!(error.code, ErrorCode::TooLarge);
}

#[test]
fn escribir_y_leer_un_documento_da_ida_y_vuelta() {
    let ruta = ruta_temporal("ida-y-vuelta.json");
    let texto = r#"{"hola":"mundo"}"#;

    write_text_file(ruta.display().to_string(), texto.into()).unwrap();
    let leido = read_document(&ruta).unwrap();

    let _ = std::fs::remove_file(&ruta);
    assert_eq!(leido.content, texto);
    assert_eq!(leido.name, ruta.file_name().unwrap().to_string_lossy());
}

#[test]
fn escribir_mas_del_limite_no_llega_al_disco() {
    assert_eq!(
        check_input_size(MAX_INPUT_SIZE + 1).unwrap_err().code,
        ErrorCode::TooLarge
    );
}

#[test]
fn los_documentos_de_arranque_vienen_del_estado() {
    let ruta = ruta_temporal("arranque.json");
    std::fs::write(&ruta, IZQUIERDO).unwrap();

    let estado = AppState::with_storage_and_paths(Storage::open_in_memory().unwrap(), vec![ruta.clone()]);
    let documentos = read_startup_files(estado.startup_paths()).unwrap();

    let _ = std::fs::remove_file(&ruta);
    assert_eq!(documentos.len(), 1);
    assert_eq!(documentos[0].content, IZQUIERDO);
}

// ─────────────────────────────────────────────
// Historial
// ─────────────────────────────────────────────

#[test]
fn el_historial_da_ida_y_vuelta_completa() {
    let estado = estado_con_historial();

    let id = history_save_in(&estado, IZQUIERDO, DERECHO, None).unwrap();
    assert_eq!(history_count_in(&estado).unwrap(), 1);

    let lista = history_list_in(&estado, 0, 20).unwrap();
    assert_eq!(lista.len(), 1);
    assert_eq!(lista[0].id, id);
    assert_eq!(lista[0].format, Format::Json);
    assert_eq!(lista[0].diff_summary.total, 3, "1 anadido + 2 cambiados");

    let sesion = history_get_in(&estado, id).unwrap();
    assert_eq!(sesion.left_content, IZQUIERDO);
    assert_eq!(sesion.right_content, DERECHO);

    assert_eq!(history_search_in(&estado, "usuario", 20).unwrap().len(), 1);
    assert!(history_search_in(&estado, "no-existe-xyz", 20).unwrap().is_empty());

    assert!(history_delete_in(&estado, id).unwrap());
    assert_eq!(history_get_in(&estado, id).unwrap_err().code, ErrorCode::NotFound);
    assert_eq!(history_clear_in(&estado).unwrap(), 0);
}

#[test]
fn sin_historial_abierto_el_codigo_es_history_unavailable() {
    let estado = AppState::without_history("base ilegible");

    assert_eq!(
        history_list_in(&estado, 0, 20).unwrap_err().code,
        ErrorCode::HistoryUnavailable
    );
    assert_eq!(
        history_count_in(&estado).unwrap_err().code,
        ErrorCode::HistoryUnavailable
    );
}

// ─────────────────────────────────────────────
// Forma serializada
// ─────────────────────────────────────────────

#[test]
fn el_error_serializado_tiene_codigo_y_mensaje() {
    let error = diff_documents(String::new(), DERECHO.into(), None).unwrap_err();
    let serializado: Value = serde_json::to_value(&error).unwrap();

    assert_eq!(serializado["code"], json!("NeedInput"));
    assert!(serializado["message"].is_string(), "el mensaje viaja para logs");
    assert_eq!(
        serializado.as_object().unwrap().len(),
        2,
        "el contrato del error son exactamente dos campos"
    );
}

#[test]
fn el_payload_del_diff_tiene_la_forma_que_espera_el_frontend() {
    let respuesta = diff_documents(IZQUIERDO.into(), DERECHO.into(), None).unwrap();
    let serializado: Value = serde_json::to_value(&respuesta).unwrap();

    assert_eq!(serializado["format"], json!("Json"));
    let cambiado = &serializado["result"]["changed"][0];
    assert!(cambiado["path"].is_string());
    assert_eq!(cambiado["kind"], json!("Changed"));
    assert!(cambiado["left"].is_string());
    assert!(cambiado["right"].is_string());

    // Los dos lados nulos también son contrato: el frontend los muestra como
    // "—" y los tipa `string | null`. Un `skip_serializing_if` los borraría del
    // JSON y la UI los leería como `undefined`.
    let anadido = &serializado["result"]["added"][0];
    assert_eq!(anadido["kind"], json!("Added"));
    assert!(anadido["left"].is_null(), "un anadido no tiene lado izquierdo");
    assert!(anadido["right"].is_string());

    let con_eliminado = diff_documents(r#"{"a":1,"b":2}"#.into(), r#"{"a":1}"#.into(), None).unwrap();
    let serializado: Value = serde_json::to_value(&con_eliminado).unwrap();
    let eliminado = &serializado["result"]["removed"][0];
    assert_eq!(eliminado["kind"], json!("Removed"));
    assert!(eliminado["left"].is_string());
    assert!(eliminado["right"].is_null(), "un eliminado no tiene lado derecho");
}

#[test]
fn todos_los_codigos_de_error_son_traducibles_por_el_frontend() {
    // El frontend traduce por código: cada variante tiene que serializarse como
    // su nombre, que es el literal de la union en TypeScript.
    for (error, esperado) in [
        (CommandError::need_input(), "NeedInput"),
        (CommandError::unknown_format("yaml"), "UnknownFormat"),
        (CommandError::detect_failed("nada"), "DetectFailed"),
        (CommandError::unsupported_format(Format::Sql), "UnsupportedFormat"),
        (CommandError::io("x"), "Io"),
        (CommandError::history_unavailable("x"), "HistoryUnavailable"),
        (CommandError::not_found("x"), "NotFound"),
        (CommandError::too_large(1, 2), "TooLarge"),
    ] {
        assert_eq!(serde_json::to_value(error.code).unwrap(), json!(esperado));
    }
}

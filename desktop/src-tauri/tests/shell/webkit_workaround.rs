//! Tabla de verdad del parche de arranque para WebKitGTK.
//!
//! El caso real: NVIDIA propietario sobre Wayland muere con `Error 71 (Error de
//! protocolo) dispatching to Wayland display` antes de mostrar la ventana. La
//! decisión tiene que ser conservadora: el parche cuesta composición por GPU,
//! así que solo se aplica a esa combinación y nunca pisa una decisión del
//! usuario.

use rustdiff_desktop::needs_dmabuf_workaround;

#[test]
fn aplica_con_nvidia_sobre_wayland() {
    assert!(needs_dmabuf_workaround(true, true, false));
}

#[test]
fn no_aplica_sin_wayland() {
    // X11 no pasa por esta ruta.
    assert!(!needs_dmabuf_workaround(false, true, false));
}

#[test]
fn no_aplica_sin_nvidia() {
    // Mesa y compañía no tienen el problema.
    assert!(!needs_dmabuf_workaround(true, false, false));
}

#[test]
fn nunca_pisa_la_decision_del_usuario() {
    // Si la variable ya está, manda el usuario, aunque sea el caso afectado.
    assert!(!needs_dmabuf_workaround(true, true, true));
}

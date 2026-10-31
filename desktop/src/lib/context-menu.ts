/*
 * Bloquea el menú contextual nativo de WebKitGTK: el que ofrece Atrás,
 * Adelante, Detener y Recargar. Ese menú no es de la app y su "Recargar" vuelve
 * a cargar el WebView, llevándose todo el estado en memoria (lo que hay en los
 * editores y la comparación en curso).
 *
 * Se cancela el evento `contextmenu` del DOM: WebKitGTK muestra su menú como
 * acción por defecto de ese evento, así que `preventDefault()` alcanza para que
 * no aparezca. Si más adelante la app quiere menús propios, van por componente
 * (por ejemplo sobre la tabla de diferencias) y esto no los impide.
 */
export function installContextMenuGuard(target: EventTarget = document): () => void {
    const cancel = (event: Event) => {
        event.preventDefault();
    };
    target.addEventListener("contextmenu", cancel);
    return () => {
        target.removeEventListener("contextmenu", cancel);
    };
}

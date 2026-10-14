/*
 * Detección de contenido sin guardar para el diálogo de salida.
 *
 * La GTK pregunta al cerrar siempre que algún editor tenga texto. Acá además
 * se recuerda la última instantánea guardada en el historial (o restaurada de
 * él): si los editores no cambiaron desde entonces, se cierra sin preguntar.
 */

export type EditorSnapshot = { left: string; right: string };

export function hasUnsavedContent(current: EditorSnapshot, saved: EditorSnapshot | null): boolean {
    if (current.left.trim() === "" && current.right.trim() === "") {
        return false;
    }
    return !(saved !== null && saved.left === current.left && saved.right === current.right);
}

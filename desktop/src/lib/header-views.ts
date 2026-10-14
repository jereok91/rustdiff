/*
 * Vistas de la cabecera (historial, grafo, panel de diferencias) como un
 * control segmentado de selección múltiple. Cada vista tiene su propio
 * toggle con efectos (abrir el grafo apaga la comparación, por ejemplo), así
 * que el grupo no fija un estado: dice qué toggles cambiaron.
 */

export type PanelToggle = "history" | "graph" | "diff";

/** Vistas cuyo estado difiere entre `current` y `next`, en orden estable. */
export function togglePanels(current: readonly PanelToggle[], next: readonly PanelToggle[]): PanelToggle[] {
    const order: PanelToggle[] = ["history", "graph", "diff"];
    return order.filter((key) => current.includes(key) !== next.includes(key));
}

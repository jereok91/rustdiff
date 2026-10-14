/*
 * Escala global del texto de la UI (`ui_scale` de las preferencias).
 *
 * Mismos límites que `rustdiff-persist/src/settings.rs` (`UI_SCALE_MIN`,
 * `UI_SCALE_MAX`, `UI_SCALE_DEFAULT`) y el mismo paso de 10% que la GTK
 * (`UI_SCALE_STEP` en `main_window.rs`). La GTK escalaba `gtk-xft-dpi`; acá se
 * escala el `font-size` de la raíz: Tailwind mide en `rem`, así que toda la UI
 * (incluidos los editores) crece o se achica junta.
 */

export const UI_SCALE_MIN = 0.6;
export const UI_SCALE_MAX = 2.0;
export const UI_SCALE_DEFAULT = 1.0;
export const UI_SCALE_STEP = 0.1;

/** Acota la escala; un valor no finito vuelve al default (como `clamped_ui_scale`). */
export function clampUiScale(scale: number | null | undefined): number {
    if (typeof scale !== "number" || !Number.isFinite(scale)) {
        return UI_SCALE_DEFAULT;
    }
    return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale));
}

export type ScaleStep = "increase" | "decrease" | "reset";

/**
 * Próxima escala. Redondea a 2 decimales para que los pasos de 0.1 no
 * acumulen error flotante entre sesiones (igual que la GTK).
 */
export function nextUiScale(current: number, step: ScaleStep): number {
    if (step === "reset") {
        return UI_SCALE_DEFAULT;
    }
    const delta = step === "increase" ? UI_SCALE_STEP : -UI_SCALE_STEP;
    return clampUiScale(Math.round((clampUiScale(current) + delta) * 100) / 100);
}

/** Porcentaje entero para el aviso ("Text size: 110%"). */
export function uiScalePercent(scale: number): number {
    return Math.round(clampUiScale(scale) * 100);
}

/** Aplica la escala al `font-size` de la raíz del documento. */
export function applyUiScale(scale: number, root: HTMLElement | null = globalRoot()): void {
    if (!root) {
        return;
    }
    const clamped = clampUiScale(scale);
    // 100% es el tamaño base del WebView: sin estilo inline, nada que pisar.
    root.style.fontSize = clamped === UI_SCALE_DEFAULT ? "" : `${uiScalePercent(clamped)}%`;
}

function globalRoot(): HTMLElement | null {
    return typeof document === "undefined" ? null : document.documentElement;
}

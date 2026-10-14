/*
 * Debounce de un callback (el auto-compare de 500 ms de la GTK, `DEBOUNCE_MS`).
 *
 * Cada llamada cancela la pendiente y reprograma; `flush` ejecuta ya lo
 * pendiente y `cancel` lo descarta. El callback más reciente siempre es el
 * que corre, aunque cambie entre renders.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

export const DEBOUNCE_MS = 500;

export type Debounced<A extends unknown[]> = {
    (...args: A): void;
    cancel: () => void;
    flush: () => void;
};

export function useDebouncedCallback<A extends unknown[]>(
    callback: (...args: A) => void,
    delay: number = DEBOUNCE_MS,
): Debounced<A> {
    const callbackRef = useRef(callback);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const argsRef = useRef<A | null>(null);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    const cancel = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        argsRef.current = null;
    }, []);

    const flush = useCallback(() => {
        const args = argsRef.current;
        cancel();
        if (args) {
            callbackRef.current(...args);
        }
    }, [cancel]);

    // Al desmontar no queda ningún temporizador vivo.
    useEffect(() => cancel, [cancel]);

    return useMemo(() => {
        const debounced = ((...args: A) => {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
            }
            argsRef.current = args;
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                const pending = argsRef.current;
                argsRef.current = null;
                if (pending) {
                    callbackRef.current(...pending);
                }
            }, delay);
        }) as Debounced<A>;
        debounced.cancel = cancel;
        debounced.flush = flush;
        return debounced;
    }, [delay, cancel, flush]);
}

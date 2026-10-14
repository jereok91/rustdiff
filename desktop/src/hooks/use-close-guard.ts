/*
 * Intercepta el cierre de la ventana (`connect_close_request` de la GTK).
 *
 * `onCloseRequested` de Tauri destruye la ventana al volver del handler salvo
 * que se llame a `preventDefault()`. Si `shouldBlock()` dice que hay
 * contenido sin guardar, se frena el cierre y se avisa con `onBlocked` para
 * mostrar el diálogo de salida; desde ahí `closeWindowNow` cierra de verdad
 * (`destroy` no vuelve a disparar `close-requested`).
 *
 * Fuera de Tauri (navegador con `pnpm dev`, tests) no hay ventana: el hook no
 * hace nada.
 */

import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useCloseGuard(shouldBlock: () => boolean, onBlocked: () => void): void {
    const shouldBlockRef = useRef(shouldBlock);
    const onBlockedRef = useRef(onBlocked);
    useEffect(() => {
        shouldBlockRef.current = shouldBlock;
        onBlockedRef.current = onBlocked;
    }, [shouldBlock, onBlocked]);

    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | null = null;
        let win: ReturnType<typeof getCurrentWindow>;
        try {
            win = getCurrentWindow();
        } catch {
            return;
        }
        win.onCloseRequested((event) => {
            if (shouldBlockRef.current()) {
                event.preventDefault();
                onBlockedRef.current();
            }
        })
            .then((stop) => {
                if (disposed) {
                    stop();
                } else {
                    unlisten = stop;
                }
            })
            .catch(() => undefined);
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);
}

/** Cierra la ventana sin volver a preguntar. */
export async function closeWindowNow(): Promise<void> {
    await getCurrentWindow().destroy();
}

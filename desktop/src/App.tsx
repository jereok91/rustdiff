/*
 * Pantalla mínima del spike.
 *
 * No es la UI final: su único trabajo es probar la cadena completa
 * React -> IPC -> rustdiff-core -> React con documentos reales, para que la
 * fase F3 empiece sobre algo que ya se sabe que funciona.
 *
 * Desde F2 los tipos y las llamadas salen de `./bindings`, generado desde las
 * firmas de los comandos Rust (D6): ya no hay tipos IPC escritos a mano que
 * puedan quedar desincronizados. Regenerar con `pnpm bindings`.
 *
 * Tailwind y shadcn/ui entran en F3/F7 (S4: primero portar, después rediseñar).
 */

import { useCallback, useEffect, useState } from "react";
import { commands, type CommandError, type DiffItem, type DiffResponse } from "./bindings";

const DOCUMENTO_IZQUIERDO = `{
  "usuario": { "nombre": "ana", "edad": 30 },
  "tags": ["a", "b"]
}`;

const DOCUMENTO_DERECHO = `{
  "usuario": { "nombre": "ana", "edad": 31 },
  "tags": ["a", "c"],
  "activo": true
}`;

function filas(result: DiffResponse["result"] | null): DiffItem[] {
    if (!result) {
        return [];
    }
    return [...result.removed, ...result.added, ...result.changed];
}

/** El backend rechaza con `{ code, message }` (ErrorHandlingMode::Throw). */
function mensajeDeError(error: unknown): string {
    const tipado = error as Partial<CommandError> | undefined;
    if (tipado?.code && tipado.message) {
        return `${tipado.code}: ${tipado.message}`;
    }
    return typeof error === "string" ? error : String(error);
}

export default function App() {
    const [izquierdo, setIzquierdo] = useState(DOCUMENTO_IZQUIERDO);
    const [derecho, setDerecho] = useState(DOCUMENTO_DERECHO);
    const [respuesta, setRespuesta] = useState<DiffResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [comparando, setComparando] = useState(false);

    const comparar = useCallback(async () => {
        setComparando(true);
        setError(null);
        try {
            // `format: null` = detección automática desde el documento izquierdo.
            const obtenida = await commands.diffDocuments(izquierdo, derecho, null);
            setRespuesta(obtenida);
        } catch (e) {
            setRespuesta(null);
            setError(mensajeDeError(e));
        } finally {
            setComparando(false);
        }
    }, [izquierdo, derecho]);

    // Compara al abrir: deja la cadena completa probada sin depender de un click.
    useEffect(() => {
        void comparar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const items = filas(respuesta?.result ?? null);

    return (
        <main className="app">
            <header>
                <h1>RustDiff</h1>
                <p className="subtitulo">
                    Spike de Tauri: el diff semántico corre en Rust, la UI en React.
                </p>
            </header>

            <section className="editores">
                <label>
                    Left document
                    <textarea
                        value={izquierdo}
                        spellCheck={false}
                        onChange={(e) => setIzquierdo(e.target.value)}
                    />
                </label>
                <label>
                    Right document
                    <textarea
                        value={derecho}
                        spellCheck={false}
                        onChange={(e) => setDerecho(e.target.value)}
                    />
                </label>
            </section>

            <section className="acciones">
                <button type="button" onClick={() => void comparar()} disabled={comparando}>
                    {comparando ? "Comparing…" : "Compare"}
                </button>
                {respuesta && (
                    <span className="estado" data-testid="estado">
                        {respuesta.format} · {items.length} difference(s):{" "}
                        {respuesta.result.added.length} added, {respuesta.result.removed.length} removed,{" "}
                        {respuesta.result.changed.length} changed
                    </span>
                )}
                {error && (
                    <span className="error" data-testid="error">
                        {error}
                    </span>
                )}
            </section>

            {items.length > 0 && (
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Path</th>
                            <th>Left</th>
                            <th>Right</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={`${item.kind}-${item.path}`} data-kind={item.kind}>
                                <td className={`tipo tipo-${item.kind.toLowerCase()}`}>{item.kind}</td>
                                <td className="ruta">{item.path}</td>
                                <td>{item.left ?? "—"}</td>
                                <td>{item.right ?? "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </main>
    );
}

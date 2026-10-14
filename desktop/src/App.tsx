/*
 * Pantalla mínima del spike de F1.
 *
 * No es la UI final: su único trabajo es probar la cadena completa
 * React -> IPC -> rustdiff-core -> React con documentos reales, para que la
 * fase F3 empiece sobre algo que ya se sabe que funciona.
 *
 * Tailwind y shadcn/ui entran en F3/F7 (S4: primero portar, después rediseñar).
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Espejo de los tipos de rustdiff-core. En F2 los genera tauri-specta (D6). */
type DiffKind = "Added" | "Removed" | "Changed";

interface DiffItem {
    path: string;
    kind: DiffKind;
    left: string | null;
    right: string | null;
}

interface DiffResult {
    added: DiffItem[];
    removed: DiffItem[];
    changed: DiffItem[];
}

type Format = "Json" | "Xml" | "Sql" | "Text";

interface DiffResponse {
    format: Format;
    result: DiffResult;
}

const DOCUMENTO_IZQUIERDO = `{
  "usuario": { "nombre": "ana", "edad": 30 },
  "tags": ["a", "b"]
}`;

const DOCUMENTO_DERECHO = `{
  "usuario": { "nombre": "ana", "edad": 31 },
  "tags": ["a", "c"],
  "activo": true
}`;

function filas(result: DiffResult | null): DiffItem[] {
    if (!result) {
        return [];
    }
    return [...result.removed, ...result.added, ...result.changed];
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
            const obtenida = await invoke<DiffResponse>("diff_documents", {
                left: izquierdo,
                right: derecho,
                format: null,
            });
            setRespuesta(obtenida);
        } catch (e) {
            setRespuesta(null);
            setError(typeof e === "string" ? e : String(e));
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

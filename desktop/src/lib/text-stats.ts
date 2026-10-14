/** Cantidad de líneas de un documento, como las numera el editor (vacío = 1). */
export function lineCount(text: string): number {
    let count = 1;
    for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
        count++;
    }
    return count;
}

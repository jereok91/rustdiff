# Feature: sugerir desescapar JSON pegado desde un log

## Specs

- **S1.** Cuando el texto de un editor es JSON con las comillas escapadas
  (`{\"ctry\":\"co\",…}`, la forma en que un log o un portal serializa el JSON
  dentro de un string), la app lo **detecta** y muestra un aviso arriba del
  editor: «Parece JSON escapado» con un botón **Desescapar y comparar**.
  Caso de referencia (reportado por el mantenedor): un array de dos cuentas con
  `\"ctry\":\"co\"` en todas las comillas.
- **S2.** El aviso no toca el documento por su cuenta: solo aparece con su
  botón. Al pulsarlo, el editor se reemplaza por el texto desescapado y la
  comparación se recalcula sola.
- **S3.** La detección no inventa: solo sugiere cuando el texto desescapado
  **parsea como JSON**. Un JSON normal, un texto con comillas escapadas que no
  parsea, o un documento con comillas legítimas no muestran nada.
- **S4.** El desescapado es explícito y completo: decodifica las secuencias de
  escape del string JSON (`\"`, `\\`, `\n`, `\t`, `\uXXXX`…), que es lo que
  reproduce el documento original, y no toca el resto del texto. El frontend no
  parsea documentos (S8): la detección y la validación viven en
  `rustdiff-core` detrás de un comando IPC.
- **S5.** El aviso se apaga al desescapar el documento o al descartarlo, y un
  documento ya normalizado no vuelve a sugerirlo.

## Tasks

| ID | Qué | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | `unescape_escaped_json` en `rustdiff-core::parser` con tests | S1, S3, S4 | inline | `feat(core): detect escaped JSON documents` |
| T2 | Comando IPC `unescape_json` + bindings + test del comando | S4 | inline | (mismo commit) |
| T3 | Aviso en la UI (banner + botón), i18n en/es y test de Vitest | S1, S2, S5 | inline | `feat(desktop): offer to unescape escaped JSON` |

## Log

- **L1 (mantenedor, verbatim):** «cuando reciba un json como este el lo entienda
  y suguiera hacerle un version para funcione como json» + payload de cuentas
  con comillas escapadas.
- **L2:** el array en la raíz **sí** se detecta como JSON hoy
  (`parser.rs`: `b'{' | b'[' => Format::Json`); lo que rompe es la forma
  escapada, que el parser rechaza con un error de parseo (no hay fallback a
  diff de texto: el usuario ve el error y el aviso nuevo).
- **L4 (verificador independiente, post-review):** la versión que aprobó la
  revisión nativa decodificaba solo `\"`, así que un documento escapado con
  `\n`, `\t` o `\\` en los valores quedaba como JSON válido con el **valor
  equivocado** (51% de un corpus adversarial). S4 cambió a decodificar todas las
  secuencias; tests: `desescapa_todas_las_secuencias_no_solo_las_comillas`.
- **L3 (decisión del mantenedor):** la app **sugiere con un botón**, no convierte
  sola.

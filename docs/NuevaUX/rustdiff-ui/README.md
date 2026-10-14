# RustDiff UI — sistema de diseño sobre shadcn/ui

Proyecto de referencia (Vite + React 19 + Tailwind CSS v4 + shadcn/ui) con el nuevo diseño de RustDiff: tema oscuro y claro, colores semánticos de diff y la pantalla completa armada con datos de ejemplo.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## Qué hay aquí

```
src/
  index.css                 ← TODOS los tokens (shadcn + diff + sintaxis + superficies), claro y oscuro
  components/ui/            ← componentes shadcn (button, badge, select, toggle-group, tooltip,
                              dropdown-menu, table, resizable, input, kbd, separator, empty)
  components/diff/
    engine.ts               ← tipos DiffEntry / DocLine + motor de diff de DEMO
    code-pane.tsx           ← panel de código con números, marcadores + − ~ y énfasis
    diff-panel.tsx          ← filtros, búsqueda, navegación y tabla (JsonPath, ValueChip)
    diff-kind.tsx           ← DIFF_META (etiquetas/íconos) y diffTone (clases por tipo)
    app-header.tsx          ← barra de título (zona de arrastre de Tauri)
    syntax.tsx              ← resaltado de JSON por línea
    sample.ts               ← los documentos de tu captura
  App.tsx                   ← composición de la pantalla
ds/                         ← paquete para la guía visual (no lo necesitas en la app)
components.json             ← configuración del CLI de shadcn
```

## Llevarlo a tu proyecto

1. **Dependencias**
   ```bash
   npm i radix-ui class-variance-authority clsx tailwind-merge lucide-react \
         react-resizable-panels @fontsource-variable/geist @fontsource-variable/geist-mono
   npm i -D tailwindcss @tailwindcss/vite tw-animate-css
   ```
2. **Tokens**: reemplaza tu CSS global por `src/index.css`. Si ya usas el CLI de shadcn, conserva tu `components.json` y solo copia los bloques `@theme inline`, `:root` y `.dark`.
3. **Componentes**: copia `src/components/ui` y `src/components/diff` y `src/lib/utils.ts`. Puedes añadir más componentes con `npx shadcn@latest add <nombre>`: heredan los tokens automáticamente.
4. **Tema**: la clase `.dark` en `<html>` activa el oscuro (el script en `index.html` evita el parpadeo al abrir).

## Conectar el motor en Rust

La UI solo necesita dos estructuras. Si tu comando de Tauri devuelve esta forma, todo funciona sin cambios:

```ts
interface DiffEntry { id: string; kind: "added" | "removed" | "changed"; path: string;
                      left?: string; right?: string;            // valores serializados
                      leftLines?: [number, number]; rightLines?: [number, number] }
interface DocLine   { n: number; text: string; status?: DiffKind; entryId?: string;
                      emphasis?: [number, number] }               // tramo de caracteres a resaltar
```

En `App.tsx`, dentro de `compare()`, sustituye `computeDiff(...)` (y el `setTimeout` que simula la latencia) por `await invoke("compare", { left, right, options })`. Lo mismo con `parseDocument`: si Rust valida el documento, devuelve `{ ok:false, message, line, column }` para que el panel muestre el error.

## Estados que ya cubre la UI

Sin documento (soltar / abrir / pegar), arrastrando, JSON inválido con línea y columna, comparando (skeleton + spinner), idénticos, sin coincidencias. Atajos: ⌘↵ comparar, ⌘F buscar, ⌥↑ / ⌥↓ navegar. Abre `?vacio` en la URL para empezar sin documentos.

## Reglas rápidas

- Verde/rojo/ámbar **solo** para diferencias, y siempre con marcador o palabra.
- Usa tokens (`bg-diff-added/10`, `text-muted-foreground`), nunca `bg-green-500` ni hex.
- Una sola acción `primary` por vista (Comparar).
- Bordes de 1px para separar zonas; sombras solo en menús y popovers.

La guía visual completa (tokens, tipografía y componentes en vivo) está publicada como sistema de diseño “RustDiff”.

### Regenerar el paquete de la guía visual

```bash
npx vite build -c vite.ds.config.ts   # → dist-ds/bundle.js + bundle.css
```

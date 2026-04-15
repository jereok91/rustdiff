# RustDiff

[![Crates.io](https://img.shields.io/crates/v/rustdiff)](https://crates.io/crates/rustdiff)
[![License: GPL-3.0](https://img.shields.io/crates/l/rustdiff)](LICENSE)

Comparador semantico de documentos JSON y XML con interfaz grafica nativa, construido con Rust, GTK4 y Libadwaita.

## Instalacion rapida

```bash
# Instalacion automatica (detecta distro, instala deps, compila)
curl -fsSL https://raw.githubusercontent.com/jereok91/rustdiff/main/install.sh | bash

# O manualmente: instalar deps del sistema + cargo install
# (ver seccion "Requisitos del sistema" abajo)
cargo install rustdiff
```

```
rustdiff/
├── src/
│   ├── main.rs            # Punto de entrada
│   ├── app.rs             # Configuracion de la aplicacion GTK
│   ├── parser.rs          # Parser JSON/XML + pretty-print
│   ├── diff_engine.rs     # Motor de diff semantico
│   ├── export.rs          # Exportacion a .txt y .html
│   ├── storage.rs         # Persistencia SQLite (historial)
│   └── ui/
│       ├── main_window.rs # Ventana principal
│       ├── diff_panel.rs  # Tabla de diferencias
│       └── highlighter.rs # Resaltado en editores
└── tests/
    ├── parser_tests.rs
    └── diff_engine_tests.rs
```

## Requisitos del sistema

### Rust

Se necesita Rust 1.85 o superior (edition 2024).

```bash
rustup update stable
rustc --version  # debe ser >= 1.85
```

### Dependencias de sistema

La aplicacion usa bindings nativos a GTK4, Libadwaita y GtkSourceView 5. Necesitas las librerias de desarrollo instaladas.

**Arch Linux / CachyOS / Manjaro:**

```bash
sudo pacman -S gtk4 libadwaita gtksourceview5
```

**Fedora:**

```bash
sudo dnf install gtk4-devel libadwaita-devel gtksourceview5-devel
```

**Ubuntu / Debian (24.04+):**

```bash
sudo apt install libgtk-4-dev libadwaita-1-dev libgtksourceview-5-dev
```

**Nota:** SQLite no necesita instalarse aparte. La crate `rusqlite` viene con la feature `bundled` que compila SQLite directamente dentro del binario.

### Verificar dependencias

```bash
pkg-config --exists gtk4 && echo "gtk4: OK" || echo "gtk4: FALTA"
pkg-config --exists libadwaita-1 && echo "libadwaita: OK" || echo "libadwaita: FALTA"
pkg-config --exists gtksourceview-5 && echo "gtksourceview5: OK" || echo "gtksourceview5: FALTA"
```

Las tres deben mostrar `OK` antes de compilar.

## Compilar y ejecutar

### Modo desarrollo

```bash
cargo run
```

Para abrir dos archivos directamente desde la terminal:

```bash
cargo run -- archivo_izquierdo.json archivo_derecho.json
```

### Compilar release (optimizado)

```bash
cargo build --release
```

El binario queda en `target/release/rustdiff`. El perfil release aplica:
- Optimizacion maxima (`opt-level = 3`)
- Link-Time Optimization (`lto = "thin"`)
- Un solo codegen-unit para mejor inlining
- Strip de simbolos de debug
- Panic = abort (binario mas pequeno)

### Instalar en el sistema

```bash
cargo install --path .
```

Esto copia el binario a `~/.cargo/bin/rustdiff`. Asegurate de que `~/.cargo/bin` esta en tu `PATH`.

## Uso

### Interfaz grafica

Al abrir la aplicacion se muestra:

- **Dos editores** (izquierdo y derecho) con syntax highlighting para JSON y XML
- **Panel de diferencias** en la parte inferior con tabla filtrable
- **Barra de estado** con resumen de diferencias

Puedes:

1. **Pegar texto** directamente en los editores
2. **Abrir archivos** con los botones "Abrir Izq" / "Abrir Der"
3. La comparacion se ejecuta **automaticamente** al escribir (con debounce de 500ms)
4. Usar el boton **Comparar** para forzar una comparacion
5. **Formatear** ambos documentos con pretty-print
6. **Filtrar** diferencias por tipo (Anadidos, Eliminados, Modificados)
7. **Click** en una fila del panel de diferencias para navegar a esa posicion en ambos editores

### Linea de comandos

```bash
# Abrir la aplicacion vacia
rustdiff

# Abrir con dos archivos
rustdiff config_viejo.json config_nuevo.json

# Comparar archivos XML
rustdiff esquema_v1.xml esquema_v2.xml
```

### Atajos de teclado

| Atajo | Accion |
|---|---|
| `Ctrl+O` | Abrir archivo en panel izquierdo |
| `Ctrl+Shift+O` | Abrir archivo en panel derecho |
| `Ctrl+Enter` | Forzar comparacion |
| `Ctrl+S` | Guardar sesion en historial |
| `Ctrl+E` | Exportar resultado como .txt |
| `Ctrl+Shift+F` | Formatear (pretty-print) ambos paneles |
| `Ctrl+H` | Mostrar/ocultar panel de historial |

### Selector de formato

El dropdown "Auto-detectar" en la barra superior detecta el formato por el primer caracter del documento:
- `{` o `[` se interpreta como JSON
- `<` se interpreta como XML

Puedes forzar el formato manualmente seleccionando "JSON" o "XML".

## Historial de sesiones

Las comparaciones se guardan en una base de datos SQLite ubicada en:

```
~/.local/share/rustdiff/history.db
```

- Se guardan al presionar **Ctrl+S**
- Se almacenan las ultimas **20 sesiones** (las mas antiguas se eliminan automaticamente)
- Cada sesion guarda: ambos documentos, formato, fecha y resumen del diff
- El panel de historial (Ctrl+H) permite restaurar cualquier sesion anterior con un click

## Exportacion

Los resultados se pueden exportar en dos formatos:

- **Texto plano (.txt):** Reporte legible con secciones por tipo de diferencia
- **HTML (.html):** Tabla coloreada con CSS, documentos originales colapsables, listo para compartir

Accede desde el boton "Exportar" en la barra superior o con `Ctrl+E` para exportacion rapida a .txt.

## Modo oscuro

La aplicacion sigue automaticamente el tema del sistema operativo:

- Usa `adw::StyleManager` para detectar si el SO esta en modo oscuro
- Los editores SourceView cambian entre el esquema `Adwaita` (claro) y `Adwaita-dark` (oscuro)
- Los cambios de tema se aplican **en tiempo real** sin reiniciar la aplicacion

## Tests

```bash
# Ejecutar todos los tests
cargo test

# Solo tests del parser
cargo test --lib parser::

# Solo tests del motor de diff
cargo test --lib diff_engine::

# Solo tests de storage
cargo test --lib storage::

# Solo tests de integracion
cargo test --test parser_tests
cargo test --test diff_engine_tests
```

El proyecto tiene **104 tests** cubriendo:
- Parser JSON/XML (parsing, pretty-print, deteccion de formato, limites de tamano)
- Motor de diff semantico (objetos, arrays, nodos XML, atributos, rutas anidadas)
- Almacenamiento SQLite (CRUD, poda automatica, serializacion, caracteres especiales)
- Exportacion (texto plano, HTML, escape de caracteres)
- Utilidades del highlighter (extraccion de claves, limpieza de valores)

## Variables de entorno

| Variable | Descripcion | Ejemplo |
|---|---|---|
| `RUST_LOG` | Nivel de logging (tracing) | `RUST_LOG=info cargo run` |

Niveles disponibles: `error`, `warn` (default), `info`, `debug`, `trace`.

## Stack tecnico

| Componente | Crate | Version |
|---|---|---|
| UI | gtk4 | 0.9 |
| Tema moderno | libadwaita | 0.7 |
| Editor con syntax highlighting | sourceview5 | 0.9 |
| Parser JSON | serde_json | 1 |
| Parser XML | quick-xml | 0.36 |
| Motor de diff | similar | 2 |
| Base de datos | rusqlite (SQLite bundled) | 0.31 |
| Async runtime | tokio | 1 |
| Logging | tracing + tracing-subscriber | 0.1 / 0.3 |
| Manejo de errores | thiserror + anyhow | 1 |

## Licencia

MIT

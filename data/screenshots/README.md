# Screenshots para AppStream / Flathub

Este directorio aloja las capturas que referencia
`data/com.digitalgex.RustDiff.metainfo.xml`.

Flathub las consume desde la URL pública de GitHub:

```
https://raw.githubusercontent.com/jereok91/rustdiff/main/data/screenshots/<nombre>.png
```

## Archivos esperados

| Archivo         | Descripción                                                        |
|-----------------|--------------------------------------------------------------------|
| `main.png`      | Captura principal: dos JSON comparados con resaltado de diferencias |
| `diff-table.png`| Vista inferior de la tabla de diferencias con filtros activos      |
| `history.png`   | Panel lateral de historial con varias sesiones guardadas           |

## Requisitos técnicos (Flathub / AppStream)

- Formato **PNG** (preferido) o JPG. **SVG no se acepta**.
- Mínimo **1280×720**, máximo **3840×2160**.
- Aspect ratio razonable (16:9 recomendado).
- Sin información personal, tokens, rutas del sistema de archivos privadas, etc.
- El cromo de la ventana (title bar) debe ser visible — Flathub lo exige.

## Cómo capturar en GNOME

```bash
# Ventana completa con decoración
gnome-screenshot -w -f data/screenshots/main.png
```

Luego súbelas al repo (`git add data/screenshots/*.png`) y haz push. Las URLs
referenciadas en `metainfo.xml` las servirá GitHub automáticamente.

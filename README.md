# DokkanDB (móvil)

App web instalable (PWA) para Android con la base de datos de **Dragon Ball Z Dokkan Battle**.
Se actualiza sola con la [Dokkan Wiki](https://dbz-dokkanbattle.fandom.com/) y funciona sin conexión.

## Cómo funciona

- La primera vez descarga todas las cartas (LR, UR, SSR) y los banners desde la API pública de la wiki y los guarda en el móvil.
- Después, cada vez que se abre (y cada 30 min mientras está abierta) pregunta a la wiki qué páginas han cambiado y descarga **solo esas**. Las cartas nuevas salen con la etiqueta **NUEVA**.
- No hace falta servidor: el móvil habla directamente con la wiki.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `css/app.css` | Interfaz |
| `js/app.js` | Pantallas y navegación. Para añadir una función nueva: crea una vista en `views`, añade su ruta en `ROUTES` y, si quieres, una pestaña en `index.html`. |
| `js/sync.js` | Sincronización (completa la primera vez, incremental después) |
| `js/wiki.js` | Llamadas a la API de la wiki |
| `js/parse.js` | Convierte el texto de la wiki en datos (cartas, banners) |
| `js/db.js` | Base de datos local del móvil (IndexedDB) |
| `sw.js` | Modo sin conexión y caché de imágenes. **Sube `VERSION` cada vez que cambies archivos.** |

## Probar en el PC

```bash
npm start
```

Abre http://localhost:5173

Para comprobar que el lector sigue entendiendo el formato de la wiki:

```bash
npm run check
```

## Publicar (para instalarla en el móvil)

La app tiene que estar en una dirección `https://`. Lo más sencillo es GitHub Pages: sube esta carpeta a un repositorio y activa *Settings → Pages → Deploy from branch → main*. Luego abre la dirección en Chrome del móvil y pulsa *Añadir a pantalla de inicio*.

## Fuentes

Datos de la Dokkan Wiki (Fandom), licencia CC BY-SA. App de fans, sin relación con Bandai Namco ni Akatsuki.

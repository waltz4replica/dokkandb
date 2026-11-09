# DokkanDB (móvil)

App web instalable (PWA) para Android con la base de datos de **Dragon Ball Z Dokkan Battle**.
Se actualiza sola y funciona sin conexión. Publicada en https://waltz4replica.github.io/dokkandb/

## De dónde salen los datos

| Datos | Fuente | Quién lo actualiza | Archivo |
|---|---|---|---|
| Cartas LR / UR / SSR (con EZA, SEZA y transformaciones) | [DOKKAN.FYI](https://dokkan.fyi) — datos sacados del juego | GitHub, cada 3 h | `data/cards.json` |
| Banners | [Dokkan Wiki](https://dbz-dokkanbattle.fandom.com/) | El propio móvil, al abrir la app | — |
| Noticias del juego | DOKKAN.FYI | GitHub, cada 3 h | `data/extra.json` |
| Tier list y eventos activos | [DokkanStats](https://dokkanstats.com) | **Este PC**, cada 3 h y al iniciar sesión | `data/extra.json` |

- DokkanStats bloquea los servidores de GitHub, por eso esa parte va desde el PC (tarea de Windows "DokkanDB - actualizar datos"). Si el PC está apagado, la app sigue mostrando los últimos datos subidos.
- Todas las fuentes permiten la lectura automática en su `robots.txt`. Se lee despacio (1 página por segundo).
- DokkanDB.com y dokkaninfo.com no se usan: la primera solo tiene una API privada y la segunda bloquea los programas automáticos.

## Cómo se mantienen las cartas al día

`scripts/build-cards.mjs` (lo ejecuta `.github/workflows/scrape.yml`):

- **Primera vez / `--full`:** recorre el listado de personajes de DOKKAN.FYI, lee la ficha (`.md`) de cada LR/UR/SSR y sus transformaciones, y toma las fechas de EZA/SEZA de su línea temporal. ~30 min.
- **Cada 3 horas:** mira las primeras páginas del listado y la línea temporal, lee solo las cartas nuevas o con EZA/SEZA nuevo, y repasa 60 cartas antiguas para recoger correcciones (todas cada 2-3 días).
- Si se corta a medias, guarda lo pendiente en `data/cards-state.json` y sigue en la siguiente ejecución.
- La app solo descarga `cards.json` cuando cambia `data/cards-meta.json`.

Para relanzar la carga completa: GitHub → Actions → "Actualizar cartas…" → *Run workflow* → marcar "Volver a leer todas las cartas".

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `css/app.css` | Interfaz |
| `js/app.js` | Pantallas y navegación. Para añadir una función nueva: crea una vista en `views`, añade su ruta en `ROUTES` y, si quieres, una pestaña en `index.html`. |
| `js/sync.js` | Sincronización en el móvil (cartas, banners, extra) |
| `js/wiki.js`, `js/parse.js` | API de la wiki y lector de banners |
| `js/db.js` | Base de datos local del móvil (IndexedDB) |
| `sw.js` | Modo sin conexión y caché de imágenes. **Sube `VERSION` cada vez que cambies archivos de la app.** |
| `scripts/fyi.mjs` | Lector de DOKKAN.FYI (fichas, listado, línea temporal) |
| `scripts/build-cards.mjs` | Genera `data/cards.json` |
| `scripts/scrapers.mjs`, `scripts/scrape.mjs` | Tier list, eventos y noticias → `data/extra.json` |
| `scripts/update-from-pc.ps1`, `scripts/install-task.ps1` | Tarea de Windows que sube la tier list y los eventos |

Si una web cambia su diseño, el lector a corregir está en `scripts/fyi.mjs` o `scripts/scrapers.mjs`.

## Probar en el PC

```bash
npm start
```

Abre http://localhost:5173

Comprobaciones de los lectores (con páginas guardadas):

```bash
node tests/fyi-check.mjs <carpeta-con-paginas>
```

## Tarea de Windows

- Instalar o reinstalar: `powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1`
- Registro: `logs/update.log`

App de fans, sin relación con Bandai Namco ni Akatsuki.

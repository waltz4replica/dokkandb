# Plan de publicación de versiones

## Canales

| Canal | Web | Rama | Para qué |
|---|---|---|---|
| **Estable** | https://waltz4replica.github.io/dokkandb/ | `main` | La app de uso diario. Solo versiones probadas. |
| **Beta** | https://waltz4replica.github.io/dokkandb/beta/ | `beta` | Funciones nuevas para probarlas antes. Se instala aparte ("DokkanDB Beta") y guarda sus datos y equipos por separado. |

Las dos usan siempre los datos más recientes (cartas, banners, eventos…): los datos no tienen versión.
La web la monta `.github/workflows/deploy.yml` cada vez que cambia `main` o `beta` y después de cada actualización de datos.

## Números de versión

`MAYOR.MENOR.CORRECCIÓN`, como en [CHANGELOG.md](CHANGELOG.md):

| Tipo de cambio | Ejemplo | Por dónde va |
|---|---|---|
| Corrección | 2.6.1 → 2.6.2 | Directo a estable |
| Función nueva | 2.6.x → 2.7.0-beta.1 → 2.7.0-beta.2 → 2.7.0 | Primero beta |
| Cambio grande (p. ej. otra fuente de datos) | 2.x → 3.0.0-beta.1 → … → 3.0.0 | Beta más tiempo |

## Cuándo se publica

- **Correcciones:** en cuanto estén probadas.
- **Funciones nuevas:** a la beta en cuanto funcionen. Pasan a estable cuando se confirme que van bien en el móvil, o tras **1–2 días sin fallos**.
- **Cambios grandes:** al menos una semana en beta.

## Comprobaciones antes de publicar

`release.ps1` hace las automáticas y se para si algo falla:
1. Las tres copias del número de versión coinciden (`js/version.js`, `sw.js`, `package.json`).
2. Pruebas: `tests/teams-check.mjs` y `tests/effects-check.mjs` (con los datos reales) y, si existe la carpeta de páginas guardadas `%TEMP%\dokkan-probe`, `tests/scrapers-check.mjs` y `tests/fyi-check.mjs`.

A mano, antes de lanzar el script:
3. Abrir la app en el PC (`npm start`) con tamaño de móvil y revisar Inicio, Cartas, una ficha, Banners, un banner, Equipos y Tier list.
4. Escribir las novedades: en `NEXT.md` (beta) o con `-Notes` (corrección).

## Cómo se publica

Todo el trabajo tiene que estar guardado en commits antes de lanzar el script.

**Beta** (en la rama `beta`; las novedades en `NEXT.md`):
```powershell
.\scripts\release.ps1 beta              # 2.7.0-beta.1, luego beta.2, ...
.\scripts\release.ps1 beta -Bump major  # empezar 3.0.0-beta.1
```
Antes de publicar, la beta recoge automáticamente las correcciones de `main`.

**Pasar la beta a estable:**
```powershell
.\scripts\release.ps1 stable -FromBeta  # 2.7.0-beta.3 -> 2.7.0
```
Lleva `beta` a `main`, mueve `NEXT.md` al CHANGELOG y vacía `NEXT.md`.

**Corrección directa en estable** (en `main`):
```powershell
.\scripts\release.ps1 stable -Notes "Corregido: ...", "Corregido: ..."
```

En todos los casos el script: pone el número en los tres archivos, escribe el historial, hace el commit,
crea la etiqueta (`v2.7.0`), sube, crea la página de la versión en
[GitHub Releases](https://github.com/waltz4replica/dokkandb/releases) (las beta marcadas como *pre-release*)
y espera a que la web muestre la versión nueva.

## Qué ve el usuario

Al abrir la app después de una actualización aparece la ventana **Novedades de la versión X** con sus notas
(en la beta, las de `NEXT.md`). También se pueden ver en Ajustes → Novedades. En Ajustes se cambia de canal.

## Si algo sale mal

```powershell
.\scripts\release.ps1 rollback -To v2.6.1
```
Vuelve a publicar esa versión en la web estable en 1–3 minutos (los móviles la reciben al abrir la app).
Dura hasta la próxima subida a `main` o actualización de datos, así que hay que publicar la corrección
cuanto antes (`release.ps1 stable -Notes ...`).

## Primera vez en otro PC

Hace falta Git, Node.js y GitHub CLI (`gh auth login`) con acceso al repositorio.

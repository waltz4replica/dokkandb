# Historial de versiones

Cada versión está marcada en Git con su número (`v1.0.0`, `v2.0.0`…).
Formato: **MAYOR.MENOR.CORRECCIÓN**
- **MAYOR**: cambio grande (por ejemplo, cambiar de dónde salen los datos).
- **MENOR**: función nueva.
- **CORRECCIÓN**: arreglos pequeños.

Las actualizaciones automáticas de datos ("Datos actualizados") no cambian la versión: son contenido, no código.

## 2.3.0 — 2026-11-09
- **Asistente de equipos:**
  - «Recomendadas para tu equipo»: tarjetas que se actualizan con cada carta que eliges (cobertura del líder, links con el equipo y si ayuda a cumplir pasivas). Un toque las añade.
  - Botón **Completar**: monta el resto del equipo (y elige líder si falta) y optimiza el orden.
  - Sin líder pero con cartas: muestra solo los líderes que mejor las cubren.
- **Editor más gráfico:** recuadros de Líder y Amigo con su % y a quién afectan, borde de color por tipo, barra de resumen, rotación dibujada con los links entre cada pareja (toca un turno para ver sus nombres), barras de categorías compartidas.
- **Detalle por unidad:** cobertura de líder y amigo, categorías que pide su pasiva (✓/✗ según tu equipo) y apoyo que da al equipo.
- **Deshacer** cualquier cambio.
- **Borrar equipos** desde la lista (🗑) y desde el editor.
- Corregido: al volver a una pantalla, los toques se registraban varias veces (cartas añadidas dos veces, filtros de Cartas que no respondían).

## 2.2.0 — 2026-11-09
- **Nuevo apartado Equipos** (creador de equipos):
  - 7 huecos: Líder, 5 unidades y Amigo. Al poner un líder, el amigo se rellena con el mismo.
  - Buscador para cada hueco: muestra primero las cartas que cubre el líder y que más links comparten con tu equipo. Para el hueco de líder, ordena por la fuerza de la habilidad.
  - Sugerir líder a partir de las unidades que ya tienes.
  - Análisis: qué cartas cubren el líder y el amigo (con % y Ki), rotación de 7 turnos con los links activos en cada turno, categorías compartidas, coste total y tipos.
  - Optimizar orden: recoloca las unidades 2-6 para activar el máximo de links.
  - Regla del juego: no deja repetir nombre en tus 6 cartas (el amigo sí puede).
  - Guardar varios equipos en el móvil y compartirlos con un enlace.

## 2.1.0 — 2026-11-09
- **Banners al día** desde DokkanStats (la wiki llevaba desde septiembre sin banners nuevos): fechas de inicio y fin, estado (Activo / Próximamente / Terminado) y cartas destacadas. Se actualizan desde el PC, como la tier list.
- Pantalla de Banners ordenada en Activos ahora, Próximamente, Permanentes y Anteriores.
- Inicio reorganizado: primero los banners activos y las cartas nuevas, después EZA/SEZA, noticias y tier list.
- Cartas agrupadas por fecha de salida en Inicio y en la lista de Cartas.
- Corregido: las 122 cartas SSR no tenían tipo (AGL, TEQ…) y algunos nombres de cartas dobles salían cortados.

## 2.0.1 — 2026-11-09
- Número de versión visible en Ajustes y aviso al actualizarse la app.
- Este historial de versiones.
- Las fichas que se abren antes de terminar la descarga se actualizan solas.

## 2.0.0 — 2026-11-09
- **Las cartas salen de DOKKAN.FYI** (datos sacados del juego) en lugar de la Dokkan Wiki, que iba con meses de retraso.
- 1.152 cartas LR, UR y SSR con su texto exacto, EZA, SEZA y fechas.
- Las transformaciones se muestran dentro de cada carta.
- GitHub actualiza las cartas cada 3 horas; la app solo descarga el archivo cuando cambia.
- La wiki se usa solo para los banners.

## 1.1.0 — 2026-11-09
- Pestañas nuevas: **Eventos** (eventos activos y noticias del juego) y **Tier list**.
- Ajustes pasa al icono del engranaje.
- Noticias desde DOKKAN.FYI (GitHub, cada 3 horas).
- Tier list y eventos desde DokkanStats, actualizados por una tarea de Windows en el PC.

## 1.0.0 — 2026-11-09
- Primera versión: app web instalable para Android.
- Cartas y banners de la Dokkan Wiki, con búsqueda, filtros, fichas con EZA/SEZA y modo sin conexión.

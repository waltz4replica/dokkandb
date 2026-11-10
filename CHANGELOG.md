# Historial de versiones

Cada versión está marcada en Git con su número (`v1.0.0`, `v2.0.0`…).
Formato: **MAYOR.MENOR.CORRECCIÓN**
- **MAYOR**: cambio grande (por ejemplo, cambiar de dónde salen los datos).
- **MENOR**: función nueva.
- **CORRECCIÓN**: arreglos pequeños.

Las actualizaciones automáticas de datos ("Datos actualizados") no cambian la versión: son contenido, no código.
Las novedades que todavía están en la beta van en [NEXT.md](NEXT.md). Cómo se publica: [RELEASING.md](RELEASING.md).

## 2.8.0 — 2026-11-10
- **Más filtros en Cartas** (botón «Más filtros: categorías y habilidades»):
  - **Categorías:** elige una o varias; salen las cartas que las tienen todas.
  - **Qué hace la carta**, leído de su pasiva, súper ataques y habilidad activa (al nivel más alto y con sus transformaciones):
    - Ataque: acumula ATK, ataca a todos los enemigos, ataques adicionales, golpe crítico, eficaz contra todos los tipos.
    - Defensa: acumula DEF, reduce el daño recibido, esquiva, guardia, contraataca, recupera vida.
    - Contra el enemigo: baja su ATK, baja su DEF, aturde, sella súper ataques.
    - Orbes y apoyo: cambia orbes, apoya a aliados, habilidad activa, se transforma, revive.
  - **Cambia orbes a:** AGL, TEQ, INT, STR, PHY o arcoíris.
  - Se pueden combinar entre sí y con los filtros de siempre.
- En cada carta, nuevo recuadro **«Guía rápida»** (automático, a partir del texto de la carta):
  - **Resumen:** su papel (atacante, tanque, apoyo o todoterreno), en qué destaca, el Ki y ATK/DEF que siempre tiene y cómo se hace más fuerte.
  - **Qué hace:** sus efectos; al tocar uno salen todas las cartas que lo tienen.
  - **En qué equipo:** los líderes que mejor la cubren, por categoría, con su % (toca uno para ver la carta). Y si ella misma sirve de líder.
  - **En qué eventos:** Zona Roja, jefes que pegan fuerte, fases con varios enemigos… según lo que hace.
  - **Slot:** si su pasiva premia atacar o recoger orbes en un orden concreto, o si da igual.
  - **Cuándo usarla:** turnos fuertes desde que entra, efectos a partir de cierto turno, habilidad activa, transformaciones e intercambios.
  - Su posición en la tier list, si está.
- **Cartas que no son para combatir:**
  - **Elder Kai, Grand Kai, las de Navidad y la Princesa Serpiente** llevan la etiqueta verde **ENTRENAR**. Su guía explica que solo sirven en Entrenamiento para subir el súper ataque de otra carta (siempre o con un 30%, y si solo vale para un tipo). Ya no salen como opción en el creador de equipos.
  - **Estatuas de Mr. Satán:** en los banners salen con la etiqueta **VENDER** y lo que valen en zeni («Estatua de Mr. Satán · 1.000.000 zeni»).
  - En los banners que tienen estas cartas, un aviso explica para qué sirven.
- **Mis cartas:** botón **☆ La tengo** en cada carta. Las tuyas llevan una ★, se filtran con **★ Mis cartas** en Cartas y con **★ Solo mis cartas** al elegir unidades para un equipo.
- **Copia de seguridad** en Ajustes → Tus datos: copia y restaura tus cartas y equipos (para cambiar de móvil).
- **Compartir** una carta con un enlace.
- Los **filtros de Cartas se recuerdan** aunque cierres la app.
- **Eventos:** buscador y orden por **💎 Más piedras**; cada evento muestra cuántas Dragon Stones da.
- En las cartas de entrenamiento ya no salen estadísticas ni secciones vacías.
- Corregido: al volver de una carta a la lista de Cartas, la lista saltaba a otro sitio.
- Corregido: sin conexión, el aviso hablaba de «la wiki» (ya no se usa) y ahora explica qué pasa.
- La app descarga menos: quitado código antiguo de la wiki que ya no se usaba.
- Corregido: la ventana de novedades no mostraba bien las listas en algunos casos.
- **Guía rápida y filtro «Acumula ATK/DEF» más precisos:**
  - Ya no marcan como «acumula» las cartas cuyo ATK o DEF **baja** con los turnos, ni las que suben una sola vez (desde el turno 4, al entrar en combate…), ni los súper ataques que suben ATK solo durante 1 turno («Greatly raises ATK, raises DEF for 1 turn»).
  - Las cartas que se debilitan con los turnos lo dicen («Pierde ATK, DEF… con cada turno que pasa») y se recomiendan para batallas cortas y para sacarlas al principio, no para combates largos.
  - Los efectos «durante los primeros N turnos del combate» ahora también cuentan como turnos fuertes.
- **Nueva sección «📈 Cómo cambian sus estadísticas»** en la Guía rápida, con la cuenta hecha:
  - Para las cartas cuyo ATK, DEF, reducción de daño o esquiva **sube o baja cada turno**: tabla turno a turno (por ejemplo +600%, +540%… hasta +300% desde el turno 6), la operación de cada fila y el porqué (valor inicial, cuánto cambia, límite y en qué turno lo alcanza).
  - Para las que suben **por cada ataque, súper ataque u orbe**: cuánto ganan cada vez, el máximo y cuántas veces hacen falta para llegar.
  - Los extras de un solo ataque («al atacar con 12 o más de Ki») se suman a la tabla para ver el total.
  - El resumen de arriba ya dice desde dónde empieza y hasta dónde llega.
- **Guía rápida revisada y reescrita** para que se entienda mejor (frases más claras: «Lo que mejor hace», «Su pasiva le da siempre…», «Cuándo usarla»…). Además se han corregido estos fallos:
  - Lo que hace una **transformación** ya no se presenta como si la carta lo tuviera siempre: ahora pone «Se transforma en X, que…».
  - Las mejoras que da **a sus aliados** ya no se cuentan como si se hiciera más fuerte ella misma.
  - «Su pasiva le da siempre Ki +X» solo cuenta lo que da de verdad siempre («Basic effect»), no el Ki que gana atacando.
  - Las condiciones con **«o»** (por ejemplo «con 60% de vida o menos, o desde el turno 3») ya no se leen como si hiciera falta todo a la vez.
  - Las habilidades activas dicen **qué aliados, categorías o enemigos** hacen falta, y también «tras atacar N veces».
  - Detecta lo que **pierde** al recibir ataques o hacer súper ataques, y los valores que gana con su **animación de entrada**.
  - Efectos «durante 4 turno(s)» que antes no se reconocían.
  - Cartas que solo daban un pequeño extra a aliados en ciertos casos ya no salen como «Apoyo».
  - Las cartas muy simples (sin efectos especiales) ya tienen resumen.
- **Nuevo aspecto, más vistoso:**
  - Fondo con brillos de color suaves, y barras de arriba y de abajo translúcidas.
  - Cada carta brilla con el **color de su tipo** (AGL azul, TEQ verde, INT morado, STR rojo, PHY naranja), también en la cabecera de su ficha.
  - La pestaña en la que estás se marca con una pastilla; títulos de sección, botones, filtros, banners y ventanas rediseñados.
  - Animaciones suaves al cambiar de pantalla, al pulsar y al cargarse las imágenes (se desactivan si el móvil tiene «reducir movimiento»).
- **Inicio:** buscador de cartas arriba del todo y accesos rápidos con el número de cartas, tus cartas y tus equipos.
- Tocar la pestaña en la que ya estás **vuelve arriba** de la lista.
- Las estadísticas de las cartas salen con separador de miles (12.345).
- La ventana de novedades se cierra también con la tecla Escape.
- Corregido: en el creador de equipos, **Deshacer** no devolvía las cartas a su sitio después de «Mover», «Optimizar», «Completar» o «Aleatorio».
- Corregido: si llegaban datos nuevos mientras escribías en un buscador, la pantalla se redibujaba y se cerraba el teclado.
- Corregido: un enlace mal escrito o una carta con datos incompletos podían dejar la pantalla en blanco; ahora sale un aviso con un botón para volver al inicio.
- Corregido: el hueco vacío que quedaba arriba en algunas pantallas.

## 2.7.0 — 2026-11-10
- **Canal beta:** las funciones nuevas salen primero en https://waltz4replica.github.io/dokkandb/beta/ para probarlas. Se instala aparte (DokkanDB Beta) y guarda sus datos y equipos por separado. Se abre desde Ajustes.
- **Ventana de novedades:** al actualizarse, la app enseña qué ha cambiado. También en Ajustes → Novedades.
- Cada versión tiene su página en GitHub Releases y se publica con un solo comando (plan completo en RELEASING.md).

## 2.6.1 — 2026-11-10
- Corregido: en la lista de banners, la última miniatura se salía del recuadro en pantallas estrechas. Ahora se encogen para caber.

## 2.6.0 — 2026-11-10
- **Rareza y tipo sobre cada carta:** etiqueta pequeña en la esquina de la imagen (LR / UR / SSR y AGL, TEQ, INT, STR, PHY con su color). Relleno de color = Super; solo borde de color = Extreme. Sale en Inicio, Cartas, Banners, Tier list y en la formación de Equipos.

## 2.5.0 — 2026-11-09
- **Banners por bloques:** al entrar en un banner, las cartas salen separadas en **★ Principales** (las protagonistas, más grandes y con brillo), **Featured** (SSR con probabilidad aumentada) y **Secundarios** (SR y R), más cuántas cartas pueden salir sin probabilidad aumentada.
- En la lista de banners, las cartas principales llevan un borde naranja.
- Los datos salen de la página de cada banner en DokkanStats (se leen desde el PC, una vez por banner).

## 2.4.0 — 2026-11-09
Creador de equipos rehecho siguiendo el de DokkanStats:
- **Formación como en el juego:** Rotación 1 y Rotación 2 (2 cartas cada una, siempre juntas) y 3 floaters. Las cartas se unen con **líneas de colores, una por cada link** compartido.
- Bajo cada carta: L/A (% de líder y amigo) y **ATK, DEF y Ki que le dan sus links** activos.
- Recuadros grandes de **Líder y Amigo** con el total que dan al equipo («Equipo: +1540%»).
- **Optimizar** busca la mejor formación entre todas las posibles.
- Pestaña **Resumen**: **sinergia 0-100** con barras (cobertura del líder, calidad de links, condiciones de pasiva, apoyo y valoración según la tier list), mínimo y media de cada líder, coste, tipos, rarezas, EZA/SEZA, **links compartidos** (con su efecto a nivel 10, las cartas que lo tienen y «x/7»), **links sin usar** y categorías.
- Pestaña **Rotaciones**: las 6 combinaciones (cada rotación con cada floater) con los números de cada carta.
- Pestaña **Unidades**: condiciones de pasiva y apoyo de cada carta.
- Botón **Aleatorio**: crea un equipo con un líder al azar.
- Los datos de cartas incluyen ahora el efecto de cada link a nivel 10.

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

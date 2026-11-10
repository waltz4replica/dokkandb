# Próxima versión
<!-- Novedades que están en la beta y todavía no en la versión estable.
Escríbelas como lista ("- ..."). Al pasar la beta a estable (release.ps1 stable -FromBeta)
pasan a CHANGELOG.md y este archivo se vacía. Ver RELEASING.md. -->
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

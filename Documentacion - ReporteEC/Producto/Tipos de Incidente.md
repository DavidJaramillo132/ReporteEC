---
tags: [producto, taxonomia, tipos]
actualizado: 2026-09-23
---

# Tipos de Incidente

Lista única de tipos que usa todo el sistema: el filtro del mapa, los íconos,
las estadísticas y el formulario de reporte. Adoptada el 2026-09-23 a partir
de la recomendación del punto 8 de [[Decisiones de Negocio Pendientes]].

## Por qué hace falta una lista común

Cada fuente clasifica a su manera: el Ministerio del Interior usa
`tipo_muerte` (homicidio, asesinato, femicidio, sicariato), el sitio de la
Policía usa sus propias categorías y los usuarios eligen de un formulario. Sin
una lista común, el filtro «por tipo» no tendría sobre qué operar. Cada
fuente se **traduce** a esta lista al entrar al sistema.

## La lista

| Tipo | Qué incluye | De dónde viene | Desde |
|---|---|---|---|
| **Homicidio** | Muerte violenta intencional: homicidio y asesinato según el COIP | Ministerio del Interior, Policía, reportes | v1 |
| **Sicariato** | Muerte por encargo, a cambio de pago | Ministerio del Interior, Policía | v1 |
| **Femicidio** | Muerte de una mujer por razón de género | Ministerio del Interior | v1 |
| **Persona desaparecida** | Desaparición denunciada, aún no localizada | Ministerio del Interior, reportes | v1 |
| **Siniestro de tránsito** | Choques, atropellos, volcamientos | INEC (por cantón), reportes | v1 |
| **Tiroteo / disparos** | Disparos escuchados o vistos, sin víctima confirmada | Reportes | v2 |
| **Robo / asalto** | Robo a personas, domicilios, locales o vehículos | Policía, reportes | v2 |
| **Secuestro** | Privación de libertad, incluido el secuestro extorsivo | Policía, reportes | v2 |
| **Extorsión** | Cobro de «vacunas» y amenazas para obtener dinero | Policía, reportes | v2 |
| **Violencia sexual** | Violación y otros delitos sexuales | **Solo fuentes oficiales** | Cuando exista una fuente oficial |
| **Pelea / riña** | Peleas en la vía pública | Reportes | v2 |
| **Otro** | Lo que no encaja en ninguno de los anteriores | Reportes | v2 |

> [!note] Detenidos no es un tipo de incidente
> Las detenciones son **actividad policial**, no un hecho de inseguridad, y
> van en su propia capa de mapa de calor. No aparecen en esta lista.

## Reglas

- **Homicidio y asesinato se agrupan** en un solo tipo para el público. La
  diferencia es jurídica y el dato original se conserva.
- **Robo no tiene fuente oficial** con coordenadas: en la v1 no aparece (ver
  [[Fuentes]]).
- Cada tipo tiene su propio **color y forma** de marca; el nivel de confianza
  se dibuja como **estilo de trazo** (relleno, discontinuo, rayado o vacío).
  Decidido el 2026-09-25 ([[Niveles de Confianza]]).

## Violencia sexual: solo fuentes oficiales

> [!success] Decidido el 2026-09-24
> - **No aparece en el formulario** de reporte ciudadano.
> - **Solo entra desde fuentes oficiales.** Las noticias de la Policía
>   (🟡 Reportado), los reportes ciudadanos y las fuentes de Telegram no la
>   cargan: esas noticias se descartan al ingresar.
> - Nunca se muestra con ubicación exacta.
>
> Motivo: un reporte público con ubicación puede exponer a la víctima.
>
> Hoy **ninguna fuente oficial cargada** trae este tipo, así que no aparecerá
> en el mapa. Se buscó en el portal de datos abiertos sin resultado útil
> ([[Fuentes]]) y **se decidió no seguir buscando**: el proyecto continúa con
> las fuentes que ya tiene.

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
| **Violencia sexual** | Violación y otros delitos sexuales | Policía | v2 |
| **Pelea / riña** | Peleas en la vía pública | Reportes | v2 |
| **Otro** | Lo que no encaja en ninguno de los anteriores | Reportes | v2 |

> [!note] Detenidos no es un tipo de incidente
> Las detenciones son **actividad policial**, no un hecho de inseguridad, y
> van en su propia capa de mapa de calor. No aparecen en esta lista.

## Reglas

- **Homicidio y asesinato se agrupan** en un solo tipo para el público. La
  diferencia es jurídica y el dato original se conserva.
- *(Propuesta, pendiente de confirmar)* **Violencia sexual no se ofrece en el
  formulario de reporte ciudadano.** Es
  un delito donde un reporte público puede exponer a la víctima; solo entra
  desde fuentes oficiales o policiales, y nunca con ubicación exacta.
- **Robo no tiene fuente oficial** con coordenadas: en la v1 no aparece (ver
  [[Fuentes]]).
- Cada tipo tiene un **ícono** propio; el color del marcador es el nivel de
  confianza ([[Niveles de Confianza]]).

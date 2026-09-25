---
tags: [producto, confianza, nucleo]
actualizado: 2026-09-22
---

# Niveles de Confianza

Sistema de etiquetado que acompaña a **todo** incidente mostrado en la
plataforma. Es el diferenciador del producto y su principal salvaguarda legal:
la plataforma nunca afirma que algo ocurrió, declara qué respaldo tiene esa
afirmación y quién la sostiene.

## Escala

| Estado | Significado |
|---|---|
| 🟢 Oficial | Fuente institucional |
| 🔵 Verificado | Confirmado mediante múltiples fuentes |
| 🟡 Reportado | Existe una fuente periodística |
| 🟠 En revisión | Información pendiente de verificar |

## Colores en el mapa

> [!success] Decidido el 2026-09-25 (reemplaza la decisión del 2026-09-23)
> **El color y la forma de la marca indican el tipo de incidente.** La
> **confianza se dibuja como estilo de la marca**: rellena = Oficial, borde
> discontinuo = Verificado, rayada = Reportado, vacía con borde discontinuo =
> En revisión, además de su etiqueta en la ficha del caso.
>
> Motivo: en la V1 todos los datos son oficiales, así que con el color por
> confianza todas las marcas salían del mismo verde y el color no informaba
> nada.
>
> ~~2026-09-23: el color indica la confianza y el tipo va con ícono.~~

## Vigencia (eje independiente)

La escala anterior solo indica **cómo se confirmó** un dato. **De cuándo es**
se expresa en un atributo aparte:

| Vigencia | Significado |
|---|---|
| Reciente | Pertenece al periodo actual |
| Histórico | Pertenece a un año anterior al actual |

El color de confianza **nunca cambia** según el año que consulte el usuario.
Un homicidio de 2015 registrado por el Ministerio del Interior se muestra como
«🟢 Oficial · 2015».

> [!note] Cambio respecto a la idea original
> En [[Ideas Sueltas]] existía un quinto nivel, ⚪ Histórico, aplicado cuando el
> usuario consultaba un año anterior. Se retiró de la escala porque mide
> tiempo, no verificación, y hacía que un mismo dato cambiara de color según
> el filtro. Decisión del 2026-09-22; ver [[Decisiones de Negocio Pendientes]].

## Reglas de asignación

- Todo registro procedente de [[Fuentes]] oficiales nace en 🟢 **Oficial**.
- Todo reporte ciudadano nace en 🟠 **En revisión** y **nunca asciende de nivel
  automáticamente**. La promoción exige intervención humana o corroboración por
  una fuente independiente.
- Junto a la etiqueta debe mostrarse siempre la fuente concreta, no solo el
  color. Un badge sin procedencia verificable no cumple la función.

## Implicación de diseño

Este sistema condiciona el modelo de datos desde el inicio: cada incidente
necesita persistir su origen, su nivel actual y el historial de cambios de
nivel. No puede añadirse después como una columna más.

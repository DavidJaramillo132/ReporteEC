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
| ⚪ Histórico | Dato estadístico/histórico |

> [!warning] Sobre ⚪ Histórico — incoherencia detectada
> Tal como está definido («se aplica cuando el usuario consulta un año anterior
> al actual»), el mismo dato cambiaría de etiqueta según el filtro activo.
> ⚪ Histórico mide **tiempo**, no verificación: es un eje distinto al del
> resto de la escala. Ver [[Decisiones de Negocio Pendientes]].

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

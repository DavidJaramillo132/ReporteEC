---
tags: [producto, decisiones, logica-negocio]
actualizado: 2026-09-22
---

# Decisiones de Negocio Pendientes

Incoherencias y huecos en la lógica del producto detectados al contrastar
[[Ideas Sueltas]] con los datos ya verificados en [[Calidad de Datos]].

> [!important] Por qué esto es urgente
> La mayoría no son defectos, son **decisiones todavía no tomadas**. Si no se
> resuelven, las tomará el código por omisión. Las decisiones 1, 3 y 5
> condicionan el esquema de base de datos y deben cerrarse **antes** del ETL.

Ordenadas por impacto.

## 1. Detenidos no son incidentes de inseguridad

**Error de categoría.**

| Dataset | Naturaleza del hecho |
|---|---|
| Homicidios | Víctima |
| Desaparecidas | Víctima |
| Detenidos y aprehendidos | **Acción policial** |

No son la misma clase de suceso. Un sector con muchas detenciones puede indicar
más delito, o más presencia policial, que es lo contrario. Con el mismo
lenguaje visual, el usuario lee «peligroso» donde el dato dice «vigilado».

Agravante cuantitativo: **50.553 detenidos frente a 5.676 homicidios** en
enero–agosto 2026, proporción de 9 a 1. La capa más ruidosa sepultaría
visualmente a la más significativa.

**Decisión:** capas separadas con activación explícita del usuario, o excluir
el dataset del mapa y reservarlo para estadística.

## 2. El compromiso entre confianza y frescura está invertido

| Capa | Confianza máxima alcanzable | Rezago |
|---|---|---|
| Datos oficiales | 🟢 Oficial | ~1 mes |
| Scraper de noticias policiales | 🟡 Reportado | minutos |

La vista que el usuario realmente va a consultar — «qué está pasando ahora» —
es estructuralmente **la menos fiable del sistema**. Y la más fiable llega con
un mes de retraso, inútil para decidir si salir esta noche.

El propio ejemplo de la nota original lo evidencia:
`🟡 Accidente · Portoviejo · Hace 25 min`. Ese amarillo es el **techo
matemático** de la capa en tiempo real; nunca podrá mostrarse un 🟢 ahí.

**Decisión:** asumir y comunicar con honestidad que «Actualidad» es información
sin confirmar, o retirar la promesa de tiempo real del producto.

## 3. La escala de confianza mezcla dos ejes distintos

🟢 🔵 🟡 🟠 miden **verificación**. ⚪ Histórico mide **tiempo**. Son
dimensiones independientes.

La nota original lo expone sin querer: *«⚪ Histórico es para cuando el usuario
ponga un año anterior al actual»*. Es decir, un homicidio de 2015 del
Ministerio del Interior **cambiaría de etiqueta según el filtro que aplique el
usuario**. Mismo dato, misma fuente, distinto nivel de confianza.

La fiabilidad de un dato no puede depender de lo que el usuario esté mirando.

**Decisión:** separar en dos atributos independientes.

```
nivel_confianza  → oficial | verificado | reportado | en_revision
vigencia         → historico | reciente
```

Un registro puede ser 🟢 Oficial **e** histórico simultáneamente.

### Sub-decisión: el orden de la escala

🔵 Verificado figura por debajo de 🟢 Oficial. Pero «confirmado por múltiples
fuentes independientes» es epistemológicamente más sólido que una única fuente
institucional, especialmente en cifras de seguridad donde el subregistro
oficial está documentado. La jerarquía actual codifica una postura; que sea
deliberada. Ver [[Niveles de Confianza]].

## 4. «Anónimo» y «GPS preciso» se contradicen

Un reporte con coordenadas exactas, con hora, emitido desde el lugar del hecho
**no es anónimo**: es la ubicación del informante en ese instante.

- Quien reporta un robo desde su casa, publica su casa.
- Quien presencia un ajuste de cuentas y lo reporta en el sitio queda expuesto
  ante quien lo cometió.

Además el anonimato rompe el sistema de confianza por dos vías:

- **Imposibilita verificar.** Sin canal para repreguntar, ningún reporte
  asciende de 🟠 a 🔵 jamás.
- **Imposibilita detectar abuso.** Sin identidad persistente no hay reputación,
  y sin reputación no hay defensa frente a envenenamiento coordinado.

**Decisión propuesta:** seudónimo persistente por dispositivo — anónimo de cara
al público, trazable para moderación — y difuminado de la ubicación a nivel de
manzana en lugar de punto exacto. Relacionado con [[Riesgos Abiertos]].

## 5. Sin normalizar por población, la estadística miente

Un mapa de puntos crudos concluye siempre lo mismo: «Guayaquil y Quito son lo
peor». Evidente, porque ahí vive la gente.

Sin **tasa por 100.000 habitantes**, la sección de estadísticas produce
conclusiones falsas con apariencia de rigor. Es el error clásico de los mapas
de criminalidad y el argumento más habitual para desacreditarlos.

**Decisión:** incorporar población por cantón (INEC) como dataset adicional
desde el inicio. Afecta al esquema.

## 6. El mapa mide propensión a denunciar, no criminalidad

Sesgo de denuncia. Con reportes ciudadanos se amplifica: las zonas con usuarios
activos y conectados aparecen peores que aquellas donde nadie reporta, lo que
puede invertir por completo la lectura respecto a la realidad.

No se elimina; **se declara**. Una nota metodológica visible forma parte del
producto, no de la letra pequeña.

## 7. Se desaprovechan ocho años de datos disponibles

La nota propone «últimos 4 años» y filtros de «2025 2026». Dos incoherencias:

- Cuatro años serían 2023–2026, no dos años de filtros
- Las fuentes cubren desde **2014** (homicidios), **2017** (desaparecidas) y
  **2019** (detenidos)

Además, cada dataset arranca en un año distinto: el filtro temporal debe
conocer esa asimetría o mostrará caídas falsas donde solo hay ausencia de
fuente. Ver [[Fuentes]].

## 8. No existe la taxonomía común que exige el filtro «por tipo»

| Dataset | Campo de tipificación |
|---|---|
| Homicidios | `tipo_muerte` |
| Detenidos | `codigo_iccs` |
| Desaparecidas | — (ninguno) |

El filtro por categoría no tiene sobre qué operar.

**Decisión propuesta:** adoptar **ICCS** (Clasificación Internacional del
Delito con fines estadísticos, de Naciones Unidas) como columna vertebral. Es
un estándar real y ya viene incluido en uno de los datasets. Mapear el resto
contra ella. Ver [[Esquema de Campos]].

## 9. Datos sensibles geolocalizados

El dataset de detenidos incluye `autoidentificacion_etnica`, `nacionalidad` y
`estatus_migratorio`. Representar esos campos sobre un mapa equivale,
funcionalmente, a cartografía étnica.

Ecuador cuenta además con Ley Orgánica de Protección de Datos Personales desde
2021, y estas son categorías especialmente protegidas.

**Decisión:** no exponer estos campos a nivel de punto. Servirlos agregados o
no servirlos.

## 10. Dos huecos sin regla definida

**Duplicados entre fuentes.** Un homicidio figurará en el dataset oficial y,
potencialmente, en un reporte ciudadano. ¿Se fusionan? ¿Conviven? ¿Cuál
prevalece? Sin regla.

**Retirada de registros.** Una persona desaparecida que es localizada — ¿se
retira el marcador? ¿cuándo? El dataset aporta la fecha y el lugar de
localización, de modo que la información para decidirlo existe.

---
tags: [version, v4, telegram, ia, automatizacion, fuentes-colaboradoras]
actualizado: 2026-09-24
estado: pendiente de la V3
---

# V4 — Red Colaborativa e IA

> [!abstract] Objetivo de la versión
> Incorporar **canales y grupos de Telegram colaboradores** mediante acuerdos formales, y transformar sus publicaciones de texto libre en incidentes georreferenciados mediante modelos de lenguaje (IA) y geocodificación automática.
> Empieza cuando la [[V3 - Tiempo Real y Comunidad]] está plenamente operativa.

Solo Telegram. WhatsApp queda descartado (ver [[Telegram - Fuentes Colaboradoras]]).

---

## 1. Qué trae la V4

### Fuentes colaboradoras con consentimiento
- **Acuerdos formales:** No es scraping intrusivo; son fuentes que aceptan colaborar y aportar al observatorio.
- Registro en la tabla `sources` (nombre, identificador de canal, estado de autorización y fecha de alta).
- **Atribución visible:** Cada incidente muestra de qué canal o medio aliado provino.

### Ingesta desde Telegram
- **Bot de ReporteEC (Bot API):** Agregado como administrador o con modo privacidad desactivado por el canal.
- **Worker Telethon:** Para lectura de canales públicos aliados mediante cuenta de servicio dedicada.
- **Inmutabilidad:** Se almacena el mensaje de texto crudo original en la base de datos para responder siempre a la trazabilidad y auditoría pública.

### Procesamiento de Texto Libre con IA
Un worker especializado (`processing_worker`) realiza el pipeline:
1. **Filtro de pertinencia:** Descarta anuncios comerciales, cadenas, opiniones y mensajes que no describen hechos delictivos.
2. **Clasificación del delito:** Asigna la tipología según [[Tipos de Incidente]].
3. **Extracción del lugar:** Extrae textualmente las referencias espaciales (*«Avenida Quito y Chorrera, cantón Babahoyo»*).
4. **Geocodificación:** Convierte el texto en punto geográfico y asigna el nivel de precisión (`location_precision`: calle, barrio o cantón).
5. **Detección de duplicados:** Agrupa múltiples reportes de diferentes canales sobre un mismo hecho.
6. **Métrica `extraction_confidence`:** Registra qué tan seguro está el modelo de la extracción. Todo registro entra a moderación en 🟠 **En revisión**.

> [!warning] La IA no inventa coordenadas
> La IA únicamente extrae el texto del lugar. Las coordenadas son generadas por el motor de geocodificación. Si el texto no menciona dónde ocurrió el hecho, no se le asigna punto en el mapa.

### Panel de Monitoreo
- Monitor de salud de fuentes: 🟢 Activa, 🟡 Inactiva temporalmente, 🔴 Desconectada.
- Registro de volumen de mensajes procesados, fallos de geocodificación y cola de revisión.

---

## 2. Orden de Desarrollo

| # | Tarea | Justificación técnica |
|---|---|---|
| 1 | Pruebas de IA con dataset de mensajes reales | Validar que el prompt clasifique y extraiga lugares de jerga ecuatoriana |
| 2 | Acuerdos formales con las primeras fuentes | Ninguna fuente entra sin autorización |
| 3 | Telegram Worker | Conexión con Telegram Bot API y persistencia de mensajes crudos |
| 4 | Processing Worker (IA + Geocodificación) | Pipeline de procesamiento y desduplicación |
| 5 | Cola de moderación integrada | Reutiliza y amplía el panel de la V3 |
| 6 | Métricas y tablero de salud de fuentes | Monitoreo de latencia y estado |

---

## 3. Qué Evitar en la V4

- **No publicar señalamientos a personas concretas o linchamientos digitales.** Todo mensaje que mencione sospechosos por nombre, rostro o placa es filtrado para proteger la legalidad del proyecto.
- **No confiar ciegamente en la IA.** Ningún reporte de Telegram sube a verificado sin corroboración o intervención humana.
- **Cuidar los costes de tokens de la API de IA.** Aplicar heurísticas de regex locales para descartar mensajes no pertinentes antes de enviarlos al modelo de lenguaje.

---

## 4. Cómo Probarla Tú Mismo

- [ ] Un lote de prueba de 50 mensajes de Telegram ecuatorianos es clasificado con precisión superior al 85%.
- [ ] Ningún incidente extraído tiene coordenadas inventadas que no consten en el texto.
- [ ] Mensajes idénticos de dos canales distintos sobre el mismo hecho se fusionan en un único incidente.
- [ ] El incidente generado muestra la procedencia del canal y enlace al mensaje original.
- [ ] Si un canal pierde conexión, el panel de monitoreo notifica el estado de alerta.

## Terminada cuando
Todas las casillas están verificadas y al menos dos fuentes colaboradoras operan de forma automatizada y estable.

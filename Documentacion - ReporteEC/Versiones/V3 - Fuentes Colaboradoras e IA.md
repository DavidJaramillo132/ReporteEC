---
tags: [version, v3, telegram, ia]
actualizado: 2026-09-23
estado: pendiente de la V2
---

# V3 — Fuentes Colaboradoras e IA

> [!abstract] Objetivo
> Incorporar **canales y grupos de Telegram** que colaboren voluntariamente
> con el proyecto, y convertir sus mensajes de texto libre en incidentes
> ubicados en el mapa con ayuda de IA. Empieza cuando la
> [[V2 - Tiempo Real]] funciona.

**Solo Telegram.** WhatsApp queda descartado (ver
[[Telegram - Fuentes Colaboradoras]]).

---

## Qué trae la V3

### Fuentes colaboradoras

No es scraping: son **fuentes que aceptan colaborar**.

- **Acuerdo escrito** con el administrador de cada canal o grupo: qué se toma,
  cómo se usa y cómo se atribuye
- Registro de cada fuente en la tabla `sources`: nombre, canal, estado
  («colaborador autorizado») y fecha de integración
- **Atribución visible** en cada incidente: de qué canal salió

### Conexión con Telegram

| Camino | Cuándo |
|---|---|
| **Bot de ReporteEC** agregado por el administrador | Preferido. Con el modo privacidad desactivado o como administrador |
| **Cuenta dedicada con Telethon** | Cuando no se pueda agregar el bot |

Un **Telegram Worker** recibe los mensajes y **guarda el original** antes de
procesarlo, para poder responder siempre «¿de dónde salió este incidente?».

### Procesamiento con IA

Los mensajes son texto libre («se reporta accidente en la vía
Manta-Portoviejo»). Un **Processing Worker**:

1. **Descarta** lo que no es un incidente (cadenas, avisos, conversación)
2. **Clasifica el tipo** según [[Tipos de Incidente]]
3. **Extrae el lugar** tal como aparece en el texto
4. **Geocodifica** ese lugar a coordenadas
5. **Detecta duplicados**: varios mensajes o fuentes sobre el mismo hecho
6. Crea el incidente como 🟠 **En revisión**, que pasa por moderación

Guarda `extraction_confidence`: qué tan segura está la IA de lo que extrajo.
No es el nivel de confianza del incidente.

> [!warning] La IA nunca inventa ubicaciones
> La IA solo **extrae** el lugar que dice el texto. Las coordenadas salen de
> la **geocodificación**, y se guarda su precisión (`location_precision`:
> calle, barrio, cantón). Si el texto no dice dónde, el incidente no tiene
> ubicación.

### Estados de procesamiento

Cada mensaje pasa por: recibido → procesando → extraído → geocodificado →
validado → almacenado, o fallido. Los fallidos quedan visibles en el panel
para revisarlos.

### Panel de monitoreo

Tarjeta por fuente: estado (🟢 activa, 🟡 sin mensajes recientes,
🔴 desconectada), mensajes recibidos, incidentes generados, pendientes de
revisión y errores.

### Redis

Como cola entre el Telegram Worker y el Processing Worker, **solo si el
volumen lo pide**. PostgreSQL puede hacer de cola mientras tanto.

---

## Orden de desarrollo

| # | Tarea | Por qué en este orden |
|---|---|---|
| 1 | **Probar la IA con mensajes reales** de los grupos | Si no clasifica y ubica bien, no vale la pena construir el resto |
| 2 | Acuerdos con las primeras fuentes | Sin permiso no hay fuente |
| 3 | Telegram Worker y guardado del mensaje original | |
| 4 | Processing Worker: IA, geocodificación, duplicados | |
| 5 | Moderación de lo que llega de Telegram | Reutiliza el panel de la V2 |
| 6 | Tarjetas de monitoreo por fuente | |

## Qué evitar

- **Confiar en la IA sin revisión humana.** Todo entra como 🟠 y pasa por
  moderación.
- **Publicar datos personales o acusaciones.** Los mensajes traen nombres,
  teléfonos, fotos de personas y señalamientos («el de la moto roja es el
  ladrón»). Nada de eso se publica.
- **Sumar fuentes sin acuerdo.** Cada canal necesita su autorización
  documentada.
- **Subestimar el costo de la IA.** Medir cuánto cuesta procesar un mensaje
  antes de conectar canales grandes.

---

## Cómo probarla tú mismo

### Prueba previa de la IA

- [ ] Con 50 mensajes reales, la IA descarta correctamente los que no son
      incidentes
- [ ] Clasifica bien el tipo en la mayoría de los casos
- [ ] Nunca devuelve una ubicación que no aparezca en el texto

### Integración

- [ ] Un mensaje nuevo en un canal colaborador aparece en el sistema en pocos
      segundos
- [ ] El incidente muestra de qué canal salió y enlaza al mensaje original
- [ ] Un mensaje sin lugar no aparece como punto en el mapa
- [ ] Tres mensajes sobre el mismo hecho generan un solo incidente
- [ ] Todo lo que llega de Telegram entra como 🟠 y pasa por moderación

### Monitoreo

- [ ] Si una fuente deja de enviar mensajes, su tarjeta pasa a 🟡 y luego a 🔴
- [ ] Los mensajes fallidos aparecen en el panel con su error

## Terminada cuando

Todas las casillas están marcadas y al menos una fuente colaboradora está
conectada con acuerdo firmado.

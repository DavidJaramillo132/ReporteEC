---
tags: [version, v3, tiempo-real, comunidad, reportes]
actualizado: 2026-09-24
estado: pendiente de la V2
---

# V3 — Tiempo Real y Comunidad

> [!abstract] Objetivo de la versión
> Sumar al mapa la voz ciudadana y las alertas comunitarias inmediatas: reportes de los ciudadanos y noticias de la Policía, cada uno con su nivel de confianza, y avisar a quienes se suscriban a una zona.
> Empieza cuando la [[V1 - Mapa Histórico]] y la [[V2 - Rutas e Inteligencia Horaria]] están en producción.

Reglas detalladas en [[Decisiones de Negocio Pendientes]] y [[Niveles de Confianza]].

---

## Qué trae la V3

### Documentos legales
Van **antes** de abrir las cuentas, porque la V3 empieza a guardar datos personales (correo, ubicación de los reportes, fotos):

- **Términos de uso:** qué se puede reportar, qué está prohibido y qué pasa con los reportes falsos.
- **Política de privacidad** conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP): qué datos se guardan, para qué, cuánto tiempo y cómo pedir que se borren.

### Cuentas de usuario
- **Ver el mapa y consultar rutas no requiere cuenta.**
- **Para reportar o suscribirse a notificaciones hace falta una cuenta verificada.**
- **Verificación por correo:** al registrarse, el usuario recibe un correo con un enlace; hasta que lo abre, la cuenta no puede reportar ni suscribirse.

### Reportes falsos: dos faltas
La regla es estricta para evitar difamaciones y envenenamiento:

| Falta | Consecuencia |
|---|---|
| **1.ª** reporte declarado falso | **Aviso** al usuario |
| **2.ª** reporte declarado falso | **Suspensión mínima de 30 días**, con aviso al usuario |

Un reporte solo cuenta como falta cuando **un moderador** lo declara falso tras alerta comunitaria.

### Reportes ciudadanos
- Solo desde **móvil**; en PC la plataforma es de consulta.
- El usuario elige el **tipo** de una lista ([[Tipos de Incidente]]), la ubicación, una descripción breve y, si quiere, una foto.
- Entran obligatoriamente como 🟠 **En revisión**.
- **Límite de reportes por cuenta y por hora** (valor configurable).
- El público **nunca ve quién reportó**.

### Fotografías de incidentes
- Se guardan en **Azure Blob Storage** (o S3), detrás de la interfaz de almacenamiento.
- **Se borran los metadatos EXIF al subirlas:** las fotos de celular guardan la ubicación GPS exacta de quien las tomó, y publicarlas tal cual expondría al informante.
- Se comprimen y redimensionan para optimizar la transferencia de datos.

### Moderación
1. Los usuarios verificados votan un reporte como falso o sospechoso.
2. Al llegar a un umbral de votos, pasa a la cola de revisión.
3. **Solo un moderador** lo declara falso: se retira del mapa, de «Actualidad» y del historial de notificaciones, y cuenta como falta para su autor.
Los votos solos no retiran ni suspenden, para evitar que grupos organizados tumben reportes verdaderos.

### Vista «Actualidad»
- Incidentes de la última **1 h 30 min** (configurable).
- Pasado ese tiempo salen de esta vista pero **siguen en el mapa** con su color de confianza.
- **Aviso lateral** en la esquina inferior derecha cuando entra un incidente: `🟡 Accidente · Portoviejo · Hace 25 min · Fuente: …`.
- Las actualizaciones llegan al navegador en tiempo real mediante **Server-Sent Events (SSE)**.

### Notificaciones zonales
- Solo en **móvil**, por **suscripción de zona**: el usuario elige barrios, cantones o trayectos de interés.
- Solo se notifican los **reportes ciudadanos**, no las noticias.
- Se envían con la etiqueta visible **🟠 Sin verificar**.
- Filtro por tipo y gravedad para no saturar al usuario.
- En iOS: requiere versión 16.4+ y la PWA instalada en la pantalla de inicio.

### Noticias de la Policía
- Worker que consulta la API de WordPress de `noticias.policia.gob.ec` ([[Scraper Noticias Policía]]).
- Entran como 🟡 **Reportado**, ubicadas a nivel de cantón o provincia.
- Reflejan resultados y operativos policiales, complementando la información comunitaria.

### Fusión con datos oficiales
Cuando el dato oficial del Ministerio del Interior llega (~1 mes después), se fusiona con el reporte previo. El registro fusionado pasa a 🟢 **Oficial** y conserva el historial de todas sus fuentes.

---

## Orden de desarrollo

| # | Tarea | Por qué en este orden |
|---|---|---|
| 1 | Términos de uso y política de privacidad | Van antes de almacenar datos personales |
| 2 | Cuentas y verificación por correo | Todo lo comunitario depende de la identidad |
| 3 | Reportes ciudadanos con fotos | Fuente principal del tiempo real |
| 4 | Moderación, votos y faltas | No se abren reportes sin panel para retirarlos |
| 5 | «Actualidad», aviso lateral y Server-Sent Events | Mostrar lo nuevo en vivo |
| 6 | Suscripciones y notificaciones Web Push | Requiere reportes y moderación funcionando |
| 7 | Worker de noticias de la Policía | Complemento informativo |
| 8 | Fusión con datos oficiales | Requiere acumulación de reportes para probarse |

## Qué evitar
- **Lanzar en todo el país a la vez.** Empezar en una sola **ciudad piloto** (ej. Machala o Portoviejo) para concentrar comunidad y moderación antes de escalar.
- **Publicar fotos sin despojar metadatos EXIF.**
- **Abrir reportes sin moderadores activos.**

---

## Cómo probarla tú mismo
- [ ] Sin cuenta se puede ver el mapa y consultar rutas, pero no reportar ni suscribirse.
- [ ] Al registrarse llega el correo de verificación.
- [ ] Un reporte desde móvil aparece en el mapa como 🟠 y en «Actualidad».
- [ ] La foto subida no conserva metadatos GPS originales.
- [ ] El público no puede ver la identidad del informante.
- [ ] Al ser declarado falso por un moderador, desaparece del mapa y cuenta como falta.
- [ ] Las actualizaciones llegan a clientes conectados vía SSE sin recargar.

## Terminada cuando
Todas las casillas están marcadas y la V3 opera de forma estable en la ciudad piloto.

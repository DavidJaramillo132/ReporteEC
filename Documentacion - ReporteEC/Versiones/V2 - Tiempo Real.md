---
tags: [version, v2, tiempo-real]
actualizado: 2026-09-23
estado: pendiente de la V1
---

# V2 — Tiempo Real

> [!abstract] Objetivo
> Sumar al mapa lo que está pasando ahora: reportes de los ciudadanos y
> noticias de la Policía, cada uno con su nivel de confianza, y avisar a
> quienes se suscriban a una zona. Empieza cuando la [[V1 - Mapa Histórico]]
> está publicada.

Reglas detalladas en [[Decisiones de Negocio Pendientes]] (punto 12 y
«Decisiones tomadas»).

---

## Qué trae la V2

### Documentos legales

Van **antes** de abrir las cuentas, porque la V2 empieza a guardar datos
personales (correo, ubicación de los reportes, fotos):

- **Términos de uso:** qué se puede reportar, qué está prohibido y qué pasa
  con los reportes falsos
- **Política de privacidad** conforme a la Ley Orgánica de Protección de Datos
  Personales (LOPDP): qué datos se guardan, para qué, cuánto tiempo y cómo
  pedir que se borren

### Cuentas de usuario

- **Ver el mapa no requiere cuenta.**
- **Para reportar o suscribirse a notificaciones hace falta una cuenta
  verificada.**
- **Verificación por correo:** al registrarse, el usuario recibe un correo con
  un enlace; hasta que lo abre, la cuenta no puede reportar ni suscribirse.

### Reportes falsos: dos faltas

La regla es estricta a propósito:

| Falta | Consecuencia |
|---|---|
| **1.ª** reporte declarado falso | **Aviso** al usuario |
| **2.ª** reporte declarado falso | **Suspensión mínima de 30 días**, con aviso al usuario |

Un reporte solo cuenta como falta cuando **un moderador** lo declara falso
(ver «Moderación»).

### Reportes ciudadanos

- Solo desde **móvil**; en PC la plataforma es de consulta
- El usuario elige el **tipo** de una lista ([[Tipos de Incidente]]), la
  ubicación, una descripción breve y, si quiere, una foto
- Entran como 🟠 **En revisión**
- **Límite de reportes por cuenta y por hora** (valor por definir)
- El público **nunca ve quién reportó**

### Fotos

- Se guardan en **Azure Blob Storage**, detrás de la interfaz de
  almacenamiento que permite pasar a S3 más adelante
- **Se borran los metadatos al subirlas:** las fotos de celular guardan la
  ubicación GPS exacta de quien las tomó, y publicarlas tal cual expondría al
  informante
- Se comprimen y redimensionan para que carguen rápido

### Moderación

1. Los usuarios verificados votan un reporte como falso
2. Al llegar a un número de votos (configurable), pasa a revisión
3. **Solo un moderador** lo declara falso: se retira del mapa, de
   «Actualidad» y del historial de notificaciones, y cuenta como falta para
   su autor

Los votos solos no retiran ni suspenden, para que un grupo no pueda tumbar un
reporte verdadero. Incluye un **panel de moderación**.

### Vista «Actualidad»

- Incidentes de la última **1 h 30** (valor configurable)
- Después salen de esta vista pero **siguen en el mapa** con su color
- **Aviso lateral** en la esquina inferior derecha cuando entra un incidente:
  `🟡 Accidente · Portoviejo · Hace 25 min · Fuente: …`
- Las actualizaciones llegan al navegador en tiempo real con
  **Server-Sent Events**

### Notificaciones

- Solo en **móvil**, por **suscripción de zona**: el usuario elige barrios,
  cantones o trayectos
- Solo se notifican los **reportes ciudadanos**, no las noticias
- Se envían **al instante**, siempre con la etiqueta **🟠 Sin verificar**
- Filtro por tipo y gravedad para no saturar
- Si un reporte se retira, desaparece de la app; si el usuario toca la
  notificación vieja, ve que fue retirado
- iPhone: requiere iOS 16.4 o superior y la PWA instalada en la pantalla de
  inicio

### Noticias de la Policía

- Worker que consulta la API de WordPress de `noticias.policia.gob.ec`
- Entran como 🟡 **Reportado**, ubicadas a nivel de cantón o provincia
- Son resultados policiales, no incidentes en vivo; complementan a los
  reportes ciudadanos ([[Scraper Noticias Policía]])

### Fusión con datos oficiales

Cuando el dato oficial llega (~1 mes después), se junta con el reporte o la
noticia previa. El registro fusionado pasa a 🟢 **Oficial** y conserva el
rastro de todas sus fuentes. La regla exacta para decidir que dos registros
son el mismo incidente (tipo, distancia, ventana de tiempo) queda por definir.

---

## Orden de desarrollo

| # | Tarea | Por qué en este orden |
|---|---|---|
| 1 | Términos de uso y política de privacidad | Van antes de guardar datos personales |
| 2 | Cuentas y verificación por correo | Todo lo demás depende de la identidad |
| 3 | Reportes ciudadanos con fotos | La fuente principal del tiempo real |
| 4 | Moderación, votos y faltas | No se abren reportes sin poder retirarlos |
| 5 | «Actualidad», aviso lateral y Server-Sent Events | Mostrar lo nuevo |
| 6 | Suscripciones y notificaciones | Requiere reportes y moderación funcionando |
| 7 | Worker de noticias de la Policía | Complemento |
| 8 | Fusión con datos oficiales | Necesita un mes de reportes acumulados para probarse |

## Qué evitar

- **Lanzar en todo el país a la vez.** Con pocos usuarios repartidos, el mapa
  en vivo se ve vacío y nadie vuelve. **Empezar en una sola ciudad** y crecer
  desde ahí.
- **Publicar fotos sin limpiar sus metadatos.**
- **Abrir los reportes sin moderadores definidos.** Hay que saber quién
  modera y en qué horario antes del lanzamiento.
- **Notificar sin límites.** Sin filtro por tipo y gravedad, en una ciudad
  grande serían decenas de avisos al día.

---

## Cómo probarla tú mismo

### Cuentas

- [ ] Sin cuenta se puede ver el mapa, pero no reportar ni suscribirse
- [ ] Al registrarse llega el correo de verificación
- [ ] Sin abrir el enlace, la cuenta no puede reportar ni suscribirse

### Reportes

- [ ] Un reporte desde el móvil aparece en el mapa como 🟠 y en «Actualidad»
- [ ] Desde PC no se ofrece la opción de reportar
- [ ] Al superar el límite por hora, el sistema rechaza el reporte
- [ ] La foto publicada no conserva la ubicación GPS original
- [ ] El público no ve quién reportó

### Moderación y faltas

- [ ] Al llegar al número de votos, el reporte pasa al panel de moderación
- [ ] Declarado falso, desaparece del mapa y de «Actualidad»
- [ ] Primera falta: el usuario recibe un aviso
- [ ] Segunda falta: la cuenta queda suspendida 30 días y recibe un aviso

### Tiempo real y notificaciones

- [ ] Un reporte nuevo aparece en otro navegador abierto sin recargar
- [ ] Pasada 1 h 30, sale de «Actualidad» pero sigue en el mapa
- [ ] Suscrito a una zona, llega la notificación con «🟠 Sin verificar»
- [ ] Una noticia de la Policía no genera notificación
- [ ] Tocar la notificación de un reporte retirado muestra que fue retirado

### Noticias

- [ ] Las noticias nuevas de la Policía aparecen como 🟡 ubicadas en su cantón

## Terminada cuando

Todas las casillas están marcadas y la V2 funciona en la ciudad piloto.

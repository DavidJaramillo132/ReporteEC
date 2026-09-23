---
tags: [datos, telegram, fuentes-colaboradoras, v3]
actualizado: 2026-09-23
---

# Telegram — Fuentes Colaboradoras

Fuente de la [[V3 - Fuentes Colaboradoras e IA]]: canales y grupos de Telegram
donde los ciudadanos comparten robos, peleas y otros incidentes, y que
**aceptan colaborar** con el proyecto.

> [!info] Solo Telegram
> Decidido el 2026-09-23: **se usa únicamente Telegram.** WhatsApp queda
> descartado. No tiene API oficial para leer grupos, y las librerías no
> oficiales (whatsapp-web.js, Baileys) violan sus términos y exponen la cuenta
> a bloqueos. Tampoco se usará WhatsApp Business.

## Fuente colaboradora, no scraping

El enfoque no es «extraer mensajes de canales», sino **integrar fuentes que
voluntariamente comparten sus publicaciones**. Ventajas:

- La procedencia de cada dato queda clara
- Se mantiene la atribución de la fuente
- El administrador sabe cómo se usa su información
- La metodología queda documentada, algo clave si es un proyecto académico

Cada fuente se registra con nombre, canal, estado («colaborador autorizado») y
fecha de integración.

## Cómo conectarse

| Camino | Cómo funciona | Requisito |
|---|---|---|
| **Bot** (Bot API) — preferido | Un bot de ReporteEC se agrega al grupo y recibe los mensajes | Que un administrador lo agregue. Hay que desactivar el *modo privacidad* del bot en BotFather, o hacerlo administrador; si no, solo recibe comandos |
| **Cuenta de usuario** (API MTProto con Telethon) | Una cuenta que ya es miembro lee los mensajes igual que la app | `api_id` y `api_hash` de my.telegram.org. Usar una **cuenta dedicada**, no la personal |

## Reglas

- **Consentimiento:** un grupo privado no es un medio público. Acuerdo con el
  administrador y aviso en el grupo.
- **Datos personales:** los mensajes traen nombres, teléfonos y fotos. Nunca
  se publica quién envió el mensaje, y las fotos se revisan antes de
  mostrarse (LOPDP).
- **Difamación:** los señalamientos a personas concretas no se publican.
- **Confianza:** todo entra como 🟠 En revisión y pasa por moderación.

## El reto técnico: texto libre

Los mensajes no tienen formato: texto suelto, notas de voz, fotos y lugares
dichos de memoria («en la 9 de Octubre y Boyacá»). La IA clasifica, descarta
lo que no es incidente, extrae el lugar y agrupa mensajes sobre el mismo
hecho; la geocodificación convierte el lugar en coordenadas. Detalle en
[[V3 - Fuentes Colaboradoras e IA]].

## Encaje en el sistema

Un adaptador `telegram` en `codigo/backend/app/modules/` y un Telegram Worker
([[Módulos del Sistema]]). Sus resultados entran a la **cola de moderación**,
no directo al mapa.

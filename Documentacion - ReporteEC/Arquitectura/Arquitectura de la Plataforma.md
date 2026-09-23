---
tags: [arquitectura, propuesta, en-revision]
actualizado: 2026-09-23
origen: propuesta elaborada con ChatGPT
---

> [!warning] Documento de referencia
> Propuesta de arquitectura elaborada con ChatGPT el 2026-09-23. Las
> diferencias con lo ya decidido se resolvieron el mismo día (tabla de abajo).
> **Donde el texto original contradiga la tabla, prevalecen [[Hoja de Ruta]], [[Stack e Infraestructura]],
> [[Módulos del Sistema]], [[Niveles de Confianza]] y
> [[Decisiones de Negocio Pendientes]].**

## Diferencias con decisiones anteriores

| # | Esta propuesta | Decidido antes | Estado |
|---|---|---|---|
| 1 | La primera versión incluye Telegram, IA, geocodificación, Redis, Redshift, workers y panel de monitoreo | **v1 = mapa histórico**; tiempo real en v2; Telegram a futuro | ✅ Se mantiene lo decidido |
| 2 | **Redshift** para análisis e infraestructura en **AWS** | VPS en **Azure**, AWS a futuro | ✅ No se usa para guardar los datos; se agrega como **experimento analítico** en Azure y AWS. Ver [[Almacén Analítico]] |
| 3 | Ingesta y workers **dentro de `backend/`** | Carpeta `ingesta/` separada | ✅ **Se adopta esta propuesta.** Ver [[Módulos del Sistema]] |
| 4 | Cinco estados: Reportado, No verificado, En revisión, Verificado, Confirmado por fuente oficial | Cuatro niveles: oficial, verificado, reportado, en revisión | ✅ Se mantienen los cuatro niveles |
| 5 | **Colores por tipo** de incidente (🟥🟧🟦🟨) | **Colores por nivel de confianza** (🟢🔵🟡🟠) | ✅ Se mantiene el color por confianza; el tipo se muestra con **ícono** |
| 6 | Datos históricos 2024–2026 | Desde 2014 | ✅ **Desde 2019**, primer año en que todos los datasets tienen datos |
| 7 | Reportes ciudadanos «eventualmente»; no menciona las noticias de la Policía | Reportes ciudadanos, notificaciones y noticias de la Policía en **v2** | ✅ Se mantiene lo decidido |
| 8 | Campo `confidence: 0.89` junto a `verification_status` | — | ✅ Se llama **`extraction_confidence`**: mide qué tan segura está la IA de lo que extrajo, no el nivel de confianza del incidente |
| 9 | WebSocket; Redis como cola | Server-Sent Events; sin cola en v1 | Menor, se decide en v2 |

## Aportes que encajan y se incorporan

- **Monolito modular**, sin microservicios: coincide con lo decidido.
- **Fuentes colaboradoras autorizadas** en lugar de scraping de canales:
  mejora lo propuesto en [[Telegram - Fuentes Colaboradoras]].
- **Trazabilidad completa** de cada incidente y conservación del mensaje
  original.
- Tablas **`sources`** y **`pipeline_runs`**, y campo
  **`location_precision`**.
- **La IA no inventa coordenadas**: extrae el lugar del texto y la
  geocodificación lo convierte en punto.
- **Estados de procesamiento** (recibido, procesando, extraído, geocodificado,
  validado, almacenado, fallido).
- **Panel de monitoreo**: estado de fuentes, ejecuciones, errores y logs.
- **Tailwind CSS** en el frontend.

---

# Propuesta original

# Arquitectura de la Plataforma de Monitoreo de Incidentes en Ecuador

## 1. Descripción general

La plataforma tiene como objetivo recopilar, procesar, almacenar y visualizar información sobre incidentes reportados en Ecuador, como robos, siniestros, muertes y otros acontecimientos relevantes.

La plataforma combinará diferentes fuentes de información:

* Datos históricos.
* Fuentes oficiales y datasets públicos.
* Fuentes de noticias.
* Canales de Telegram que colaboren voluntariamente con el proyecto.
* Otras fuentes que puedan incorporarse posteriormente.
* Eventualmente, reportes ciudadanos.

El sistema no debe considerar automáticamente toda la información como un hecho confirmado. Cada incidente debe conservar información sobre su **fuente, procedencia, estado de verificación y nivel de confianza**.

Por esta razón, la arquitectura debe estar preparada para diferenciar entre:

```text
Reportado
No verificado
En revisión
Verificado
Confirmado por fuente oficial
```

---

# 2. Arquitectura general

Para la primera versión no se utilizará una arquitectura de microservicios.

La plataforma tendrá un **backend monolítico modular**, donde todos los componentes principales estarán dentro del mismo proyecto, pero estarán separados internamente por módulos y workers.

La arquitectura general será:

```text
                         ┌──────────────────────┐
                         │       FRONTEND       │
                         │                      │
                         │ 🗺️ Mapa público       │
                         │ 📊 Estadísticas       │
                         │ 🔎 Búsqueda           │
                         │ 📰 Feed de incidentes │
                         │                      │
                         │ 🔐 Panel Admin        │
                         └──────────┬───────────┘
                                    │
                              REST / WebSocket
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │        FASTAPI            │
                    │      MONOLITO MODULAR     │
                    │                           │
                    │ API                       │
                    │ Auth                      │
                    │ Incidents                 │
                    │ Sources                   │
                    │ Telegram                  │
                    │ Ingestion                 │
                    │ AI                        │
                    │ Geocoding                 │
                    │ Monitoring                │
                    │ Admin                     │
                    └─────────────┬─────────────┘
                                  │
                  ┌───────────────┼───────────────┐
                  │               │               │
                  ▼               ▼               ▼
             PostgreSQL        Redis          Workers
              + PostGIS                         │
                                      ┌──────────┼──────────┐
                                      ▼          ▼          ▼
                                  Telegram     ETL       AI/NLP
                                  Worker     histórico   Processing
                                      │          │          │
                                      └──────────┴──────────┘
                                                 │
                                                 ▼
                                           PostgreSQL
                                                 │
                                                 ▼
                                            Redshift
                                                 │
                                                 ▼
                                             Analytics
```

---

# 3. Monolito modular

El backend será una sola aplicación, pero internamente estará dividido en módulos.

No se comenzará creando:

```text
Microservicio API
Microservicio Telegram
Microservicio Ingesta
Microservicio IA
Microservicio Geocoding
Microservicio Monitoring
```

En su lugar:

```text
                    BACKEND
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
       API           Workers         Modules
```

Esto permite desarrollar y desplegar el proyecto de una manera más sencilla.

---

# 4. Estructura del backend

Una estructura inicial podría ser:

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   ├── incidents.py
│   │   ├── statistics.py
│   │   ├── sources.py
│   │   ├── ingestion.py
│   │   ├── telegram.py
│   │   └── monitoring.py
│   │
│   ├── modules/
│   │   ├── incidents/
│   │   ├── ingestion/
│   │   ├── telegram/
│   │   ├── sources/
│   │   ├── geocoding/
│   │   ├── ai/
│   │   └── monitoring/
│   │
│   ├── workers/
│   │   ├── historical_worker.py
│   │   ├── telegram_worker.py
│   │   └── processing_worker.py
│   │
│   ├── database/
│   ├── models/
│   ├── schemas/
│   └── core/
│
├── tests/
├── Dockerfile
└── docker-compose.yml
```

La separación por módulos permitirá que cada componente tenga una responsabilidad clara.

---

# 5. Fuentes de información

La plataforma tendrá diferentes tipos de fuentes.

## 5.1. Datos históricos

Los datos que ya existen para los años anteriores, por ejemplo:

```text
2024
2025
2026
```

serán procesados mediante pipelines de ingesta.

Estos datos permitirán construir el historial de incidentes de la plataforma.

---

## 5.2. Fuentes oficiales

También se podrán incorporar datos procedentes de instituciones públicas y datasets oficiales cuando estén disponibles y sean accesibles legalmente.

Estas fuentes tendrán una identificación específica:

```text
source_type = official
```

Esto permitirá diferenciarlas de noticias o publicaciones de Telegram.

---

# 6. Bot de fuentes colaboradoras

Uno de los componentes importantes de la plataforma será el **sistema de fuentes colaboradoras mediante Telegram**.

La idea no es crear simplemente un bot para hacer scraping de canales.

El concepto será:

> **Bot de fuentes colaboradoras**

La plataforma podrá establecer acuerdos o colaboraciones con administradores de canales, medios de comunicación u otras fuentes que voluntariamente quieran proporcionar sus publicaciones al proyecto.

Por ejemplo:

```text
                    FUENTE COLABORADORA
                            │
                            │ autorización
                            ▼
                     Canal de Telegram
                            │
                            ▼
                    Bot autorizado
                            │
                            ▼
                    Telegram Worker
                            │
                            ▼
                     Procesamiento
                            │
                            ▼
                     Plataforma
```

Por ejemplo, si un canal como:

```text
@AlertaEcuador7
```

acepta colaborar con la plataforma, el administrador podría autorizar la integración correspondiente.

La finalidad sería que las publicaciones proporcionadas por la fuente se utilicen como **fuente de información para el sistema**, manteniendo la atribución correspondiente.

---

# 7. Diferencia entre scraping y fuente colaboradora

El proyecto no debería plantear esta integración como:

> "Voy a hacer scraping de canales de Telegram."

El enfoque sería:

> "Voy a integrar fuentes colaboradoras que voluntariamente proporcionan sus publicaciones mediante una integración autorizada."

Esto tiene varias ventajas.

Primero, permite establecer claramente la procedencia de los datos.

Segundo, permite mantener la atribución de la fuente.

Tercero, permite que el administrador de la fuente tenga conocimiento de cómo se utilizará la información.

Cuarto, facilita documentar la metodología del proyecto académico.

La plataforma debería almacenar información como:

```text
Fuente:
Alerta Ecuador

Tipo:
Telegram

Canal:
@AlertaEcuador7

Estado:
Colaborador autorizado

Fecha de integración:
2026-09-22
```

---

# 8. Telethon

Para la integración con Telegram se puede utilizar **Telethon**, dado que permite trabajar con Telegram mediante Python y MTProto.

El componente podría estructurarse como:

```text
Telegram
   ↓
Telethon
   ↓
Telegram Worker
   ↓
Procesamiento
```

El worker recibiría las publicaciones de las fuentes colaboradoras y las enviaría al pipeline de procesamiento.

Por ejemplo:

```text
Nueva publicación
        ↓
Guardar mensaje original
        ↓
Identificar fuente
        ↓
Extraer información
        ↓
Normalizar
        ↓
IA/NLP
        ↓
Geocoding
        ↓
Validación
        ↓
Crear incidente
```

---

# 9. Conservación de la fuente original

Cada incidente generado desde una fuente colaboradora debería conservar la información de procedencia.

Por ejemplo:

```json
{
  "source_type": "telegram",
  "source_name": "Alerta Ecuador",
  "source_channel": "@AlertaEcuador7",
  "source_message_id": "123456",
  "source_url": "...",
  "published_at": "...",
  "verification": "reported"
}
```

Esto permite responder posteriormente:

> ¿De dónde salió este incidente?

Y obtener:

```text
Incidente
   ↓
Fuente
   ↓
Publicación original
   ↓
Canal colaborador
```

Esto es especialmente importante para la trazabilidad de los datos.

---

# 10. Procesamiento mediante IA

Las publicaciones de Telegram, noticias u otras fuentes pueden contener información no estructurada.

Por ejemplo:

```text
"Se reporta accidente en la vía Manta-Portoviejo.
Personal de emergencia acudió al lugar."
```

El sistema podría convertirla en información estructurada:

```text
Tipo:
Accidente de tránsito

Provincia:
Manabí

Ciudad:
Manta

Ubicación:
Vía Manta-Portoviejo

Fecha:
22/09/2026

Fuente:
Telegram

Estado:
Reportado

Confianza:
0.89
```

La IA no debería inventar información que no esté presente en la fuente.

Especialmente con las coordenadas:

```text
Texto
 ↓
Extracción de ubicación
 ↓
Geocoding
 ↓
Coordenadas
```

No:

```text
IA
 ↓
"Creo que ocurrió aquí"
```

---

# 11. Geocodificación

Una vez extraída una ubicación, el sistema podría utilizar un servicio de geocodificación para convertirla en coordenadas.

Por ejemplo:

```text
"Manta, Manabí"
        ↓
Geocoding
        ↓
-0.9676, -80.7089
```

Y también puede realizarse el proceso inverso:

```text
-0.9676, -80.7089
        ↓
Reverse Geocoding
        ↓
Ecuador
Manabí
Manta
Sector
Calle
```

La información geográfica podrá almacenarse utilizando PostGIS.

---

# 12. Pipeline completo de una fuente colaboradora

El flujo completo sería:

```text
                 CANAL COLABORADOR
                         │
                         ▼
                 PUBLICACIÓN NUEVA
                         │
                         ▼
                 TELETHON / BOT
                         │
                         ▼
              GUARDAR MENSAJE ORIGINAL
                         │
                         ▼
                  NORMALIZACIÓN
                         │
                         ▼
                  EXTRACCIÓN IA
                         │
                         ▼
                    GEOCODING
                         │
                         ▼
                   VALIDACIÓN
                         │
                         ▼
                 DEDUPLICACIÓN
                         │
                         ▼
                 POSTGRESQL
                   + POSTGIS
                         │
                         ├──────────────► REDSHIFT
                         │
                         ▼
                    WEBSOCKET
                         │
                         ▼
                     MAPLIBRE
```

Esto permitiría que una publicación nueva termine apareciendo en el mapa después de pasar por el pipeline correspondiente.

---

# 13. Ingesta histórica

Además del sistema de fuentes colaboradoras, existirán los datos históricos.

Por ejemplo:

```text
2024
2025
2026
```

Estos datos podrán ser procesados mediante:

```text
historical_worker.py
```

El flujo sería:

```text
Dataset
   ↓
Lectura
   ↓
Validación
   ↓
Normalización
   ↓
Deduplicación
   ↓
Transformación
   ↓
PostgreSQL/PostGIS
   ↓
Redshift
```

El worker será independiente del Telegram Worker.

---

# 14. Workers

El backend tendrá diferentes workers.

## Telegram Worker

```text
Telegram
   ↓
Telethon
   ↓
Mensajes
   ↓
Procesamiento
```

## Historical Worker

```text
Dataset
   ↓
ETL
   ↓
PostgreSQL
   ↓
Redshift
```

## Processing Worker

```text
Datos pendientes
       ↓
IA
       ↓
Geocoding
       ↓
Validación
       ↓
Incidente final
```

De esta manera, cada proceso puede funcionar de forma independiente aunque todos pertenezcan al mismo backend.

---

# 15. Redis

Redis puede utilizarse como sistema de apoyo para los workers.

Por ejemplo:

```text
Telegram Worker
       ↓
     Redis
       ↓
Processing Worker
       ↓
PostgreSQL
```

Esto permitiría colocar trabajos en una cola:

```text
pending
processing
completed
failed
```

Por ejemplo:

```text
job_001 → processing
job_002 → completed
job_003 → failed
job_004 → pending
```

Esto también facilitaría el monitoreo del sistema.

---

# 16. PostgreSQL + PostGIS

PostgreSQL será la base de datos operacional.

PostGIS permitirá almacenar y consultar información geográfica.

Entre las entidades principales podrían existir:

```text
incidents
sources
source_channels
telegram_messages
locations
users
pipeline_runs
processing_jobs
system_logs
```

Por ejemplo:

```text
incidents
├── id
├── type
├── title
├── description
├── occurred_at
├── reported_at
├── province
├── canton
├── city
├── location
├── location_precision
├── source_id
├── verification_status
├── confidence
└── created_at
```

---

# 17. Redshift

Redshift tendría principalmente una función analítica.

El flujo sería:

```text
PostgreSQL
     ↓
Transformación
     ↓
Redshift
     ↓
Analytics
```

Podría utilizarse para:

* estadísticas históricas;
* tendencias;
* agregaciones;
* análisis temporal;
* análisis geográfico;
* comparaciones entre períodos;
* dashboards analíticos.

La base operacional y la base analítica tendrían responsabilidades diferentes.

---

# 18. Panel de administración y monitoreo

El panel administrativo será una parte fundamental de la plataforma.

No será únicamente un panel para administrar usuarios.

Será un **centro de operaciones de la plataforma**.

Desde ahí se podrá verificar:

```text
API
PostgreSQL
PostGIS
Redis
Telegram
Workers
Ingesta
IA
Geocoding
Redshift
```

También permitirá consultar:

```text
Logs
Errores
Ejecuciones
Registros procesados
Registros rechazados
Últimos mensajes
Estado de conexiones
Estado de pipelines
```

---

# 19. Dashboard principal

El dashboard podría mostrar:

```text
┌─────────────────────────────────────────────┐
│ INCIDENT MONITOR — ADMIN                   │
├─────────────────────────────────────────────┤
│                                             │
│ 🟢 API              Online                  │
│ 🟢 PostgreSQL       Online                  │
│ 🟢 Redshift         Online                  │
│ 🟢 Telegram         Connected               │
│ 🟢 Workers          Running                 │
│                                             │
├─────────────────────────────────────────────┤
│ INGESTION                                   │
│                                             │
│ Histórico 2024       ██████████ 100%       │
│ Histórico 2025       ██████████ 100%       │
│ Histórico 2026       ███████░░░ 72%        │
│                                             │
│ Última ejecución: 22/09/2026 23:30          │
│ Registros procesados: 1,284                 │
│ Errores: 3                                  │
│                                             │
├─────────────────────────────────────────────┤
│ FUENTES COLABORADORAS                       │
│                                             │
│ @AlertaEcuador7                             │
│ Status: 🟢 Connected                        │
│                                             │
│ Mensajes recibidos: 4,832                   │
│ Último mensaje: hace 14 segundos            │
│ Incidentes detectados: 1,237                │
│ Pendientes de revisión: 24                  │
│                                             │
├─────────────────────────────────────────────┤
│ REDSHIFT                                    │
│                                             │
│ Última carga: 23:29:52                      │
│ Filas insertadas: 423                       │
│ Filas rechazadas: 2                         │
│                                             │
└─────────────────────────────────────────────┘
```

---

# 20. Monitoreo de fuentes colaboradoras

Cada fuente colaboradora podría tener su propia tarjeta:

```text
FUENTE COLABORADORA
────────────────────────────

Nombre:
Alerta Ecuador

Telegram:
@AlertaEcuador7

Estado:
🟢 Connected

Último mensaje:
23:41:12

Mensajes recibidos:
4,832

Incidentes generados:
1,237

Pendientes:
24

Errores:
1

[Ver mensajes]
[Ver incidentes]
[Ver errores]
[Configuración]
```

También se podría detectar automáticamente si una fuente deja de enviar información.

Por ejemplo:

```text
🟢 Activa
🟡 Sin mensajes recientes
🔴 Desconectada
```

---

# 21. Monitoreo de la ingesta

El mismo sistema se utilizará para la ingesta histórica:

```text
Historical ingestion
────────────────────────

2024
████████████████ 100%

2025
████████████████ 100%

2026
████████████░░░░ 78%

Último registro:
2026-09-22 23:38

Procesados:
182,432

Duplicados:
2,381

Errores:
17

[Ejecutar nuevamente]
[Ver logs]
```

---

# 22. Pipeline Runs

Se puede crear una tabla:

```text
pipeline_runs
```

para almacenar cada ejecución.

Ejemplo:

| Pipeline                | Inicio | Fin   | Estado | Registros | Errores |
| ----------------------- | ------ | ----- | ------ | --------: | ------: |
| historical_2024         | 23:00  | 23:03 | ✅      |    12,421 |       0 |
| historical_2025         | 23:04  | 23:09 | ✅      |    18,392 |       2 |
| telegram_alerta_ecuador | 23:10  | —     | 🟢     |       431 |       1 |
| redshift_sync           | 23:20  | 23:22 | ✅      |       431 |       0 |

Esto permitirá conocer el estado de cada proceso.

---

# 23. Sistema de logs

El backend debería registrar eventos importantes:

```text
API started
Database connected
Redis connected

Telegram connected
Telegram disconnected
Message received
Message processed
Message rejected

AI extraction started
AI extraction completed
AI extraction failed

Geocoding started
Geocoding completed
Geocoding failed

ETL started
ETL completed
ETL failed

Redshift synchronization started
Redshift synchronization completed
```

Desde el panel administrativo se podrían consultar estos logs.

---

# 24. Estados de procesamiento

Cada información que entra al sistema podría pasar por estados:

```text
RECEIVED
   ↓
PROCESSING
   ↓
EXTRACTED
   ↓
GEOCODED
   ↓
VALIDATED
   ↓
STORED
   ↓
ANALYTICS
```

Si ocurre un error:

```text
PROCESSING
     ↓
   FAILED
```

Y el panel podría mostrar:

```text
🔴 17 trabajos fallidos
```

permitiendo revisar qué ocurrió.

---

# 25. Flujo completo de la plataforma

La plataforma completa tendría dos grandes caminos de entrada.

## Datos históricos

```text
Datos históricos
      ↓
Historical Worker
      ↓
ETL
      ↓
Normalización
      ↓
Validación
      ↓
PostgreSQL/PostGIS
      ↓
Redshift
```

## Fuentes colaboradoras

```text
Canal colaborador
      ↓
Telegram
      ↓
Telethon / Bot autorizado
      ↓
Telegram Worker
      ↓
Mensaje original
      ↓
IA/NLP
      ↓
Geocoding
      ↓
Validación
      ↓
PostgreSQL/PostGIS
      ↓
Redshift
```

Ambos caminos terminan utilizando el mismo modelo de datos de incidentes.

---

# 26. Visualización

Una vez que el incidente está almacenado:

```text
PostgreSQL + PostGIS
        ↓
FastAPI
        ↓
WebSocket / REST
        ↓
Frontend
        ↓
MapLibre
```

El usuario podrá visualizar:

```text
🟥 Robos
🟧 Siniestros
🟦 Muertes
🟨 Otros incidentes
```

También podrá filtrar por:

```text
País
Provincia
Cantón
Ciudad
Sector
Tipo de incidente
Fecha
Fuente
Estado de verificación
```

---

# 27. Trazabilidad

Uno de los principios importantes de la plataforma será mantener la trazabilidad.

Cada incidente debería poder responder:

```text
¿De dónde salió?
¿Cuándo se recibió?
¿Cuándo ocurrió?
¿Qué fuente lo publicó?
¿Fue procesado por IA?
¿Qué ubicación se obtuvo?
¿Fue verificado?
¿Cuándo se almacenó?
```

Por ejemplo:

```text
INC-2026-001234

Fuente:
Alerta Ecuador

Origen:
Telegram

Publicación:
22/09/2026 23:41

Procesamiento:
22/09/2026 23:41:03

Geocoding:
22/09/2026 23:41:05

Estado:
Reportado

Verificación:
Pendiente
```

Esto será especialmente importante porque la plataforma trabaja con información que puede ser inicialmente no verificada.

---

# 28. Arquitectura tecnológica inicial

La primera versión podría utilizar:

```text
Frontend
├── React
├── TypeScript
├── Vite
├── Tailwind CSS
├── MapLibre GL JS
└── PWA

Backend
├── Python
├── FastAPI
├── Telethon
└── WebSocket

Data
├── PostgreSQL
├── PostGIS
├── Redis
└── Redshift

Processing
├── ETL
├── IA/NLP
├── Geocoding
└── Deduplicación

Infrastructure
├── Docker
├── Docker Compose
└── AWS
```

---

# 29. Decisión arquitectónica

La decisión para la primera versión será:

> **Monolito modular + workers + Redis + PostgreSQL/PostGIS + Redshift + sistema de fuentes colaboradoras de Telegram + panel administrativo de monitoreo.**

No se utilizarán microservicios inicialmente.

El backend será único, pero tendrá módulos claramente separados:

```text
API
Auth
Incidents
Sources
Telegram
Ingestion
AI
Geocoding
Monitoring
Admin
```

Y workers independientes:

```text
Telegram Worker
Historical Worker
Processing Worker
```

---

# 30. Evolución futura

Aunque la plataforma comenzará como un monolito modular, la arquitectura estará preparada para evolucionar.

Si en el futuro el proyecto aumenta considerablemente su volumen de datos o número de fuentes, algunos módulos podrían convertirse en servicios independientes.

Por ejemplo:

```text
                    API Backend
                        │
                 Redis / Queue
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
      Telegram       ETL         AI/NLP
      Service       Service       Service
```

Sin embargo, esto será una **etapa futura**, no parte de la implementación inicial.

La prioridad inicial será construir correctamente:

1. El backend modular.
2. La ingesta histórica.
3. El sistema de fuentes colaboradoras.
4. La integración autorizada con Telegram.
5. El procesamiento mediante IA.
6. La geocodificación.
7. PostgreSQL + PostGIS.
8. Redshift para análisis.
9. Redis y workers.
10. El panel administrativo y de monitoreo.
11. La visualización mediante MapLibre.
12. La trazabilidad completa de cada incidente.

De esta manera, la plataforma no será simplemente un mapa de incidentes ni un sistema de scraping. Será una **plataforma de ingesta, procesamiento, trazabilidad, análisis y visualización geográfica de incidentes**, capaz de incorporar fuentes colaboradoras autorizadas y datos históricos dentro de una misma arquitectura.

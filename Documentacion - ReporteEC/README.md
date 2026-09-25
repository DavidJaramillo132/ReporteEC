---
tags: [reporteec, indice]
actualizado: 2026-09-24
---

# ReporteEC

Plataforma de datos geoespaciales sobre incidentes de seguridad y movilidad segura en Ecuador.
Combina estadística oficial de Fiscalía, Ministerio del Interior e INEC con reportes ciudadanos,
evaluación de riesgo en rutas por horario, e indicadores de extorsión comercial, etiquetando cada
registro con un nivel de confianza que declara de dónde salió la información.

> [!info] Estado del proyecto
> **Fase: definición y arquitectura.** Decisiones de producto consolidadas, hoja de ruta
> definida en [[Hoja de Ruta]] y stack soberano aprobado (PostGIS + Martin + FastAPI).
> Solo existen scripts de inspección y el prototipo del scraper.

## Mapa de la documentación

### Versiones
- [[V1 - Mapa Histórico]] — cimientos, mapa con datos oficiales desde 2019, páginas de inicio, metodología y licencia
- [[V2 - Rutas e Inteligencia Horaria]] — navegación de seguridad, tramos críticos por franja horaria y API B2B
- [[V3 - Tiempo Real y Comunidad]] — cuentas, reportes ciudadanos, moderación, vista actualidad y notificaciones
- [[V4 - Red Colaborativa e IA]] — canales de Telegram colaboradores, ingesta automatizada con IA y geocodificación

### Producto
- [[Visión y Alcance]] — qué es y por qué existe
- [[Hoja de Ruta]] — resumen de las versiones y pendientes que las atraviesan
- [[Niveles de Confianza]] — el sistema de etiquetado, núcleo del producto
- [[Tipos de Incidente]] — lista única de tipos para todo el sistema
- [[Riesgos en Rutas por Horario]] — evaluación de peligrosidad en trayectos según la hora
- [[Modelo de Monetización]] — estrategia de sostenibilidad B2B, APIs y servicios de riesgo
- [[Decisiones de Negocio Pendientes]] — decisiones tomadas y las que siguen abiertas
- [[Riesgos Abiertos]] — amenazas a la viabilidad del proyecto

### Datos
- [[Fuentes]] — de dónde sale la información y con qué rezago
- [[Extorsión y Vacunas a Negocios]] — estadísticas FGE, OECO e índice de riesgo comercial
- [[Esquema de Campos]] — campos verificados de cada dataset
- [[Calidad de Datos]] — resultados de la validación sobre 61.445 filas
- [[CKAN — Acceso a Datos]] — cómo resolver las URLs de descarga
- [[Scraper Noticias Policía]] — API de WordPress, hallazgos y diseño
- [[Telegram - Fuentes Colaboradoras]] — canales y grupos que colaboran (V4)

### Arquitectura
- [[Stack e Infraestructura]] — stack aprobado e infraestructura en VPS Azure
- [[Módulos del Sistema]] — cómo se divide el código y fluyen los datos
- [[Arquitectura de la Plataforma]] — especificación del monolito modular FastAPI + PostGIS + Martin

### Desarrollo
- [[Guía de Desarrollo]] — hoja de ruta técnica paso a paso para construir de la Fase 0 a la Fase 4

### Archivo
- [[Almacén Analítico (Descartado)]] — evaluación previa de Redshift y Fabric (descartada)
- [[Ideas Sueltas]] — nota original de lluvia de ideas, preservada sin editar

## Convención de este repositorio

Esta carpeta es el **vault de Obsidian** del proyecto y contiene únicamente
información, estructura y documentación. El código vive en `codigo/`, carpeta
hermana dentro del mismo repositorio git.

Los datos crudos descargados (XLSX del portal de datos abiertos) **no se
versionan**: pesan megabytes y se republican cada mes. El ETL debe saber
descargarlos, no el repositorio almacenarlos.

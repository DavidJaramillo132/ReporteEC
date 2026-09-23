---
tags: [reporteec, indice]
actualizado: 2026-09-23
---

# ReporteEC

Plataforma de datos geoespaciales sobre incidentes de seguridad en Ecuador.
Combina estadística oficial del Ministerio del Interior con reportes ciudadanos,
y etiqueta cada registro con un nivel de confianza que declara de dónde salió
la información.

> [!info] Estado del proyecto
> **Fase: definición.** Decisiones de producto casi cerradas, versiones
> definidas en [[Hoja de Ruta]] y stack aprobado.
> Solo existen scripts de inspección y el prototipo del scraper.

## Mapa de la documentación

### Versiones
- [[V1 - Mapa Histórico]] — cimientos, mapa con datos oficiales desde 2019, páginas de inicio, metodología y licencia
- [[V2 - Tiempo Real]] — cuentas, reportes ciudadanos, moderación, notificaciones
- [[V3 - Fuentes Colaboradoras e IA]] — Telegram e IA

### Producto
- [[Visión y Alcance]] — qué es y por qué existe
- [[Hoja de Ruta]] — resumen de las versiones y pendientes que las atraviesan
- [[Niveles de Confianza]] — el sistema de etiquetado, núcleo del producto
- [[Tipos de Incidente]] — lista única de tipos para todo el sistema
- [[Decisiones de Negocio Pendientes]] — decisiones tomadas y las que siguen abiertas
- [[Riesgos Abiertos]] — amenazas a la viabilidad del proyecto

### Datos
- [[Fuentes]] — de dónde sale la información y con qué rezago
- [[Esquema de Campos]] — campos verificados de cada dataset
- [[Calidad de Datos]] — resultados de la validación sobre 61.445 filas
- [[CKAN — Acceso a Datos]] — cómo resolver las URLs de descarga
- [[Scraper Noticias Policía]] — API de WordPress, hallazgos y diseño
- [[Telegram - Fuentes Colaboradoras]] — canales y grupos que colaboran (V3)

### Arquitectura
- [[Stack e Infraestructura]] — stack aprobado e infraestructura
- [[Módulos del Sistema]] — cómo se divide el código y fluyen los datos
- [[Arquitectura de la Plataforma]] — propuesta ampliada, con las diferencias ya resueltas
- [[Almacén Analítico]] — experimento con Redshift y Fabric Warehouse

### Archivo
- [[Ideas Sueltas]] — nota original de lluvia de ideas, preservada sin editar

## Convención de este repositorio

Esta carpeta es el **vault de Obsidian** del proyecto y contiene únicamente
información, estructura y documentación. El código vive en `codigo/`, carpeta
hermana dentro del mismo repositorio git.

Los datos crudos descargados (XLSX del portal de datos abiertos) **no se
versionan**: pesan megabytes y se republican cada mes. El ETL debe saber
descargarlos, no el repositorio almacenarlos.

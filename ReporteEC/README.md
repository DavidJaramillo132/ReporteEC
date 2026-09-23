---
tags: [reporteec, indice]
actualizado: 2026-09-22
---

# ReporteEC

Plataforma de datos geoespaciales sobre incidentes de seguridad en Ecuador.
Combina estadística oficial del Ministerio del Interior con reportes ciudadanos,
y etiqueta cada registro con un nivel de confianza que declara de dónde salió
la información.

> [!info] Estado del proyecto
> **Fase: definición.** No hay código todavía. Las fuentes de datos ya están
> verificadas técnicamente (ver [[Calidad de Datos]]).

## Mapa de la documentación

### Producto
- [[Visión y Alcance]] — qué es, qué entra en la v1 y qué se posterga
- [[Niveles de Confianza]] — el sistema de etiquetado, núcleo del producto
- [[Decisiones de Negocio Pendientes]] — incoherencias de lógica sin resolver
- [[Riesgos Abiertos]] — amenazas a la viabilidad del proyecto

### Datos
- [[Fuentes]] — de dónde sale la información y con qué rezago
- [[Esquema de Campos]] — campos verificados de cada dataset
- [[Calidad de Datos]] — resultados de la validación sobre 61.445 filas
- [[CKAN — Acceso a Datos]] — cómo resolver las URLs de descarga

### Arquitectura
- [[Stack e Infraestructura]] — base de datos, frontend, despliegue

### Archivo
- [[Ideas Sueltas]] — nota original de lluvia de ideas, preservada sin editar

## Convención de este repositorio

Esta carpeta es el **vault de Obsidian** del proyecto y contiene únicamente
información, estructura y documentación. El código vive en `codigo/`, carpeta
hermana dentro del mismo repositorio git.

Los datos crudos descargados (XLSX del portal de datos abiertos) **no se
versionan**: pesan megabytes y se republican cada mes. El ETL debe saber
descargarlos, no el repositorio almacenarlos.

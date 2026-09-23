---
tags: [arquitectura, stack, infraestructura]
actualizado: 2026-09-22
---

# Stack e Infraestructura

> [!warning] Stack no cerrado
> La nota original declara el stack «aún sin definir». Lo recogido aquí son
> decisiones tentativas, no acuerdos firmes.

## Datos

**PostgreSQL + PostGIS.**

La verificación de [[Calidad de Datos]] confirma coordenadas punto por
incidente, lo que fija el modelo geoespacial:

- Geometría `geometry(Point, 4326)` — WGS84, que es el sistema en el que ya
  llegan los datos
- Índice GiST sobre la columna de geometría

> [!question] Ambigüedad pendiente
> La nota original dice «Posgrest». Si se refiere a **PostgreSQL**, es el motor
> de base de datos. Si se refiere a **PostgREST**, es una herramienta que
> genera una API REST automática sobre PostgreSQL y condiciona si existe
> backend propio o no. Ver [[Riesgos Abiertos]].

## Frontend

- **MapLibre GL JS** para la cartografía
- **PWA** para cubrir web y móvil con una sola base de código
- App nativa solo si el producto valida tracción

Limitaciones de la PWA que afectan al alcance: sin geofencing en segundo plano,
y Web Push en iOS solo desde 16.4 y con la app instalada en pantalla de inicio.
Detalle en [[Riesgos Abiertos]].

## Infraestructura

| Componente | Elección | Nota |
|---|---|---|
| Servidor | VPS con Ubuntu Server | |
| Proveedor | Azure | Migración futura a AWS contemplada |
| Servidor web | Caddy | |
| Dominio | GoDaddy | |
| Almacenamiento | Bucket para imágenes | Requiere optimizar la subida |

> [!note] Sobre la migración a AWS
> Mientras no exista carga real que lo justifique, es una decisión prematura.
> Caddy sobre un VPS es una base sobria y suficiente.

## Ingesta

Pipeline ETL/ELT que descarga los XLSX oficiales, los normaliza y los carga en
PostGIS. Las reglas concretas de parseo están en [[Esquema de Campos]] y el
acceso a los archivos en [[CKAN — Acceso a Datos]].

Los datos crudos **no se versionan** en el repositorio: son megabytes que se
republican mensualmente. El repositorio guarda la receta, no el ingrediente.

## Estructura del repositorio

```
ReporteEC/              ← repositorio git
├── ReporteEC/          ← vault de Obsidian: documentación (esta carpeta)
├── codigo/             ← implementación
└── .gitignore
```

El vault se abre como vault independiente en Obsidian, apuntando a la
subcarpeta y nunca a la raíz del repositorio: un vault indexa todo el markdown
por debajo, y una raíz acabaría absorbiendo los `README.md` de `node_modules`.

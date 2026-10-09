# Despliegue en producción

Guía paso a paso para desplegar ReporteEC en un VPS Ubuntu Server (Azure),
con dominio de GoDaddy y HTTPS automático (Caddy). Pensada para un solo
desarrollador, sin experiencia previa de sysadmin.

Componentes: `postgres` (PostGIS), `martin` (teselas), `backend` (API
FastAPI), `worker` (ingesta diaria), `caddy` (HTTPS + estáticos + proxy).
Ninguno excepto `caddy` publica puertos al exterior.

## 1. Prerrequisitos en el VPS

Conéctate por SSH al VPS (Ubuntu Server, 2 vCPU / 4 GB de RAM alcanza para
empezar) e instala Docker Engine + el plugin de Compose desde el repositorio
oficial de Docker:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Opcional: correr docker sin sudo.
sudo usermod -aG docker "$USER"
```

Cierra y reabre la sesión SSH para que el grupo `docker` tome efecto.

**Firewall.** Deja solo SSH (22), HTTP (80) y HTTPS (443) abiertos —
80/443 los necesita Caddy para emitir el certificado (desafío ACME) además
de servir el sitio:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Si el VPS está en Azure, replica exactamente esos tres puertos en el
**Network Security Group (NSG)** de la interfaz de red desde el portal de
Azure (Redes → reglas de puerto de entrada) — `ufw` por sí solo no basta si
el NSG de Azure bloquea el tráfico antes de llegar a la VM.

## 2. DNS en GoDaddy

En el panel de DNS del dominio en GoDaddy, crea (o edita) estos registros
para que apunten a la IP pública del VPS:

| Tipo | Nombre | Valor              |
| ---- | ------ | ------------------- |
| A    | @      | `<IP pública del VPS>` |
| A    | www    | `<IP pública del VPS>` |

La propagación puede tardar desde minutos hasta un par de horas.

## 3. Clonar el repositorio

```bash
git clone <url-del-repo> reporteec
cd reporteec/codigo/despliegue
```

## 4. Variables de entorno

Este directorio **no** trae un `.env.prod.example` (las plantillas `.env*`
quedan fuera del repo por política del proyecto). Crea tú mismo
`codigo/despliegue/.env` con estas claves:

| Variable            | Para qué                                                                 | Ejemplo                          |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| `POSTGRES_USER`     | Usuario de PostgreSQL                                                      | `reporteec`                        |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL — genera una fuerte, no reutilices la de dev     | `pega-aquí-una-contraseña-larga` |
| `POSTGRES_DB`       | Nombre de la base de datos                                                 | `reporteec`                        |
| `DOMAIN`            | Dominio del sitio; Caddy emite HTTPS automático para él                  | `reporteec.example.com`            |
| `CORS_ORIGINS`      | Origen permitido por el backend — mismo origen que `DOMAIN`, con esquema | `https://reporteec.example.com`    |

`HTTP_PORT`/`HTTPS_PORT` son opcionales (por defecto 80/443); solo se tocan
para la prueba local en `localhost` de la sección 8.

```bash
nano .env   # pega las claves de arriba con tus propios valores
chmod 600 .env
```

## 5. Construir y levantar

Desde `codigo/despliegue/`:

```bash
docker compose -f compose.prod.yml --env-file .env up -d --build postgres martin backend worker
```

`caddy` se deja para el final a propósito: si arranca antes que `backend`/
`martin` estén sanos, `depends_on` lo bloquea; súbelo aparte una vez que
los anteriores estén `healthy`:

```bash
docker compose -f compose.prod.yml --env-file .env ps
docker compose -f compose.prod.yml --env-file .env up -d caddy
```

`martin` reintenta solo (`restart: unless-stopped`) si arranca antes que
existan las vistas de mapa — normal la primerísima vez, antes del paso 6.

## 6. Migraciones

```bash
docker compose -f compose.prod.yml --env-file .env run --rm backend alembic upgrade head
```

Ejecútalo también después de cada actualización que traiga una migración
nueva (ver "Actualizaciones" más abajo).

## 7. Carga inicial de datos

**Homicidios, desaparecidas, detenidos** (CKAN): el servicio `worker` ya
las descarga y carga solo, apenas arranca y luego cada 24 horas. Para no
esperar el primer ciclo:

> Si el portal bloquea la IP del VPS (responde 403), el worker no puede
> descargar: sigue la sección 14, «Actualizar los datos».

```bash
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.ingestion all
```

**Cantones, población, extorsión (OECO), siniestros (INEC ESTRA)**: no
tienen paquete CKAN — se cargan desde archivo, y esos archivos **no están
en git** (`codigo/data/raw/` va a `.gitignore`). Cópialos primero desde tu
máquina al VPS:

```bash
# Desde tu máquina, con el repo local como origen:
rsync -avz codigo/data/raw/ tu_usuario@vps:~/reporteec/codigo/data/raw/
```

Y cárgalos ya en el VPS (mismos comandos que en desarrollo, solo con
`compose.prod.yml` y `--env-file .env` primero):

```bash
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.ingestion cantons --file /data/raw/<archivo-cantones>.xlsx
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.ingestion population --file /data/raw/<archivo-poblacion>.xlsx
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.ingestion extorsion --file /data/raw/<archivo-oeco>.xlsx
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.ingestion siniestros --file /data/raw/<archivo-inec>.xlsx
```

## 8. Verificación

```bash
curl -I https://tudominio.com/health
curl https://tudominio.com/api/meta
curl -o /dev/null -w '%{http_code}\n' https://tudominio.com/tiles/map_incidents/2/1/1
```

El primer comando debe responder `200`, el segundo un JSON con `counts` y
`sources`, y el tercero `200` (una tesela vectorial). Abre `https://tudominio.com`
en el navegador y confirma que el mapa dibuja el mapa de calor.

**Prueba local sin dominio real:** con `DOMAIN=http://localhost:8088` y
`HTTP_PORT=8088` en el `.env`, Caddy sirve en HTTP plano en ese puerto (sin
HTTPS) — útil para probar el stack de producción en tu propia máquina antes
de tocar el VPS. Con `DOMAIN=localhost` en cambio Caddy sí intenta HTTPS,
usando su CA interna (el navegador la marcará como no confiable a menos
que la importes).

## 9. Respaldos

`backup.sh` hace un `pg_dump -Fc` del contenedor `postgres` hacia
`/var/backups/reporteec` (configurable con `BACKUP_DIR`), con fecha en el
nombre, y conserva los últimos 14 días (`KEEP_DAYS`):

```bash
chmod +x backup.sh
./backup.sh
```

**Automatizarlo a diario (03:00 hora de Guayaquil).** Con cron:

```bash
# crontab -e
TZ=America/Guayaquil
0 3 * * * /home/tu_usuario/reporteec/codigo/despliegue/backup.sh >> /var/log/reporteec-backup.log 2>&1
```

O con un timer de systemd (`/etc/systemd/system/reporteec-backup.service`
y `.timer`):

```ini
# /etc/systemd/system/reporteec-backup.service
[Unit]
Description=Respaldo diario de ReporteEC

[Service]
Type=oneshot
WorkingDirectory=/home/tu_usuario/reporteec/codigo/despliegue
ExecStart=/home/tu_usuario/reporteec/codigo/despliegue/backup.sh
```

```ini
# /etc/systemd/system/reporteec-backup.timer
[Unit]
Description=Ejecuta el respaldo de ReporteEC a las 03:00 (America/Guayaquil)

[Timer]
OnCalendar=*-*-* 03:00:00 America/Guayaquil
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now reporteec-backup.timer
systemctl list-timers reporteec-backup.timer
```

**Restaurar** un respaldo (esto sobrescribe la base de datos actual):

```bash
# Copia el .dump elegido al servidor si hace falta, luego:
docker compose -f compose.prod.yml --env-file .env stop backend worker
cat /var/backups/reporteec/reporteec_<fecha>.dump | \
  docker compose -f compose.prod.yml --env-file .env exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
docker compose -f compose.prod.yml --env-file .env start backend worker
```

## 10. Actualizaciones

```bash
cd ~/reporteec
git pull
cd codigo/despliegue
docker compose -f compose.prod.yml --env-file .env up -d --build
docker compose -f compose.prod.yml --env-file .env run --rm backend alembic upgrade head
```

Reconstruye siempre antes de migrar: una migración nueva puede depender de
código que solo existe en la imagen recién construida.

## 11. Logs

```bash
docker compose -f compose.prod.yml --env-file .env logs -f backend
docker compose -f compose.prod.yml --env-file .env logs -f worker
docker compose -f compose.prod.yml --env-file .env logs -f caddy
```

## 12. Rollback

Si una actualización sale mal:

```bash
cd ~/reporteec
git log --oneline -5             # ubica el commit bueno anterior
git checkout <commit-bueno>
cd codigo/despliegue
docker compose -f compose.prod.yml --env-file .env up -d --build
```

Si la migración nueva ya corrió y rompió algo que un simple rollback de
código no arregla, restaura el respaldo más reciente anterior al despliegue
(sección 9) y luego haz el `checkout` de arriba.

## 13. Detrás de un Caddy compartido (VPS de Playhub)

En el VPS de Playhub otro Caddy (`~/projects/MiniGames`) ya ocupa los
puertos 80/443 y da HTTPS a varios subdominios de `playhubb.site`. ReporteEC
no publica puertos: su propio Caddy sirve la PWA y `/api` y `/tiles` por
HTTP dentro de Docker. Además, se une a la red `caddy_net` como
`reporteec-web`. El override es `compose.behind-proxy.yml`, que también fija
límites de memoria (el VPS no tiene swap).

1. **DNS en GoDaddy:** registro `A`, nombre `reporteec`, valor
   `158.23.163.230`.
2. **`.env`** en `codigo/despliegue/`, con `DOMAIN=:80` y
   `CORS_ORIGINS=https://reporteec.playhubb.site`. La contraseña debe ser
   hexadecimal, porque va dentro de una URL.
3. **Construir y levantar:**
   ```bash
   alias rec='docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env'
   rec up -d --build
   rec run --rm backend alembic upgrade head
   ```
4. **Datos**, en este orden. Usa `worker`, que tiene más memoria.
   - Primero los archivos del Ministerio: crean los nombres de provincias y
     cantones con los que se emparejan los límites.
   - Después los cantones y la población.
   - Por último, `homicidios --force`, que agrega los casos sin coordenadas
     ubicándolos en el centroide de su cantón.
   ```bash
   rec run --rm worker python -m app.ingestion all
   rec run --rm worker python -m app.ingestion cantons --file /data/raw/dpa/cantones_ecuador_simplificado.geojson
   rec run --rm worker python -m app.ingestion population --file /data/raw/poblacion/Total_cantonal_2010-2035.xlsx
   rec run --rm worker python -m app.ingestion homicidios --force
   rec run --rm worker python -m app.ingestion extorsion --file /data/raw/oeco/noticias_delito_2019_2025.csv
   # Un archivo por año: anual cuando existe (el de 2021 trae también 2014–2020), si no, trimestrales.
   rec run --rm worker python -m app.ingestion siniestros \
     $(for f in 2021_anual 2022_anual 2023_anual 2024_anual 2025_anual 2026_t1 2026_t2; do printf -- '--file /data/raw/inec/inec_estra_%s_datos_abiertos.zip ' "$f"; done)
   ```
5. **Caddy de Playhub:** respalda el archivo y agrega el bloque al final con
   `>>`. No uses `sed -i`, porque el archivo está montado por inodo dentro
   del contenedor. Valida y recarga sin cortar los otros sitios:
   ```bash
   cd ~/projects/MiniGames
   cp Caddyfile Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
   printf '\nreporteec.playhubb.site {\n\tencode zstd gzip\n\treverse_proxy reporteec-web:80\n}\n' >> Caddyfile
   docker exec minigames-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec minigames-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

## 14. Actualizar los datos (CKAN bloquea el VPS)

`datosabiertos.gob.ec` responde 403 a la IP del VPS, así que el `worker`
no puede descargar desde allí y queda apagado. Para actualizar los datos,
cuando el Ministerio publica un archivo nuevo (más o menos cada mes),
ejecuta en **tu máquina**:

```bash
codigo/scripts/actualizar_datos.sh
```

El script descarga desde CKAN, sube los archivos con `rsync` y los carga en
producción con `ingestion all --offline`. Los archivos ya cargados se
saltan. Después recalcula la escala de riesgo de rutas (paso 4, ver la
sección 15). Los datos del servidor se leen de `~/.config/reporteec/deploy.conf`,
que está fuera del repositorio:

```bash
REPORTEEC_SSH_HOST=usuario@ip
REPORTEEC_SSH_KEY=/ruta/a/la/llave.pem
REPORTEEC_REMOTE_DIR=projects/ReporteEC
```

## 15. Rutas (OSRM)

El cálculo de riesgo en rutas usa un servidor de rutas propio, OSRM, con el
mapa de Ecuador de OpenStreetMap (perfil de auto, algoritmo MLD). El servicio
`osrm` corre solo dentro de la red de Docker (puerto 5000, sin publicar) y el
backend lo llama en `OSRM_URL` (por defecto `http://osrm:5000`).

La preparación de los datos consume más memoria de la que tiene el VPS, así
que se hace **en tu máquina** y solo se sube el resultado (unos 900 MB):

```bash
# Descarga el mapa, lo procesa y deja los archivos en codigo/data/osrm/
codigo/scripts/preparar_osrm.sh

# Lo mismo, y además los envía al servidor con rsync
codigo/scripts/preparar_osrm.sh --subir
```

`--subir` lee los datos del servidor de `~/.config/reporteec/deploy.conf`,
igual que `actualizar_datos.sh` (ver la sección 14).

En el servidor, la primera vez levanta el servicio, y las siguientes veces
reinícialo para que lea los datos nuevos:

```bash
cd projects/ReporteEC/codigo/despliegue
docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env up -d osrm
docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env restart osrm
```

Para comprobar que responde (debe devolver `"code":"Ok"`):

```bash
docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env \
  exec osrm wget -qO- 'http://127.0.0.1:5000/route/v1/driving/-79.8862,-2.1894;-79.5340,-1.8022?overview=false'
```

**Escala del puntaje (0–100).** El puntaje de una ruta es un percentil: compara
su exposición con la de unas 800 a 1.000 rutas de referencia (cifra aproximada; el trabajo imprime la exacta) entre cantones del
continente (cada cantón con sus 5 más cercanos, más 200 pares largos con
semilla fija; Galápagos queda fuera). La escala se guarda en la tabla
`route_risk_reference`, se conserva el historial y la API lee la más reciente
(la API la detecta en la siguiente consulta, sin reiniciar). Hasta que exista una, la API
responde sin puntaje (`score: null`, `score_available: false`): nunca inventa
uno.

Se recalcula con el trabajo `route-reference`, que llama a OSRM unas 800 a 1.000
veces, una tras otra (unos minutos). `actualizar_datos.sh` lo ejecuta como
último paso, después de cargar los datos, dentro del contenedor `worker`
(que comparte la red de Docker con `osrm`). Necesita que los datos de OSRM
estén subidos y que el servicio `osrm` esté corriendo. Si no, el script lo
avisa en español y termina bien: la carga de datos ya hecha no se pierde.
También puedes lanzarlo a mano en el servidor:

```bash
cd projects/ReporteEC/codigo/despliegue
docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env \
  run --rm worker python -m app.ingestion route-reference
```

Repítelo cada vez que cambien los datos de incidentes o el mapa de OSRM.

**Actualización.** Las calles cambian poco: repite la preparación cada
unos meses (Geofabrik actualiza el archivo a diario). La imagen de OSRM está
fijada a una versión (`v6.0.0`); si la cambias, vuelve a preparar los datos,
porque los archivos de una versión mayor no sirven con otra.

**Memoria.** El servicio usa unos 660 MiB en reposo y tiene un límite de
1024 MB en `compose.behind-proxy.yml`. Ese espacio sale del que tenía el
`worker`, que no corre en producción.

En desarrollo, el servicio está bajo el perfil `osrm` para que
`docker compose up` no exija los datos:

```bash
codigo/scripts/preparar_osrm.sh
docker compose --profile osrm up -d osrm   # desde codigo/, puerto OSRM_PORT (5000)
```

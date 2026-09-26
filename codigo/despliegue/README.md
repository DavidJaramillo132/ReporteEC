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

```bash
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.modules.ingestion all
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
  python -m app.modules.ingestion cantons --file /data/raw/<archivo-cantones>.xlsx
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.modules.ingestion population --file /data/raw/<archivo-poblacion>.xlsx
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.modules.ingestion extorsion --file /data/raw/<archivo-oeco>.xlsx
docker compose -f compose.prod.yml --env-file .env run --rm backend \
  python -m app.modules.ingestion siniestros --file /data/raw/<archivo-inec>.xlsx
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

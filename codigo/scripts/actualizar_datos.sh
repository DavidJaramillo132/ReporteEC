#!/usr/bin/env bash
# Refresh production data from this machine.
#
# datosabiertos.gob.ec blocks the production VPS (HTTP 403 from the
# datacenter IP), so the daily worker cannot fetch CKAN there. This script
# does the part that needs CKAN here and the rest on the server:
#
#   1. download the Ministerio del Interior per-record files from CKAN
#      into codigo/data/raw/mdi (no database needed);
#   2. push them to the server with rsync;
#   3. load them there with `ingestion all --offline`. Files loaded
#      before are skipped by their hash, so running this often is cheap;
#   4. rebuild the route-risk reference distribution (`ingestion
#      route-reference`, about 1,300 routes through the `osrm` service). If
#      OSRM is not set up on the server yet, this step only warns: the data
#      refresh of step 3 is already done and stays.
#
# Server details live outside the repo (the repo is public), in
# ~/.config/reporteec/deploy.conf or the file named by REPORTEEC_DEPLOY_CONF:
#
#   REPORTEEC_SSH_HOST=usuario@ip
#   REPORTEEC_SSH_KEY=/ruta/a/la/llave.pem
#   REPORTEEC_REMOTE_DIR=projects/ReporteEC   # relative to the remote home
#
# Usage: codigo/scripts/actualizar_datos.sh
set -euo pipefail

CONF="${REPORTEEC_DEPLOY_CONF:-$HOME/.config/reporteec/deploy.conf}"
if [[ -f "$CONF" ]]; then
	# shellcheck source=/dev/null
	source "$CONF"
fi
: "${REPORTEEC_SSH_HOST:?Define REPORTEEC_SSH_HOST in $CONF}"
: "${REPORTEEC_SSH_KEY:?Define REPORTEEC_SSH_KEY in $CONF}"
REMOTE_DIR="${REPORTEEC_REMOTE_DIR:-projects/ReporteEC}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$REPO/codigo/data/raw/mdi"
SSH=(ssh -i "$REPORTEEC_SSH_KEY")

echo "1/4 Descargando archivos del Ministerio del Interior desde CKAN…"
uv --directory "$REPO/codigo/backend" run python -m app.ingestion download --dest "$RAW"

echo "2/4 Enviando archivos al servidor…"
rsync -az --chmod=Fugo=rw -e "${SSH[*]}" "$RAW/" "$REPORTEEC_SSH_HOST:$REMOTE_DIR/codigo/data/raw/mdi/"

echo "3/4 Cargando en la base de producción (los ya cargados se saltan)…"
"${SSH[@]}" "$REPORTEEC_SSH_HOST" "cd $REMOTE_DIR/codigo/despliegue && \
	docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env \
	run --rm worker python -m app.ingestion all --offline 2>&1 | grep -v -e '^ Container' -e httpx"

COMPOSE="docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env"
echo "4/4 Recalculando la escala de riesgo de rutas (necesita OSRM; tarda unos minutos)…"
if ! "${SSH[@]}" "$REPORTEEC_SSH_HOST" "cd $REMOTE_DIR/codigo/despliegue && \
	if [ ! -f ../data/osrm/ecuador-latest.osrm.mldgr ]; then \
		echo 'Faltan los datos de OSRM en el servidor.' >&2; exit 10; fi && \
	if ! $COMPOSE ps --status running --services | grep -qx osrm; then \
		echo 'El servicio osrm no está corriendo en el servidor.' >&2; exit 11; fi && \
	$COMPOSE run --rm worker python -m app.ingestion route-reference"; then
	cat >&2 <<'MSG'
Aviso: no se pudo recalcular la escala de riesgo de rutas. Los datos del
paso 3 ya quedaron cargados. Si OSRM aún no está instalado en el servidor,
sigue la sección 15 del README de despliegue (preparar_osrm.sh --subir y
levantar el servicio osrm) y vuelve a ejecutar este script. Mientras no haya
escala, las rutas se muestran sin puntaje (nunca un puntaje inventado).
MSG
	exit 0
fi

echo "Listo."

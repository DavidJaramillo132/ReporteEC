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
#      before are skipped by their hash, so running this often is cheap.
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

echo "1/3 Descargando archivos del Ministerio del Interior desde CKAN…"
uv --directory "$REPO/codigo/backend" run python -m app.ingestion download --dest "$RAW"

echo "2/3 Enviando archivos al servidor…"
rsync -az --chmod=Fugo=rw -e "${SSH[*]}" "$RAW/" "$REPORTEEC_SSH_HOST:$REMOTE_DIR/codigo/data/raw/mdi/"

echo "3/3 Cargando en la base de producción (los ya cargados se saltan)…"
"${SSH[@]}" "$REPORTEEC_SSH_HOST" "cd $REMOTE_DIR/codigo/despliegue && \
	docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env \
	run --rm worker python -m app.ingestion all --offline 2>&1 | grep -v -e '^ Container' -e httpx"

echo "Listo."

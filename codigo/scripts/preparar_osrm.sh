#!/usr/bin/env bash
# Prepare the OSRM routing data for Ecuador on this machine.
#
# The production VPS is too small to run the preparation (osrm-extract needs
# more memory than it has), so the data is built here and only the result is
# uploaded:
#
#   1. download the Ecuador extract from Geofabrik into codigo/data/osrm;
#   2. run osrm-extract (car profile), osrm-partition and osrm-customize
#      (MLD algorithm) in the pinned osrm-backend image;
#   3. with --subir, send the prepared files to the server with rsync.
#
# Server details live outside the repo (the repo is public), in
# ~/.config/reporteec/deploy.conf or the file named by REPORTEEC_DEPLOY_CONF
# (same file as actualizar_datos.sh):
#
#   REPORTEEC_SSH_HOST=usuario@ip
#   REPORTEEC_SSH_KEY=/ruta/a/la/llave.pem
#   REPORTEEC_REMOTE_DIR=projects/ReporteEC   # relative to the remote home
#
# Usage: codigo/scripts/preparar_osrm.sh [--subir]
set -euo pipefail

# Keep in sync with the image tag in docker-compose.yml and compose.prod.yml.
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v6.0.0"
PBF_URL="https://download.geofabrik.de/south-america/ecuador-latest.osm.pbf"

SUBIR=false
for arg in "$@"; do
	case "$arg" in
	--subir) SUBIR=true ;;
	-h | --help)
		echo "Uso: codigo/scripts/preparar_osrm.sh [--subir]"
		exit 0
		;;
	*)
		echo "Opción desconocida: $arg (uso: preparar_osrm.sh [--subir])" >&2
		exit 1
		;;
	esac
done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA="$REPO/codigo/data/osrm"
mkdir -p "$DATA"

if $SUBIR; then
	CONF="${REPORTEEC_DEPLOY_CONF:-$HOME/.config/reporteec/deploy.conf}"
	if [[ -f "$CONF" ]]; then
		# shellcheck source=/dev/null
		source "$CONF"
	fi
	: "${REPORTEEC_SSH_HOST:?Define REPORTEEC_SSH_HOST in $CONF}"
	: "${REPORTEEC_SSH_KEY:?Define REPORTEEC_SSH_KEY in $CONF}"
	REMOTE_DIR="${REPORTEEC_REMOTE_DIR:-projects/ReporteEC}"
fi

osrm() {
	docker run --rm -v "$DATA:/data" "$OSRM_IMAGE" "$@"
}

echo "1/4 Descargando el mapa de Ecuador desde Geofabrik…"
curl -fL --progress-bar -o "$DATA/ecuador-latest.osm.pbf.tmp" "$PBF_URL"
mv "$DATA/ecuador-latest.osm.pbf.tmp" "$DATA/ecuador-latest.osm.pbf"

# Remove output of a previous run so a failed step never leaves mixed files.
rm -f "$DATA"/ecuador-latest.osrm*

echo "2/4 Extrayendo la red vial (perfil de auto)…"
osrm osrm-extract -p /opt/car.lua /data/ecuador-latest.osm.pbf

echo "3/4 Preparando el algoritmo MLD (partition y customize)…"
osrm osrm-partition /data/ecuador-latest.osrm
osrm osrm-customize /data/ecuador-latest.osrm

echo "Tamaño de los datos preparados:"
du -ch "$DATA"/ecuador-latest.osrm* | tail -n 1

if $SUBIR; then
	echo "4/4 Enviando los datos al servidor…"
	SSH=(ssh -i "$REPORTEEC_SSH_KEY")
	"${SSH[@]}" "$REPORTEEC_SSH_HOST" "mkdir -p $REMOTE_DIR/codigo/data/osrm"
	# --delete drops stale files; the raw .pbf stays here (not needed to serve).
	rsync -az --delete --chmod=Fugo=rw --exclude='*.osm.pbf' -e "${SSH[*]}" \
		"$DATA/" "$REPORTEEC_SSH_HOST:$REMOTE_DIR/codigo/data/osrm/"
	echo "Datos enviados. Reinicia el servicio en el servidor:"
	echo "  cd $REMOTE_DIR/codigo/despliegue && docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env up -d osrm"
	echo "  (si ya estaba corriendo, cambia 'up -d' por 'restart')"
else
	echo "4/4 Listo. Usa --subir para enviar los datos al servidor."
fi

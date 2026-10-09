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
#      The `osrm` service is stopped for this step and started again right
#      after, even if the load fails: osrm (~700 MiB) plus a full worker
#      reload (~1 GB peak) do not fit together in the VPS's memory (no swap);
#   4. wait for osrm to be healthy, then rebuild the route-risk reference
#      distribution (`ingestion route-reference`, roughly 800-1,000 routes
#      through the `osrm` service). If OSRM is not set up on the server yet,
#      this step only warns (exit 0); any other failure of this step exits
#      non-zero. Either way the data refresh of step 3 is already done and
#      stays.
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
COMPOSE="docker compose -f compose.prod.yml -f compose.behind-proxy.yml --env-file .env"
# Seconds to wait for osrm to report healthy before step 4 (loading Ecuador
# takes well under a minute; the healthcheck allows 30 s plus 6 x 10 s).
OSRM_WAIT_S="${OSRM_WAIT_S:-300}"

# Runs a command in the server's codigo/despliegue directory.
remote() {
	"${SSH[@]}" "$REPORTEEC_SSH_HOST" "cd $REMOTE_DIR/codigo/despliegue && $1"
}

# Set while this script has osrm stopped: whatever happens next (a failed
# load, Ctrl-C), the EXIT trap starts it again so the site keeps routing.
OSRM_STOPPED=0
start_osrm() {
	[[ "$OSRM_STOPPED" == 1 ]] || return 0
	echo "    Levantando de nuevo el servicio osrm…"
	# Cleared first: a failed start is reported once, not again by the trap.
	OSRM_STOPPED=0
	if ! remote "$COMPOSE start osrm"; then
		cat >&2 <<MSG
Error: no se pudo volver a levantar el servicio osrm; el sitio no calcula
rutas mientras siga detenido. Levántalo a mano en el servidor:
  cd $REMOTE_DIR/codigo/despliegue && $COMPOSE start osrm
MSG
		return 1
	fi
}
trap start_osrm EXIT
trap 'exit 130' INT TERM

echo "1/4 Descargando archivos del Ministerio del Interior desde CKAN…"
uv --directory "$REPO/codigo/backend" run python -m app.ingestion download --dest "$RAW"

echo "2/4 Enviando archivos al servidor…"
rsync -az --chmod=Fugo=rw -e "${SSH[*]}" "$RAW/" "$REPORTEEC_SSH_HOST:$REMOTE_DIR/codigo/data/raw/mdi/"

echo "3/4 Cargando en la base de producción (los ya cargados se saltan)…"
if remote "$COMPOSE ps --status running --services | grep -qx osrm"; then
	echo "    Deteniendo osrm durante la carga, para liberar memoria (las rutas no responden mientras tanto)…"
	OSRM_STOPPED=1
	remote "$COMPOSE stop osrm"
fi
if ! remote "set -o pipefail; $COMPOSE run --rm worker python -m app.ingestion all --offline 2>&1 \
	| { grep -v -e '^ Container' -e httpx || true; }"; then
	echo "Error: falló la carga de datos en el servidor (paso 3). Revisa el mensaje de arriba." >&2
	exit 1 # the EXIT trap starts osrm again
fi
start_osrm

echo "4/4 Recalculando la escala de riesgo de rutas (necesita OSRM; tarda unos minutos)…"
set +e
remote "if [ ! -f ../data/osrm/ecuador-latest.osrm.mldgr ]; then \
		echo 'Faltan los datos de OSRM en el servidor.' >&2; exit 10; fi && \
	if ! $COMPOSE ps --status running --services | grep -qx osrm; then \
		echo 'El servicio osrm no está corriendo en el servidor.' >&2; exit 11; fi && \
	echo '    Esperando a que osrm esté listo…' && \
	waited=0 && \
	until [ \"\$(docker inspect -f '{{.State.Health.Status}}' \$($COMPOSE ps -q osrm) 2>/dev/null)\" = healthy ]; do \
		if [ \$waited -ge $OSRM_WAIT_S ]; then \
			echo 'El servicio osrm no quedó listo (healthy) en $OSRM_WAIT_S segundos.' >&2; exit 12; fi; \
		sleep 5; waited=\$((waited + 5)); \
	done && \
	$COMPOSE run --rm worker python -m app.ingestion route-reference"
STATUS=$?
set -e
case "$STATUS" in
0) ;;
10 | 11)
	cat >&2 <<'MSG'
Aviso: no se recalculó la escala de riesgo de rutas porque OSRM no está listo
en el servidor. Los datos del paso 3 ya quedaron cargados. Sube los datos con
preparar_osrm.sh --subir, levanta el servicio osrm (sección 15 del README de
despliegue) y vuelve a ejecutar este script. Mientras no haya escala, las
rutas se muestran sin puntaje (nunca un puntaje inventado).
MSG
	;;
12)
	cat >&2 <<MSG
Error: los datos del paso 3 ya quedaron cargados, pero el servicio osrm no
quedó listo en $OSRM_WAIT_S segundos, así que no se recalculó la escala de
riesgo de rutas. Revisa el servicio en el servidor («$COMPOSE ps osrm» y
«$COMPOSE logs osrm») y vuelve a ejecutar este script. Se sigue usando la
escala anterior, si existe.
MSG
	exit 1
	;;
*)
	cat >&2 <<MSG
Error: la actualización de datos (paso 3) terminó bien, pero falló el cálculo
de la escala de riesgo de rutas (código de salida $STATUS). Revisa el mensaje
de arriba y vuelve a ejecutar el script. Se sigue usando la escala anterior,
si existe.
MSG
	exit 1
	;;
esac

echo "Listo."

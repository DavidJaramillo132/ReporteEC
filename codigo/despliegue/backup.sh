#!/usr/bin/env bash
# Daily pg_dump backup of the production database, run from the VPS host
# (not inside a container) against the running `postgres` service. See
# despliegue/README.md "Respaldos" for the systemd timer/cron line and the
# restore procedure.
#
# Usage: ./backup.sh
# Env overrides: BACKUP_DIR (default /var/backups/reporteec), KEEP_DAYS
# (default 14), COMPOSE_PROJECT_DIR (default: this script's directory).

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/reporteec}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
COMPOSE_FILE="${COMPOSE_PROJECT_DIR}/compose.prod.yml"
ENV_FILE="${COMPOSE_PROJECT_DIR}/.env"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="${BACKUP_DIR}/reporteec_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

compose() {
	docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

# $POSTGRES_USER/$POSTGRES_DB are read inside the container from its own
# environment (see compose.prod.yml's postgres service), so this never has
# to duplicate -- and risk drifting from -- the project's .env.
if ! compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"${DEST}"; then
	echo "backup.sh: pg_dump failed, removing partial file ${DEST}" >&2
	rm -f "${DEST}"
	exit 1
fi

echo "backup.sh: wrote ${DEST}"

# Keep only the last KEEP_DAYS days of backups.
find "${BACKUP_DIR}" -name 'reporteec_*.dump' -mtime "+${KEEP_DAYS}" -print -delete

exit 0

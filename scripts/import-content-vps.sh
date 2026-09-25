#!/usr/bin/env bash
#
# Carga simplificada de cursos en el VPS de producción.
#
#   ./scripts/import-content-vps.sh                  # vista previa (dry-run, sin DB)
#   ./scripts/import-content-vps.sh --plan [...]     # planificación con lecturas de la DB
#   ./scripts/import-content-vps.sh --apply [...]    # backup + aplicación real
#
# Flags del importador que se reenvían tal cual: --fill-missing --publish-ready.
# Como los cursos aún no fueron importados, --apply ejecuta el pipeline
# completo (importar + completar vacíos + publicar los listos) en una sola
# invocación; en una base vacía el paso de completar no tiene efecto.
# El JSON se monta como archivo de solo lectura dentro del contenedor api de la
# release activa (/srv/apps/codequest/current) usando SU imagen, sin recompilar.
# Nunca muestra secretos, nunca ejecuta migraciones.
set -euo pipefail

RELEASE_DIR="${RELEASE_DIR:-/srv/apps/codequest/current}"
ENV_FILE="${CODEQUEST_ENV_FILE:-/srv/apps/codequest/.env}"
COMPOSE_FILE="compose.traefik.yml"
JSON_HOST="${JSON_HOST:-COURSES.enriched.json}"
JSON_CONTAINER="/tmp/courses-import.json"

usage() {
  cat <<USAGE
Uso: $(basename "$0") [--plan|--apply] [--json PATH]

  Sin flags: vista previa sin conexión a la DB (dry-run).
  --plan:    planificación con consultas de solo lectura (no escribe).
  --apply:   backup con pg_dump verificado y pipeline completo
             (importar + completar vacíos + publicar los listos).
  --json:    archivo de cursos en el host (defecto: COURSES.enriched.json).

Variables: RELEASE_DIR (defecto $RELEASE_DIR), CODEQUEST_ENV_FILE (defecto $ENV_FILE).
USAGE
}

MODE="dry-run"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) MODE="plan"; shift ;;
    --apply) MODE="apply"; shift ;;
    --json) JSON_HOST="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Flag desconocido: $1" >&2; usage; exit 2 ;;
  esac
done

cd "$RELEASE_DIR"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "No se encontró $COMPOSE_FILE en $RELEASE_DIR. ¿RELEASE_DIR apunta a la release activa?" >&2
  exit 1
fi
if [[ ! -f "$JSON_HOST" && ! -f "$(dirname "$0")/../$JSON_HOST" ]]; then
  echo "No se encontró el JSON: $JSON_HOST" >&2
  exit 1
fi
[[ -f "$JSON_HOST" ]] || JSON_HOST="$(dirname "$0")/../$JSON_HOST"
# Docker trata una ruta relativa en -v como volumen nombrado (crea un
# directorio vacío) en vez de un bind-mount. Canonicalizar a absoluta.
if command -v realpath >/dev/null 2>&1; then
  JSON_HOST="$(realpath "$JSON_HOST")"
else
  JSON_HOST="$(readlink -f "$JSON_HOST")"
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
MOUNT_ARGS=(-v "$JSON_HOST:$JSON_CONTAINER:ro")

echo "== OPENAI_API_KEY (solo presencia, el valor nunca se muestra) =="
if "${compose[@]}" run --rm --no-deps api sh -c 'test -n "${OPENAI_API_KEY:-}"'; then
  echo "OPENAI_API_KEY: presente"
else
  echo "OPENAI_API_KEY: AUSENTE (la generación de roadmaps con IA responderá 503)"
fi

if [[ "$MODE" == "dry-run" ]]; then
  echo "== Vista previa sin DB (dry-run) =="
  "${compose[@]}" run --rm --no-deps "${MOUNT_ARGS[@]}" api node dist/seed/content/import-content.js \
    "$JSON_CONTAINER"
  exit 0
fi

echo "== Migraciones pendientes (frena si hay) =="
SHOW_OUTPUT="$("${compose[@]}" run --rm --no-deps api node node_modules/typeorm/cli.js migration:show -d dist/config/typeorm.js 2>&1)"
echo "$SHOW_OUTPUT"
if echo "$SHOW_OUTPUT" | grep -q '^\[ \]'; then
  echo "Hay migraciones pendientes. Aplicarlas con el procedimiento de despliegue" >&2
  echo "(backup + migration:run + verificación) antes de importar. Importación detenida." >&2
  exit 1
fi

if [[ "$MODE" == "plan" ]]; then
  echo "== Planificación de solo lectura (no escribe) =="
  "${compose[@]}" run --rm "${MOUNT_ARGS[@]}" api node dist/seed/content/import-content.js \
    "$JSON_CONTAINER" --plan --fill-missing --publish-ready
  exit 0
fi

echo "== Backup pre-escritura (permisos restringidos) =="
umask 077
BACKUP="/srv/apps/codequest/backup-$(date +%Y%m%d-%H%M%S).dump"
if ! "${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP"; then
  echo "pg_dump falló. Importación detenida, no se escribió nada." >&2
  exit 1
fi
if [[ ! -s "$BACKUP" ]]; then
  echo "Backup vacío ($BACKUP). Importación detenida." >&2
  exit 1
fi
if ! "${compose[@]}" exec -T postgres sh -c 'pg_restore --list' < "$BACKUP" > /dev/null; then
  echo "pg_restore --list no pudo leer el backup ($BACKUP). Importación detenida." >&2
  exit 1
fi
echo "Backup verificado: $BACKUP"

echo "== Aplicación real: importar + completar + publicar listos =="
"${compose[@]}" run --rm "${MOUNT_ARGS[@]}" api node dist/seed/content/import-content.js \
  "$JSON_CONTAINER" --apply --fill-missing --publish-ready

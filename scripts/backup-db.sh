#!/usr/bin/env bash
# Respaldo de la base de datos SQL Server de HotelSuite (contenedor docker).
# Uso: ./scripts/backup-db.sh   (define MSSQL_SA_PASSWORD en el entorno o .env)
set -euo pipefail

CONTAINER="${DB_CONTAINER:-hotelsuite-db-prod}"
DB_NAME="${DB_NAME:-hotelsuite}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BAK="/var/opt/mssql/backup_${DB_NAME}_${STAMP}.bak"

mkdir -p "${BACKUP_DIR}"

echo "Creando backup de ${DB_NAME} en el contenedor ${CONTAINER}..."
docker exec "${CONTAINER}" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa \
  -P "${MSSQL_SA_PASSWORD}" -No \
  -Q "BACKUP DATABASE [${DB_NAME}] TO DISK = N'${BAK}' WITH INIT, COMPRESSION, STATS = 10"

echo "Copiando backup al host (${BACKUP_DIR})..."
docker cp "${CONTAINER}:${BAK}" "${BACKUP_DIR}/"

echo "Backup completo: ${BACKUP_DIR}/$(basename "${BAK}")"
# Sugerencia: programar con cron (ej. diario 03:00):
#   0 3 * * * /ruta/scripts/backup-db.sh >> /var/log/hotelsuite-backup.log 2>&1

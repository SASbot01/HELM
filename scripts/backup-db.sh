#!/usr/bin/env bash
# HELM — copia diaria de la base de datos.
#
# La base de producción es la Supabase local (contenedor supabase_db_apexallinone):
# no hay otra copia en ningún sitio. Esto la vuelca cada noche, comprueba que el
# volcado tiene datos de verdad y guarda los últimos 14 días. Con ella van los
# archivos del bucket (facturas, documentos, logos), que no están en la base.
#
# Las copias se guardan cifradas (AES-256, gpg) con la clave de
# /home/s4sf/.helm-backup.key. Esa clave hay que tenerla apuntada FUERA de esta
# máquina: sin ella las copias no se abren. Para abrir una:
#   gpg --batch --pinentry-mode loopback --passphrase-file ~/.helm-backup.key \
#       -d helm-AAAAMMDD-HHMM.sql.gz.gpg | gunzip > volcado.sql
# Si el fichero de la clave no existe, la copia se hace igual, sin cifrar, y el
# log lo avisa: una copia sin cifrar es mejor que ninguna.
#
# Para probar que una copia se puede restaurar: scripts/restore-test.sh
#
# Lo lanza el crontab de root a las 03:00. Para ver cómo ha ido:
#   tail /home/s4sf/helm-backups/db/backup.log
#
# Se usa el pg_dump del contenedor y no el del sistema: el del sistema es la 16
# y la base la 17, y falla por versión.
set -euo pipefail

DIR=${HELM_BACKUP_DB_DIR:-/home/s4sf/helm-backups/db}
DIAS=14
# Las copias que se hacen al borrar un perfil (api/perfiles.js) llevan todos
# sus datos: pasado este plazo ya no se va a deshacer el borrado, y se van.
DIR_PERFILES=${HELM_BACKUP_DIR:-/home/s4sf/helm-copias}
DIAS_PERFILES=30
CONTENEDOR=supabase_db_apexallinone
CONTENEDOR_ARCHIVOS=supabase_storage_apexallinone
CLAVE=${HELM_BACKUP_KEY:-/home/s4sf/.helm-backup.key}
SELLO=$(date +%Y%m%d-%H%M)
F="$DIR/helm-$SELLO.sql.gz"
A="$DIR/helm-archivos-$SELLO.tar.gz"
PSQL="docker exec $CONTENEDOR psql -U postgres -d postgres -At -c"

mkdir -p "$DIR"
log() { echo "[$(date '+%F %T')] $*" >> "$DIR/backup.log"; }

# Deja $1 cifrado en $1.gpg y quita el original. Sin clave, lo deja como está.
# Escribe en FINAL el nombre con el que ha quedado.
GNUPGHOME=$(mktemp -d); export GNUPGHOME
trap 'rm -rf "$GNUPGHOME"' EXIT
cifra() {
  FINAL=$1
  if [ ! -s "$CLAVE" ]; then log "AVISO: no hay clave en $CLAVE, $(basename "$1") queda SIN CIFRAR"; return 0; fi
  if ! gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$CLAVE" \
        --symmetric --cipher-algo AES256 -o "$1.gpg" "$1"; then
    log "ERROR: no se pudo cifrar $(basename "$1"), queda SIN CIFRAR"; rm -f "$1.gpg"; return 0
  fi
  rm -f "$1"; chmod 600 "$1.gpg"; FINAL=$1.gpg
}

if ! docker exec "$CONTENEDOR" pg_dump -U postgres -d postgres | gzip > "$F.tmp"; then
  log "ERROR: pg_dump ha fallado"
  rm -f "$F.tmp"; exit 1
fi

# Que el archivo exista no basta: se comprueba que trae los perfiles y los
# contactos que hay ahora mismo en la base.
# (zcat || true): awk corta al llegar a la tabla y zcat muere por la tubería
# rota, que con pipefail contaría como fallo.
cuenta() { (zcat "$F.tmp" || true) | awk -v T="COPY public.$1 " 'index($0,T)==1{f=1;next} f&&/^\\\./{exit} f' | wc -l; }
for t in clients crm_contacts agent_reels; do
  en_copia=$(cuenta "$t"); en_base=$($PSQL "select count(*) from public.$t")
  if [ "$en_copia" != "$en_base" ] || [ "$en_base" = "0" ]; then
    log "ERROR: la copia no cuadra en $t (copia=$en_copia, base=$en_base)"
    rm -f "$F.tmp"; exit 1
  fi
done

mv "$F.tmp" "$F"
chmod 600 "$F"
cifra "$F"
log "OK $(basename "$FINAL") $(du -h "$FINAL" | cut -f1)"

# Los archivos del bucket. Si esto falla, la copia de la base ya está hecha.
if docker exec "$CONTENEDOR_ARCHIVOS" tar -C /mnt -czf - . > "$A.tmp" && [ -s "$A.tmp" ]; then
  mv "$A.tmp" "$A"
  chmod 600 "$A"
  cifra "$A"
  log "OK $(basename "$FINAL") $(du -h "$FINAL" | cut -f1)"
else
  log "ERROR: no se pudieron copiar los archivos del bucket"
  rm -f "$A.tmp"
fi

# Las de más de 14 días se van. Las hechas a mano antes de algo delicado
# ("antes-de-…") se quedan: son las que uno busca cuando algo sale mal.
find "$DIR" -name 'helm-archivos-*.tar.gz*' -mtime +$DIAS -delete
find "$DIR" -name 'helm-*.sql.gz*' ! -name '*antes-de*' -mtime +$DIAS -delete

# Las copias de perfiles borrados caducan.
if [ -d "$DIR_PERFILES" ]; then
  find "$DIR_PERFILES" -mindepth 1 -maxdepth 1 -type d -mtime +$DIAS_PERFILES -print0 |
    while IFS= read -r -d '' d; do rm -rf "$d"; log "caducada la copia del perfil $(basename "$d")"; done
fi

#!/usr/bin/env bash
# HELM — prueba de restauración: ¿la copia de anoche se puede abrir y cargar?
#
# Una copia que nunca se ha restaurado no se sabe si sirve. Esto coge una copia
# (la última, o la que se le pase), la descifra, la carga en un Postgres vacío
# que arranca solo para la prueba y cuenta las filas de las tablas clave. No
# toca la base de verdad: el contenedor de prueba no publica ningún puerto y se
# borra al acabar.
#
#   scripts/restore-test.sh                      → la última copia
#   scripts/restore-test.sh ruta/a/helm-….sql.gz.gpg
#
# Las copias son de root: lanzarlo con sudo si se prueba una de las diarias.
set -euo pipefail

DIR=${HELM_BACKUP_DB_DIR:-/home/s4sf/helm-backups/db}
CLAVE=${HELM_BACKUP_KEY:-/home/s4sf/.helm-backup.key}
ORIGEN=supabase_db_apexallinone
PRUEBA=helm_restore_test
F=${1:-$(ls -t "$DIR"/helm-2*.sql.gz* 2>/dev/null | head -1)}
[ -n "$F" ] && [ -f "$F" ] || { echo "No hay ninguna copia que probar en $DIR"; exit 1; }
echo "Copia: $F"

GNUPGHOME=$(mktemp -d); export GNUPGHOME
limpia() { docker rm -f "$PRUEBA" >/dev/null 2>&1 || true; rm -rf "$GNUPGHOME"; }
trap limpia EXIT

abre() {
  case "$F" in
    *.gpg) gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$CLAVE" -d "$F" | gunzip ;;
    *)     gunzip -c "$F" ;;
  esac
}

# La misma imagen que la base de verdad: trae los roles y extensiones que el
# volcado da por hechos.
IMAGEN=$(docker inspect "$ORIGEN" --format '{{.Config.Image}}')
docker rm -f "$PRUEBA" >/dev/null 2>&1 || true
docker run -d --name "$PRUEBA" --network none -e POSTGRES_PASSWORD=prueba "$IMAGEN" >/dev/null
echo -n "Arrancando un Postgres vacío"
# La imagen arranca Postgres dos veces: una para prepararse y otra de verdad.
# Hasta que no avisa de que ha terminado la primera, no se le carga nada.
for _ in $(seq 90); do
  docker logs "$PRUEBA" 2>&1 | grep -q 'init process complete' &&
    docker exec "$PRUEBA" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && break
  echo -n .; sleep 2
done; echo

# Los esquemas de Supabase (auth, storage…) ya existen en la imagen y dan
# errores de «ya existe» al cargar: no importan. Lo que se comprueba es que los
# datos de HELM (esquema public) llegan enteros.
abre | docker exec -i "$PRUEBA" psql -U postgres -d postgres -q >/dev/null 2>"$GNUPGHOME/errores.log" || true

en_copia() { abre | awk -v T="COPY public.$1 " 'index($0,T)==1{f=1;next} f&&/^\\\./{exit} f' | wc -l || true; }
mal=0
for t in clients crm_contacts helm_form_responses team agent_reels; do
  c=$(en_copia "$t")
  r=$(docker exec "$PRUEBA" psql -U postgres -d postgres -Atc "select count(*) from public.$t" 2>/dev/null || echo "no existe")
  if [ "$c" = "$r" ] && [ "$r" != "0" ]; then echo "  ok   $t: $r filas"; else echo "  MAL  $t: copia=$c restaurado=$r"; mal=1; fi
done
tablas=$(docker exec "$PRUEBA" psql -U postgres -d postgres -Atc "select count(*) from pg_tables where schemaname='public'")
echo "Tablas restauradas en public: $tablas"
[ "$mal" = 0 ] && echo "RESTAURACIÓN CORRECTA" || { echo "LA RESTAURACIÓN HA FALLADO"; exit 1; }

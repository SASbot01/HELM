#!/bin/bash
# Despliegue de la reforma de agencias y créditos (migraciones 097 y 098).
#
# Va por fases porque el orden importa:
#   1. copia de la base
#   2. 097 (agencias, créditos)          — no rompe nada: solo añade
#   3. reinicio de helm-api y helm-agents — código nuevo + puerta /api/db
#   4. frontend nuevo con swap atómico     — ver la memoria de dist/ en vivo
#   5. reinicio de helm-web               — sb-proxy deja pasar las subidas firmadas
#   6. 098 (cierra la clave pública)       — SOLO tras comprobar que el panel va
#      099 (fuera 148 tablas muertas), 100 (fuera la columna de contraseñas en
#      claro) y 101 (eventos de Stripe sin duplicar), con su propia copia antes
#
#   ./scripts/desplegar-agencias.sh hasta-web   → fases 1 a 5
#   ./scripts/desplegar-agencias.sh cerrar      → fase 6
set -euo pipefail
cd /home/s4sf/helm
PG="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

if [ "${1:-}" = "hasta-web" ]; then
  F=/home/s4sf/helm-backups/db/helm-$(date +%Y%m%d-%H%M)-antes-de-desplegar-agencias.sql.gz
  docker exec supabase_db_apexallinone pg_dump -U postgres -d postgres | gzip > "$F"
  echo "copia: $F ($(zcat "$F" | grep -c '^COPY ') tablas)"

  psql "$PG" -v ON_ERROR_STOP=1 -q -f migrations/097_helm_agencias.sql
  echo "097 aplicada"

  systemctl restart helm-api.service helm-agents.service
  sleep 2
  curl -fsS "localhost:5182/api/creditos?action=packs" >/dev/null && echo "api ok"

  rm -rf .dist-nuevo
  npx vite build --outDir .dist-nuevo --emptyOutDir >/dev/null
  cp -a .dist-nuevo/assets/. dist/assets/
  for f in .dist-nuevo/*; do [ "$(basename "$f")" = assets ] || [ "$(basename "$f")" = index.html ] || cp -a "$f" dist/; done
  cp .dist-nuevo/index.html dist/index.html.nuevo && mv dist/index.html.nuevo dist/index.html
  echo "frontend nuevo en dist/"

  systemctl restart helm-web.service
  echo "helm-web reiniciado"
elif [ "${1:-}" = "cerrar" ]; then
  F=/home/s4sf/helm-backups/db/helm-$(date +%Y%m%d-%H%M)-antes-de-cerrar.sql.gz
  docker exec supabase_db_apexallinone pg_dump -U postgres -d postgres | gzip > "$F"
  echo "copia: $F ($(zcat "$F" | grep -c '^COPY ') tablas)"
  for m in 098_cerrar_clave_publica 099_fuera_tablas_muertas 100_fuera_password_en_claro 101_stripe_eventos; do
    psql "$PG" -v ON_ERROR_STOP=1 -q -f "migrations/$m.sql"
    echo "$m aplicada"
  done
  systemctl restart helm-api.service
  echo "helm-api reiniciado"
else
  echo "uso: $0 hasta-web | cerrar"; exit 1
fi

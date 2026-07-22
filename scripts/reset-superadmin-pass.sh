#!/bin/bash
# Cambia la contraseña de cuentas de `superadmins` en la Supabase local.
#
#   bash scripts/reset-superadmin-pass.sh 'MiClave'                    → todas las activas
#   bash scripts/reset-superadmin-pass.sh 'MiClave' silvestre@apex.local → solo esa cuenta
#
# Solo toca la base local (localhost:54321), nunca producción.
set -euo pipefail

NEW="${1:-}"
EMAIL="${2:-}"
if [ -z "$NEW" ]; then
  echo "uso: bash scripts/reset-superadmin-pass.sh 'MiClave' [email]" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="$(grep '^VITE_SUPABASE_ANON_KEY=' "$HERE/.env" | cut -d= -f2-)"

if [ -n "$EMAIL" ]; then
  FILTER="email=eq.$EMAIL"
else
  FILTER="active=eq.true"
fi

curl -s -X PATCH "http://localhost:54321/rest/v1/superadmins?$FILTER" \
  -H "apikey: $KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"password\":\"$NEW\"}" | python3 -c "
import json,sys
rows = json.load(sys.stdin)
if not rows:
    print('ninguna cuenta coincide con el filtro'); raise SystemExit(1)
for r in rows:
    print('actualizado:', r.get('email'))
"

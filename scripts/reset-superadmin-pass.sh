#!/bin/bash
# Resetea la contraseña de las cuentas activas de `superadmins` en la Supabase
# local. Uso:  bash scripts/reset-superadmin-pass.sh 'MiClaveNueva'
#
# Solo toca la DB local (localhost:54321), nunca producción.
set -euo pipefail

NEW="${1:-}"
if [ -z "$NEW" ]; then
  echo "uso: bash scripts/reset-superadmin-pass.sh 'MiClaveNueva'" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="$(grep '^VITE_SUPABASE_ANON_KEY=' "$HERE/.env" | cut -d= -f2-)"

curl -s -X PATCH "http://localhost:54321/rest/v1/superadmins?active=eq.true" \
  -H "apikey: $KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"password\":\"$NEW\"}" | python3 -c "
import json,sys
rows = json.load(sys.stdin)
for r in rows:
    print('actualizado:', r.get('email'))
"

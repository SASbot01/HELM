import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables')
}

export const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '')

// Mapeo de columnas snake_case (DB) → camelCase (app). Solo queda el de
// `superadmins`, que es la única tabla que toca api/admin.js (login/verify).
const SUPERADMINS_REVERSE_MAP = {
  created_at: 'createdAt',
}

const TABLE_REVERSE_MAPS = {
  superadmins: SUPERADMINS_REVERSE_MAP,
}

export function toAppFormat(row, table) {
  const reverseMap = TABLE_REVERSE_MAPS[table] || {}
  const result = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'created_at') continue
    const appKey = reverseMap[key] || key
    result[appKey] = value
  }
  return result
}

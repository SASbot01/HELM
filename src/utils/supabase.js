import { createClient } from '@supabase/supabase-js'

// Cliente Supabase del frontend. Helm (src/helm/lib.js) lee y escribe con él
// directamente usando la anon key.
//
// VITE_SUPABASE_URL admite dos formas:
//   - absoluta  → https://mi-proyecto.supabase.co   (producción)
//   - relativa  → /sb                                (self-host: la Supabase
//     local se sirve por el mismo origen que la app vía proxy). Se resuelve
//     contra window.location.origin en runtime, así el bundle funciona en
//     cualquier host —túnel, IP de Tailscale o dominio— sin recompilar.
const raw = import.meta.env.VITE_SUPABASE_URL || '/sb'
const supabaseUrl = raw.startsWith('/') ? `${window.location.origin}${raw}` : raw

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY)

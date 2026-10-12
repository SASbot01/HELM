import { createClient } from '@supabase/supabase-js'

// Cliente Supabase del panel. Helm (src/helm/lib.js) lee y escribe con él
// directamente, pero ya no con la clave pública contra la base: habla con
// /api/db (api/_lib/pasarela.js), que comprueba la sesión del login y recorta
// cada petición a los perfiles de tu agencia. La clave pública ya no abre
// ninguna tabla; las páginas públicas van por endpoints del servidor.
//
// supabase-js exige una clave al crearse: se le pasa la pública, que aquí no
// abre nada. Lo que cuenta es `accessToken`, que viaja como
// `Authorization: Bearer <sesión>` en cada petición.
const supabaseUrl = `${window.location.origin}/api/db`

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY || 'panel', {
  accessToken: async () => localStorage.getItem('bw_admin_jwt') || '',
})

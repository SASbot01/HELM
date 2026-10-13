// El único camino de las landings propias hacia el CRM: api/leads.js.
//
// Antes cada página escribía en las tablas con la clave pública de Supabase.
// Ahora ninguna toca la base: le piden al servidor una acción concreta y este
// decide qué se guarda. Lo que vuelve como `id` es una ficha firmada por el
// servidor: solo sirve para devolvérsela en el paso siguiente.
//
// `base` es para las páginas que no viven en este servidor (la comunidad de
// Detrás de Cámara en detrasdecamara.org/map): la URL de HELM delante.
export async function pideLead(action, body, base = '') {
  const r = await fetch(`${base}/api/leads?action=${action}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'No he podido guardarte. Prueba en un minuto.')
  return d
}

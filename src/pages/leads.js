// El único camino de las landings propias hacia el CRM: api/leads.js.
//
// Antes cada página escribía en las tablas con la clave pública de Supabase.
// Ahora ninguna toca la base: le piden al servidor una acción concreta y este
// decide qué se guarda. Lo que vuelve como `id` es una ficha firmada por el
// servidor: solo sirve para devolvérsela en el paso siguiente.
export async function pideLead(action, body) {
  const r = await fetch(`/api/leads?action=${action}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'No he podido guardarte. Prueba en un minuto.')
  return d
}

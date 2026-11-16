// Pone el horario de agendas de En Forma con Hugo: de lunes a viernes, de 10 a 14
// y de 16 a 20 (hora de España). Lo pidió Hugo el 16-nov-2026.
//
// La plantilla vive en user_integrations (service=google) del perfil, en
// config.agenda, y no hay pantalla para editarla. Se lanza en el minipc, primero
// en prueba (enseña el antes y el después sin escribir) y luego de verdad:
//
//   ssh minipc-ts "cd /home/s4sf/helm && node --env-file=.env.server --input-type=module - --prueba" < scripts/agenda-horario-hugo.mjs
//   ssh minipc-ts "cd /home/s4sf/helm && node --env-file=.env.server --input-type=module -" < scripts/agenda-horario-hugo.mjs
//
// desde/hasta (10–20) quedan puestos para el código anterior a las franjas: con
// ese código, la landing ya tacha de 14 a 16 por su cuenta. Con el código nuevo
// mandan las franjas, y HELM rechaza cualquier reserva fuera de ellas.
//
// Después, comprobar que https://helm.s4sf.net/api/agenda?slug=enformaconhugo
// da horas de 16:00 a 19:30. Si no salen, puede que un refresco del token de
// Google haya pisado la config a la vez: se vuelve a lanzar.
import { supabase } from './api/lib/supabase.js'

const prueba = process.argv.includes('--prueba')

const { data: perfil, error: e1 } = await supabase
  .from('clients').select('id').eq('slug', 'enformaconhugo').maybeSingle()
if (e1 || !perfil) throw new Error('No encuentro el perfil enformaconhugo: ' + (e1?.message || 'no existe'))

const { data: fila, error: e2 } = await supabase
  .from('user_integrations').select('id, config')
  .eq('client_id', perfil.id).eq('service', 'google').is('member_id', null)
  .maybeSingle()
if (e2 || !fila) throw new Error('El perfil no tiene Google conectado: ' + (e2?.message || 'sin fila'))

const antes = fila.config?.agenda || null
const agenda = {
  ...(antes || {}),
  dias: [1, 2, 3, 4, 5],
  desde: '10:00',
  hasta: '20:00',
  franjas: [{ desde: '10:00', hasta: '14:00' }, { desde: '16:00', hasta: '20:00' }],
}

// Solo la agenda: nada de tokens ni del correo de la cuenta.
console.log('antes:  ', JSON.stringify(antes))
console.log('después:', JSON.stringify(agenda))
if (prueba) {
  console.log('(prueba: no se ha escrito nada)')
  process.exit(0)
}

const { error: e3 } = await supabase.from('user_integrations')
  .update({ config: { ...fila.config, agenda }, updated_at: new Date().toISOString() })
  .eq('id', fila.id)
if (e3) throw new Error('No se pudo guardar: ' + e3.message)
console.log('Guardado.')

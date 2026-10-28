// HELM — Atención (asesorías) · Documentación: perseguir los papeles antes de
// que venza el plazo, sin perseguir a nadie a mano.
//
// Qué hace en cada pasada por el perfil:
//   · Mira los vencimientos fiscales de los próximos 15 días que siguen
//     esperando documentación del cliente (helm_fiscal_obligaciones en estado
//     'pendiente_docs').
//   · Agrupa por cliente y propone UN recordatorio por cliente, con los modelos
//     y su fecha, el WhatsApp del cliente y SU enlace de subida (el mismo que da
//     el panel en Fiscal: /d/<token>, un JWT 'docs' por contacto, ver
//     api/documentos.js). Lo manda el asesor desde su móvil (sin herramienta).
//
// Si el perfil no lleva Fiscal, no hay vencimientos y no hace nada.
//
// Datos que usa: helm_fiscal_obligaciones (modelo, periodo, fecha_limite,
// estado, contact_id) y crm_contacts (name, phone). No llama a la IA.
import { tokenDe } from '../../documentos.js'

const DIA = 86_400_000
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

// La URL pública de HELM, igual que api/onboarding.js para el /alta.
const BASE = () => (process.env.HELM_PUBLIC_URL || 'https://helm.s4sf.net').trim().replace(/\/$/, '')

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || ''
const seCreo = (r) => Boolean(r) && r.creada !== false
// 'YYYY-MM-DD' → 'DD/MM/YYYY' para leerlo en el mensaje.
const fechaES = (s) => {
  const [a, m, d] = String(s || '').split('-')
  return a && m && d ? `${d}/${m}/${a}` : String(s || '')
}

function mensajeRecordatorio({ nombre, negocio, obligaciones, enlace }) {
  const hola = nombre ? `Hola ${nombre}:` : 'Hola:'
  const lista = obligaciones
    .map(o => `el modelo ${o.modelo} (${o.periodo}), que vence el ${fechaES(o.fecha_limite)}`)
    .join('; ')
  return [
    `${hola} se acerca ${lista}.`,
    `Para poder presentarlo a tiempo necesitamos tu documentación.`,
    `Puedes subirla aquí: ${enlace}`,
    `Gracias. — ${negocio}`,
  ].join('\n')
}

export default {
  key: 'documentacion',
  departamento: 'atencion',

  async corre(ctx) {
    const { supabase, clientId, perfil, hoy } = ctx
    const hoyStr = fmtDia.format(hoy)
    const hastaStr = fmtDia.format(new Date(hoy.getTime() + 15 * DIA))

    // Lo que vence en los próximos 15 días y sigue esperando papeles del cliente.
    const { data: obls, error } = await supabase.from('helm_fiscal_obligaciones')
      .select('id, contact_id, modelo, periodo, fecha_limite, estado')
      .eq('client_id', clientId)
      .eq('estado', 'pendiente_docs')
      .gte('fecha_limite', hoyStr)
      .lte('fecha_limite', hastaStr)
      .order('fecha_limite', { ascending: true })
      .limit(500)
    if (error) throw error
    if (!obls?.length) return { propuestas: 0, resumen: '' }

    // Los contactos implicados, de una vez.
    const ids = [...new Set(obls.map(o => o.contact_id).filter(Boolean))]
    const { data: contactos, error: e2 } = await supabase.from('crm_contacts')
      .select('id, name, phone').eq('client_id', clientId).in('id', ids)
    if (e2) throw e2
    const porId = new Map((contactos || []).map(c => [c.id, c]))

    // Agrupadas por cliente, en orden de vencimiento.
    const porContacto = new Map()
    for (const o of obls) {
      if (!o.contact_id) continue
      if (!porContacto.has(o.contact_id)) porContacto.set(o.contact_id, [])
      porContacto.get(o.contact_id).push(o)
    }

    const negocio = perfil.name || perfil.slug || 'tu asesoría'
    let propuestas = 0
    for (const [contactId, lista] of porContacto) {
      const c = porId.get(contactId)
      if (!c) continue
      const token = await tokenDe(clientId, contactId)
      const enlace = `${BASE()}/d/${token}`
      const mensaje = mensajeRecordatorio({
        nombre: primerNombre(c.name), negocio, obligaciones: lista, enlace,
      })
      const modelos = lista.map(o => o.modelo).join(', ')
      const r = await ctx.proponer({
        // Por la fecha más próxima: un recordatorio por ronda de plazos, sin repetir.
        clave: `documentacion:${contactId}:${lista[0].fecha_limite}`,
        titulo: `Pedir documentación a ${c.name || 'un cliente'} (${modelos})`,
        porque: `Le vence ${modelos} en los próximos 15 días y aún no ha mandado la documentación.`,
        mensaje,
        telefono: c.phone || null,
        datos: { contacto: contactId, modelos, vence: lista[0].fecha_limite },
      })
      if (seCreo(r)) propuestas += 1
    }

    ctx.log?.(`documentacion ${hoyStr}: ${propuestas} recordatorios`)
    return { propuestas, resumen: propuestas ? `${propuestas} recordatorio(s) de documentación propuestos.` : '' }
  },
}

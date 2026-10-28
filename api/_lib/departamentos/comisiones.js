// HELM — las comisiones del departamento de Finanzas.
//
// Una vez al mes calcula lo que toca pagarle a cada setter y closer del equipo
// (helm_team) sobre lo que SE HA COBRADO de verdad —no lo vendido— en el mes, y
// deja una propuesta por persona con la escritura finanzas_apunte para que, al
// aprobar, se apunte el gasto de comisión en Finanzas. Es dinero, así que nunca
// lo apunta solo: lo propone.
//
// El mes que se liquida es el ANTERIOR ya cerrado (config.mes 'AAAA-MM' lo
// fuerza): así la cifra es la definitiva. La clave lleva el mes y la persona,
// de modo que no se propone dos veces la misma comisión.
//
// El porcentaje se busca en este orden:
//   1. helm_team.commission_pct de la persona (donde lo guarda el panel).
//   2. ctx.config.porcentajes[rol] (p. ej. { closer: 10, setter: 5 }).
//   3. Si no hay ninguno, esa persona no entra y se dice en el resumen.
//
// La base («lo cobrado en el mes») es el cash_collected de las ventas de ese mes
// que esa persona cerró (closer) o abrió (setter), sin las canceladas. Es lo que
// permite el esquema (sales.closer / sales.setter son el NOMBRE); va dicho en el
// porqué de cada propuesta.

// ── Cálculo puro (el mes es el de Madrid, como api/_lib/bot/comun.js) ────────
const fmtMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoyMadrid = (d = new Date()) => fmtMadrid.format(d)
const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100
const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(redondea(n))} €`
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'

// El mes anterior (y sus bordes) a partir del 'AAAA-MM-DD' de hoy en Madrid.
function mesAnterior(hoyISO) {
  const [y, m] = hoyISO.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))   // m es 1-based; m-2 = mes anterior
  const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return { mes, inicio: `${mes}-01`, fin }
}
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/
function bordesDeMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { mes, inicio: `${mes}-01`, fin }
}

// Roles que cobran comisión por venta.
const ROLES_COMISION = ['setter', 'closer']

export default {
  key: 'comisiones',
  departamento: 'finanzas',

  async corre(ctx) {
    const { supabase, clientId, config = {} } = ctx
    const hoy = hoyMadrid(ctx.hoy || new Date())
    const { mes, inicio, fin } = MES_RE.test(String(config.mes || '')) ? bordesDeMes(config.mes) : mesAnterior(hoy)
    const porConfig = config.porcentajes && typeof config.porcentajes === 'object' ? config.porcentajes : {}

    const [{ data: equipoRaw, error: eT }, { data: ventasRaw, error: eV }] = await Promise.all([
      supabase.from('helm_team').select('id, name, role, commission_pct, active').eq('client_id', clientId).limit(500),
      supabase.from('sales')
        .select('id, date, client_name, revenue, cash_collected, status, closer, setter')
        .eq('client_id', clientId).gte('date', inicio).lte('date', fin).limit(5000),
    ])
    if (eT) throw eT
    if (eV) throw eV

    const equipo = (equipoRaw || []).filter(p => p.active !== false && ROLES_COMISION.includes(String(p.role || '').toLowerCase()))
    const ventas = (ventasRaw || []).filter(v => !cancelada(v))

    if (!equipo.length) return { propuestas: 0, resumen: `Comisiones ${mes}: sin setters ni closers en el equipo.` }

    let propuestas = 0
    let total = 0
    const sinPct = []
    for (const p of equipo) {
      const rol = String(p.role || '').toLowerCase()
      const pct = Number(p.commission_pct) > 0 ? Number(p.commission_pct) : Number(porConfig[rol]) || 0
      if (!(pct > 0)) { sinPct.push(p.name); continue }

      // Lo cobrado en el mes de las ventas que esta persona cerró/abrió.
      const suyas = ventas.filter(v => norm(rol === 'closer' ? v.closer : v.setter) === norm(p.name))
      const base = redondea(suyas.reduce((t, v) => t + (Number(v.cash_collected) || 0), 0))
      const comision = redondea(base * pct / 100)
      if (comision <= 0) continue

      total = redondea(total + comision)
      const r = await ctx.proponer({
        clave: `comisiones:${mes}:${p.id}`,
        titulo: `Comisión de ${p.name} (${rol}) · ${mes}: ${euros(comision)}`,
        porque: `${pct} % sobre ${euros(base)} cobrados en ${suyas.length} venta(s) de ${mes} (lo cobrado, no lo facturado). ` +
          `Al aprobar se apunta como Comisión en Finanzas, para ${p.name}.`,
        herramienta: 'finanzas_apunte',
        input: { tipo: 'comision', importe: comision, persona: p.name, concepto: `Comisión ${mes} · ${rol}`, fecha: fin },
        datos: { tipo: 'comision', persona: p.id, rol, mes, base, pct, comision },
      })
      if (r) propuestas++
    }

    const colaPct = sinPct.length ? ` Sin % definido (no entran): ${sinPct.join(', ')}.` : ''
    const resumen = propuestas
      ? `Comisiones ${mes}: ${propuestas} propuesta(s), ${euros(total)} en total.${colaPct}`
      : `Comisiones ${mes}: nada que pagar${sinPct.length ? '' : ' (sin cobros atribuidos este mes)'}.${colaPct}`
    return { propuestas, resumen }
  },
}

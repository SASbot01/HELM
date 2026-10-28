// Operaciones · el director (api/_lib/departamentos/director.js): el parte del
// día. Dos cosas que probar: que `parteDelDia` arma los bloques con cifras y
// omite los vacíos (y no devuelve nada si no hay nada), y que `corre` agrega lo
// que hay en la base simulada, calcula la cuota prevista de hoy y solo avisa
// cuando hay algo que contar.
import { describe, it, expect, vi } from 'vitest'
import parte, { parteDelDia, diaMadrid } from '../api/_lib/departamentos/director.js'

// Una base en memoria mínima con lo que lee el director: filtros encadenados y
// un await que devuelve las filas que pasan todos los filtros.
function fakeSupabase(tablas = {}) {
  const store = {}
  for (const [k, rows] of Object.entries(tablas)) store[k] = rows.map((r) => ({ client_id: 'c1', ...r }))
  return {
    from(tabla) {
      const filtros = []
      let tope = null
      const q = {
        select() { return q },
        limit(n) { tope = n; return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        gt(c, v) { filtros.push((r) => r[c] != null && r[c] > v); return q },
        gte(c, v) { filtros.push((r) => r[c] != null && r[c] >= v); return q },
        lt(c, v) { filtros.push((r) => r[c] != null && r[c] < v); return q },
        lte(c, v) { filtros.push((r) => r[c] != null && r[c] <= v); return q },
        not(c, op, v) { filtros.push((r) => (op === 'is' && v === null ? r[c] != null : true)); return q },
        then(res, rej) {
          try {
            let out = (store[tabla] || []).filter((r) => filtros.every((f) => f(r)))
            if (tope != null) out = out.slice(0, tope)
            return Promise.resolve({ data: out, error: null }).then(res, rej)
          } catch (e) {
            return Promise.resolve({ data: null, error: e }).then(res, rej)
          }
        },
      }
      return q
    },
  }
}

const HOY = new Date('2026-10-28T06:00:00Z') // miércoles; en Madrid, 28-10-2026

const datosLlenos = () => ({
  perfil: 'Silvestre AI',
  fecha: '2026-10-28',
  entra: { cobros: { n: 2, importe: 390 }, llamadas: 3, leads: 5 },
  vence: { cuotas: { n: 4, importe: 720 }, tareas: 2 },
  atascado: { leads: 6, piezas: 3, propuestas: 1 },
  hecho: { ventas: { n: 2, importe: 500 }, piezas: 1, propuestas: 3 },
  aprobacion: { total: 4, porAgente: [{ agente: 'cobrador', n: 2 }, { agente: 'limpieza-crm', n: 1 }, { agente: 'seguimiento', n: 1 }] },
})

describe('parteDelDia · los cinco bloques', () => {
  it('arma cabecera y los cinco bloques con sus cifras', () => {
    const t = parteDelDia(datosLlenos())
    expect(t).toContain('Silvestre AI')
    expect(t).toContain('2026-10-28')
    expect(t).toContain('📥 Entra hoy')
    expect(t).toContain('2 cobros previstos (390 €)')
    expect(t).toContain('3 llamadas agendadas')
    expect(t).toContain('5 leads nuevos ayer')
    expect(t).toContain('⏳ Vence')
    expect(t).toContain('4 cuotas esta semana (720 €)')
    expect(t).toContain('2 tareas con plazo')
    expect(t).toContain('🚧 Atascado')
    expect(t).toContain('6 leads parados')
    expect(t).toContain('3 piezas de contenido paradas')
    expect(t).toContain('1 propuesta caducada')
    expect(t).toContain('✅ Hecho ayer')
    expect(t).toContain('2 ventas cobradas (500 €)')
    expect(t).toContain('1 pieza publicada')
    expect(t).toContain('3 propuestas aplicadas')
    expect(t).toContain('🟡 Espera tu aprobación: 4')
    expect(t).toContain('cobrador 2 · limpieza-crm 1 · seguimiento 1')
  })

  it('un bloque sin datos no sale; el singular se escribe bien', () => {
    const t = parteDelDia({
      perfil: 'X', fecha: '2026-10-28',
      entra: { cobros: { n: 1, importe: 90 }, llamadas: 0, leads: 0 },
      vence: { cuotas: { n: 0, importe: 0 }, tareas: 0 },
      atascado: { leads: 0, piezas: 0, propuestas: 0 },
      hecho: { ventas: { n: 0, importe: 0 }, piezas: 0, propuestas: 0 },
      aprobacion: { total: 0, porAgente: [] },
    })
    expect(t).toContain('📥 Entra hoy')
    expect(t).toContain('1 cobro previsto (90 €)')
    expect(t).not.toContain('llamada')
    expect(t).not.toContain('⏳ Vence')
    expect(t).not.toContain('🚧 Atascado')
    expect(t).not.toContain('✅ Hecho ayer')
    expect(t).not.toContain('aprobación')
  })

  it('sin nada que contar, no devuelve texto', () => {
    expect(parteDelDia({})).toBe('')
    expect(parteDelDia({ perfil: 'X', fecha: '2026-10-28', entra: { cobros: { n: 0 }, llamadas: 0, leads: 0 } })).toBe('')
  })
})

describe('corre · agrega de la base y solo avisa si hay algo', () => {
  const ctxCon = (tablas, extra = {}) => {
    const avisar = vi.fn(async () => {})
    return {
      ctx: {
        supabase: fakeSupabase(tablas), clientId: 'c1',
        perfil: { id: 'c1', slug: 'silvestre', name: 'Silvestre AI' },
        hoy: HOY, avisar, log: () => {}, proponer: vi.fn(), ...extra,
      },
      avisar,
    }
  }

  it('base vacía: no manda nada y el resumen va vacío', async () => {
    const { ctx, avisar } = ctxCon({})
    const r = await parte.corre(ctx)
    expect(avisar).not.toHaveBeenCalled()
    expect(r).toEqual({ propuestas: 0, resumen: '' })
  })

  it('con datos: cuenta cada bloque, calcula la cuota de hoy y avisa una vez', async () => {
    const tablas = {
      // Un fraccionado al que le toca cuota HOY (alta el día 28, 0 cobradas) y
      // otro cuya próxima cae dentro de la semana (día 30).
      sales: [
        { date: '2026-10-28', plan_start: '2026-10-28', revenue: 600, status: 'activa', installments_total: 6, installments_paid: 0, installment_amount: 100 },
        { date: '2026-09-30', plan_start: '2026-09-30', revenue: 600, status: 'activa', installments_total: 6, installments_paid: 1, installment_amount: 100 },
        // Venta cobrada AYER (entra en «hecho»).
        { date: '2026-10-27', cash_collected: 250, status: 'activa' },
      ],
      helm_calls: [
        { id: 'k1', starts_at: '2026-10-28T10:00:00Z', status: 'agendada' },
        { id: 'k2', starts_at: '2026-10-28T12:00:00Z', status: 'cancelada' },
      ],
      crm_contacts: [
        { id: 'l1', created_at: '2026-10-27T09:00:00Z' }, // lead de ayer
        { id: 'l2', created_at: '2026-10-28T01:00:00Z' }, // de hoy: no cuenta
        { id: 'p1', status: 'lead', last_activity_at: '2026-10-01T00:00:00Z' }, // parado
        { id: 'p2', status: 'won', last_activity_at: '2026-10-01T00:00:00Z' }, // cerrado: no cuenta
      ],
      crm_tasks: [{ id: 't1', completed: false, due_date: '2026-10-29T12:00:00Z' }],
      helm_content_calendar: [
        { id: 'c-parada', status: 'planned', date: '2026-10-20' }, // atascada (fecha pasada)
        { id: 'c-pub', status: 'published', date: '2026-10-27' }, // publicada ayer
      ],
      helm_propuestas: [
        { id: 'pr1', estado: 'caducada', caduca: '2026-10-27T07:00:00Z' },
        { id: 'pr2', estado: 'aplicada', decidida_en: '2026-10-27T18:00:00Z' },
        { id: 'pr3', estado: 'pendiente', agente: 'cobrador', caduca: '2026-10-30T07:00:00Z' },
        { id: 'pr4', estado: 'pendiente', agente: 'cobrador', caduca: '2026-10-30T07:00:00Z' },
        { id: 'pr5', estado: 'pendiente', agente: 'limpieza-crm', caduca: '2026-10-30T07:00:00Z' },
      ],
    }
    const { ctx, avisar } = ctxCon(tablas)
    const r = await parte.corre(ctx)
    expect(avisar).toHaveBeenCalledTimes(1)
    const t = avisar.mock.calls[0][0]
    expect(r.resumen).toBe(t)
    expect(t).toContain('1 cobro previsto (100 €)')
    expect(t).toContain('1 llamada agendada')           // la cancelada no cuenta
    expect(t).toContain('1 lead nuevo ayer')
    expect(t).toContain('1 cuota esta semana (100 €)')
    expect(t).toContain('1 tarea con plazo')
    expect(t).toContain('1 lead parado')
    expect(t).toContain('1 pieza de contenido parada')
    expect(t).toContain('1 propuesta caducada')
    expect(t).toContain('1 venta cobrada (250 €)')
    expect(t).toContain('1 pieza publicada')
    expect(t).toContain('1 propuesta aplicada')
    expect(t).toContain('🟡 Espera tu aprobación: 3')
    expect(t).toContain('cobrador 2 · limpieza-crm 1')
  })

  it('el día del parte es el de Madrid', () => {
    expect(diaMadrid(HOY)).toBe('2026-10-28')
  })
})

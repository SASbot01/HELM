// El histórico de seguidores para el Estudio de contenido: si un perfil tiene
// menos de 7 días de fotos, se rellena el último mes con las altas y bajas de
// cada día que da Instagram, hacia atrás desde los seguidores de hoy, sin pisar
// las fotos reales. Instagram y la base se simulan.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests-de-seguidores-0123456789'

const store = vi.hoisted(() => ({ filas: [], upserts: [] }))
vi.mock('../api/lib/supabase.js', () => {
  const from = () => {
    const q = {
      select() { return q },
      eq(_c, v) { q._client = v; return q },
      upsert(filas, opciones) { store.upserts.push({ filas, opciones }); for (const f of filas) if (!store.filas.some(x => x.client_id === f.client_id && x.dia === f.dia)) store.filas.push(f); return Promise.resolve({ error: null }) },
      then(res, rej) { return Promise.resolve({ data: store.filas.filter(f => f.client_id === q._client), error: null }).then(res, rej) },
    }
    return q
  }
  return { supabase: { from } }
})

const { rellenaSeguidores } = await import('../api/instagram.js')
const { altasYBajas } = await import('../api/_lib/instagram.js')

const HOY = new Date('2026-10-27T17:00:00Z')
beforeEach(() => { store.filas = [{ client_id: 'c1', dia: '2026-10-27', seguidores: 1577 }]; store.upserts = [] })

describe('rellenaSeguidores', () => {
  it('reconstruye hacia atrás: el total de cada día es el de hoy menos lo neto de los días de después', async () => {
    const dias = [
      { dia: '2026-10-24', altas: 10, bajas: 0 },
      { dia: '2026-10-25', altas: 63, bajas: 1 },
      { dia: '2026-10-26', altas: 55, bajas: 2 },
      { dia: '2026-10-27', altas: 5, bajas: 0 },
    ]
    const n = await rellenaSeguidores('c1', 'tok', 1577, { hoy: HOY, altasYBajasDe: async () => dias })
    expect(n).toBe(3)
    const por = Object.fromEntries(store.filas.map(f => [f.dia, f.seguidores]))
    // Hoy es la foto real; al acabar el 26: 1577 − 5 (lo de hoy); el 25: − (55 − 2); el 24: − (63 − 1).
    expect(por).toEqual({ '2026-10-27': 1577, '2026-10-26': 1572, '2026-10-25': 1519, '2026-10-24': 1457 })
    expect(store.upserts[0].opciones).toMatchObject({ onConflict: 'client_id,dia', ignoreDuplicates: true })
  })

  it('no pisa una foto real que ya estaba (la base la conserva) y sigue contando con lo neto', async () => {
    store.filas.push({ client_id: 'c1', dia: '2026-10-25', seguidores: 1600 })
    await rellenaSeguidores('c1', 'tok', 1577, { hoy: HOY, altasYBajasDe: async () => [{ dia: '2026-10-25', altas: 1, bajas: 0 }, { dia: '2026-10-26', altas: 2, bajas: 0 }] })
    expect(store.filas.find(f => f.dia === '2026-10-25').seguidores).toBe(1600)
    expect(store.filas.find(f => f.dia === '2026-10-26').seguidores).toBe(1577)
  })

  it('con 7 días o más de fotos no pide nada a Instagram', async () => {
    store.filas = Array.from({ length: 7 }, (_, i) => ({ client_id: 'c1', dia: `2026-10-2${i}`, seguidores: 1500 + i }))
    const pide = vi.fn(async () => [])
    expect(await rellenaSeguidores('c1', 'tok', 1577, { hoy: HOY, altasYBajasDe: pide })).toBe(0)
    expect(pide).not.toHaveBeenCalled()
  })

  it('sin datos de Instagram, sin token o sin seguidores de hoy: nada, y nunca lanza', async () => {
    expect(await rellenaSeguidores('c1', 'tok', 1577, { hoy: HOY, altasYBajasDe: async () => [] })).toBe(0)
    expect(await rellenaSeguidores('c1', null, 1577, { hoy: HOY })).toBe(0)
    expect(await rellenaSeguidores('c1', 'tok', null, { hoy: HOY })).toBe(0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await rellenaSeguidores('c1', 'tok', 1577, { hoy: HOY, altasYBajasDe: async () => { throw new Error('Instagram caído') } })).toBe(0)
    warn.mockRestore()
  })
})

describe('altasYBajas', () => {
  it('pide follows_and_unfollows día a día y lee FOLLOWER (altas) y NON_FOLLOWER (bajas)', async () => {
    const urls = []
    global.fetch = vi.fn(async (url) => {
      urls.push(String(url))
      const desde = Number(new URL(url).searchParams.get('since'))
      const vacio = desde >= HOY.getTime() / 1000 - 86_400 // el último día (hoy) aún no lo trae
      return { ok: true, json: async () => ({ data: [{ name: 'follows_and_unfollows', total_value: { breakdowns: [{ results: vacio ? [] : [
        { dimension_values: ['FOLLOWER'], value: 10 }, { dimension_values: ['NON_FOLLOWER'], value: 2 },
      ] }] } }] }) }
    })
    const r = await altasYBajas('tok', { dias: 5, hoy: HOY })
    expect(urls).toHaveLength(5)
    expect(new URL(urls[0]).searchParams.get('metric')).toBe('follows_and_unfollows')
    expect(new URL(urls[0]).searchParams.get('breakdown')).toBe('follow_type')
    expect(r).toHaveLength(4)
    // Cada ventana de 24 h se apunta al día de Madrid de su mitad: la que acaba ahora es hoy.
    expect(r[0]).toEqual({ dia: '2026-10-23', altas: 10, bajas: 2 })
    expect(r.map(x => x.dia)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])
  })

  it('un día que falla no tumba los demás; el token muerto, sí', async () => {
    let n = 0
    global.fetch = vi.fn(async () => (++n === 2
      ? { ok: false, status: 400, json: async () => ({ error: { message: 'Unsupported', code: 100 } }) }
      : { ok: true, json: async () => ({ data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['FOLLOWER'], value: 1 }] }] } }] }) }))
    expect(await altasYBajas('tok', { dias: 3, hoy: HOY })).toHaveLength(2)
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid OAuth access token', code: 190 } }) }))
    await expect(altasYBajas('tok', { dias: 3, hoy: HOY })).rejects.toThrow(/OAuth/)
  })
})

// La oficina de un agente (api/_lib/oficina.js): el estado en lenguaje llano y
// el chat. La base y el modelo se simulan: aquí no sale ninguna petición.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = vi.hoisted(() => ({ tablas: {}, inserts: [], upserts: [], lanzar: null }))

vi.mock('../api/lib/supabase.js', () => {
  function builder(tabla) {
    if (store.lanzar === tabla) throw new Error('tabla caída')
    const b = {
      _insert: null,
      select() { return b },
      eq() { return b },
      order() { return b },
      limit() { return b },
      insert(row) { store.inserts.push({ tabla, row }); b._insert = row; return b },
      upsert(row, opts) { store.upserts.push({ tabla, row, opts }); return Promise.resolve({ data: null, error: null }) },
      maybeSingle() { return Promise.resolve({ data: store.tablas[tabla]?.single ?? null, error: null }) },
      single() { return Promise.resolve({ data: { id: 'id-nuevo', ...(b._insert || {}) }, error: null }) },
      then(res, rej) {
        return Promise.resolve({ data: store.tablas[tabla]?.lista ?? [], error: store.tablas[tabla]?.error ?? null }).then(res, rej)
      },
    }
    return b
  }
  return { supabase: { from: (t) => builder(t) } }
})

const llmChat = vi.fn(async () => 'Hola, soy el agente.')
vi.mock('../api/_lib/llm.js', () => ({ llmChat: (...a) => llmChat(...a) }))

const { AGENTES_OFICINA, estadoDe, historial, conversa, guardaRegla } = await import('../api/_lib/oficina.js')

beforeEach(() => { store.tablas = {}; store.inserts = []; store.upserts = []; store.lanzar = null; llmChat.mockClear() })

describe('oficina · catálogo', () => {
  it('conoce a los agentes con oficina', () => {
    expect(AGENTES_OFICINA).toContain('web-creator')
    expect(AGENTES_OFICINA).toContain('setter-ig')
    expect(AGENTES_OFICINA).toContain('portadas')
    expect(AGENTES_OFICINA).toContain('equipo')
  })

  it('el «Calendario de guiones» (drive) ya no tiene oficina; el editor sí', () => {
    expect(AGENTES_OFICINA).not.toContain('drive')
    expect(AGENTES_OFICINA).toContain('editor')
  })
})

describe('oficina · estado', () => {
  it('un agente sin señal de fondo igual dice qué hace y cómo se le pide', async () => {
    const e = await estadoDe('c1', 'portadas')
    expect(e.hace).toMatch(/portada/i)
    expect(e.nombre).toBe('Portadas')
    expect(e.haciendo).toEqual([])
    expect(e.falta[0].cta).toBe('abrir')
  })

  it('web-creator resume lo que estudia, lo listo y lo pendiente', async () => {
    store.tablas.helm_web_fabricacion = { lista: [
      { estado: 'estudiando', sector: 'peluquería', ciudad: 'Lorca' },
      { estado: 'listo', fase: 'por_construir', sector: 'estética', ciudad: 'Murcia', estudiado_en: '2026-10-10' },
      { estado: 'pendiente' },
    ] }
    const e = await estadoDe('c1', 'web-creator')
    expect(e.haciendo[0]).toMatch(/Estudiando la competencia de peluquería en Lorca/)
    expect(e.ultimos[0]).toMatch(/Estudio listo de estética/)
    expect(e.falta.some(f => /arrancar el estudio/.test(f.texto))).toBe(true)
    expect(e.falta.some(f => /sin construir/.test(f.texto))).toBe(true)
  })

  it('web-creator sin contactos manda mover uno en el CRM', async () => {
    const e = await estadoDe('c1', 'web-creator')
    expect(e.falta[0].texto).toMatch(/En fabricación/)
    expect(e.falta[0].cta).toBe('abrir')
  })

  it('el setter apagado pide conectarlo', async () => {
    store.tablas.helm_setter_ig = { single: { activo: false, modo: 'borrador' } }
    const e = await estadoDe('c1', 'setter-ig')
    expect(e.falta[0].cta).toBe('conectar')
    expect(e.haciendo).toEqual([])
  })

  it('el setter activo cuenta lo que atiende y avisa del modo borrador', async () => {
    store.tablas.helm_setter_ig = { single: { activo: true, modo: 'borrador' } }
    store.tablas.helm_ig_conversaciones = { lista: [{ estado: 'ia' }, { estado: 'ia' }, { estado: 'humano' }] }
    const e = await estadoDe('c1', 'setter-ig')
    expect(e.haciendo[0]).toMatch(/Atendiendo 2 conversaciones/)
    expect(e.falta.some(f => /borrador/.test(f.texto))).toBe(true)
  })

  it('trial-reels cuenta las que monta y las listas', async () => {
    store.tablas.helm_trial_reels = { lista: [
      { estado: 'procesando' }, { estado: 'en_cola' }, { estado: 'listo' }, { estado: 'error' },
    ] }
    const e = await estadoDe('c1', 'trial-reels')
    expect(e.haciendo[0]).toMatch(/Montando 2 variantes/)
    expect(e.ultimos[0]).toMatch(/1 variante lista/)
    expect(e.falta.some(f => /error/.test(f.texto))).toBe(true)
  })

  it('si una consulta se cae, la cabecera no revienta', async () => {
    store.lanzar = 'helm_setter_ig'
    const e = await estadoDe('c1', 'setter-ig')
    expect(e.nombre).toBe('Setter de Instagram')
    expect(e.falta.length).toBeGreaterThan(0)
    expect(e._error).toBeTruthy()
  })

  it('el editor sin su tabla ofrece los estilos y no dice que está «integrándose», no peta', async () => {
    store.lanzar = 'helm_ediciones'
    const e = await estadoDe('c1', 'editor')
    expect(e.falta[0].texto).toMatch(/estilos de edición/i)
    expect(e.falta[0].cta).toBe('abrir')
    expect(e.falta.some(f => /integr|muy pronto|construcción/i.test(f.texto))).toBe(false)
  })

  it('el editor sin vídeos pide elegir un estilo y subir uno en el panel, no por Drive ni por un manual', async () => {
    store.tablas.helm_ediciones = { lista: [] }
    const e = await estadoDe('c1', 'editor')
    expect(e.falta[0].texto).toMatch(/sube tu vídeo en bruto/)
    expect(e.falta[0].texto).toMatch(/precio/)
    expect(e.falta[0].cta).toBe('abrir')
    expect(`${e.hace} ${e.falta[0].texto}`).not.toMatch(/Drive|manual/)
  })

  it('el editor cuenta lo que edita, lo que recibe, lo que se quedó a medias y los errores', async () => {
    const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
    store.tablas.helm_ediciones = { lista: [
      { estado: 'en_cola', updated_at: hace(1) }, { estado: 'transcribiendo', updated_at: hace(1) }, { estado: 'montando', updated_at: hace(2) },
      { estado: 'subiendo', updated_at: hace(1) }, { estado: 'subiendo', updated_at: hace(90) },
      { estado: 'listo', updated_at: hace(300) }, { estado: 'error', updated_at: hace(400) },
    ] }
    const e = await estadoDe('c1', 'editor')
    expect(e.haciendo).toEqual(['Editando 3 vídeos', 'Recibiendo 1 vídeo'])
    expect(e.ultimos).toEqual(['1 reel montado'])
    expect(e.falta.map(f => f.texto)).toEqual([
      '1 vídeo se quedó a medias de subir: entra y sigue desde donde iba.',
      '1 vídeo con error (no se ha cobrado)',
    ])
  })
})

describe('oficina · chat y memoria', () => {
  it('guarda una indicación y la acumula', async () => {
    store.tablas.agent_memory = { single: { contenido: '· no uses emojis' } }
    const r = await guardaRegla('c1', 'portadas', 'pon la marca abajo')
    expect(r).toMatch(/no uses emojis/)
    expect(r).toMatch(/pon la marca abajo/)
    expect(store.upserts[0].opts.onConflict).toBe('client_id,clave')
    expect(store.upserts[0].row.clave).toBe('oficina:portadas')
  })

  it('el historial sale del más viejo al más nuevo', async () => {
    store.tablas.helm_agente_chat = { lista: [
      { id: '2', rol: 'agente', texto: 'b', created_at: '2026-10-10T10:01:00Z' },
      { id: '1', rol: 'tu', texto: 'a', created_at: '2026-10-10T10:00:00Z' },
    ] }
    const h = await historial('c1', 'portadas')
    expect(h.map(m => m.id)).toEqual(['1', '2'])
  })

  it('hablar persiste tu mensaje y la respuesta del agente', async () => {
    const r = await conversa('c1', 'portadas', '¿qué haces?')
    expect(llmChat).toHaveBeenCalledTimes(1)
    const opts = llmChat.mock.calls[0][0]
    expect(opts.system).toMatch(/Portadas/)
    expect(opts.system).toMatch(/honrado/i)
    expect(r.suyo.texto).toBe('Hola, soy el agente.')
    // dos inserts en el hilo: el tuyo y el suyo
    expect(store.inserts.filter(i => i.tabla === 'helm_agente_chat').length).toBe(2)
  })

  it('con «recordar» además guarda la indicación', async () => {
    await conversa('c1', 'portadas', 'usa fondo oscuro', { recordar: true })
    expect(store.upserts.some(u => u.tabla === 'agent_memory')).toBe(true)
  })
})

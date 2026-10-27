// El avatar de ventas (api/_lib/avatar.js): del teléfono solo sale el prefijo
// del país hacia el modelo, y el aviso de «listo» lleva al Informe, que es
// donde vive ahora. La base y el modelo se simulan: aquí no sale ninguna
// petición.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = vi.hoisted(() => ({ contactos: [], upserts: [], inserts: [] }))

vi.mock('../api/lib/supabase.js', () => {
  function builder(tabla) {
    const b = {
      select() { return b },
      eq() { return b },
      order() { return b },
      limit() { return Promise.resolve({ data: tabla === 'crm_contacts' ? store.contactos : [], error: null }) },
      delete() { return b },
      insert(row) { store.inserts.push({ tabla, row }); return Promise.resolve({ error: null }) },
      upsert(row) { store.upserts.push({ tabla, row }); return Promise.resolve({ error: null }) },
      maybeSingle() {
        return Promise.resolve({ data: tabla === 'clients' ? { id: 'c1', slug: 'demo', name: 'Demo' } : null, error: null })
      },
      then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej) },
    }
    return b
  }
  return { supabase: { from: (t) => builder(t) } }
})

const claudeTurno = vi.fn()
vi.mock('../api/_lib/anthropic.js', () => ({ claudeTurno: (...a) => claudeTurno(...a) }))
const notificar = vi.fn(async () => {})
vi.mock('../api/_lib/notificar.js', () => ({ notificar: (...a) => notificar(...a) }))

process.env.AGENTS_ANTHROPIC_KEY = 'clave-de-prueba'
const { prefijoTelefono, generaAvatar } = await import('../api/_lib/avatar.js')

beforeEach(() => {
  store.contactos = []; store.upserts = []; store.inserts = []
  claudeTurno.mockReset(); notificar.mockClear()
})

describe('avatar · prefijoTelefono', () => {
  it('saca el prefijo de los números internacionales, con «+» o con «00»', () => {
    expect(prefijoTelefono('+34 600 12 34 56')).toBe('+34')
    expect(prefijoTelefono('0034 600123456')).toBe('+34')
    expect(prefijoTelefono('+52 1 55 1234 5678')).toBe('+52')
    expect(prefijoTelefono('+1 (809) 555-1234')).toBe('+1')
    expect(prefijoTelefono('+7 912 345 67 89')).toBe('+7')
  })

  it('distingue los prefijos de tres cifras de los de dos', () => {
    expect(prefijoTelefono('+351 912 345 678')).toBe('+351')   // Portugal, no «+35»
    expect(prefijoTelefono('+593 99 123 4567')).toBe('+593')   // Ecuador
    expect(prefijoTelefono('+212 6 12 34 56 78')).toBe('+212') // Marruecos
    expect(prefijoTelefono('+44 7700 900123')).toBe('+44')
  })

  it('entiende las tiras largas sin «+» (como exporta WhatsApp)', () => {
    // Desde WhatsApp, que siempre guarda el país, una tira de 11 cifras vale.
    expect(prefijoTelefono('34600123456', { whatsapp: true })).toBe('+34')
    // Una de 12-13 cifras es menos ambigua y vale aunque no diga de dónde viene.
    expect(prefijoTelefono('5215512345678')).toBe('+52')
    expect(prefijoTelefono('https://wa.me/5491123456789')).toBe('+54')
    // Pero una tira de 11 cifras desde `phone` no se fía: 34+9 (España) y DDD+9
    // (un móvil nacional de Brasil) son indistinguibles.
    expect(prefijoTelefono('34600123456')).toBe('')
  })

  it('quita las marcas invisibles y lo que va delante del primer dígito o «+»', () => {
    expect(prefijoTelefono('(+34) 600 12 34 56')).toBe('+34')
    expect(prefijoTelefono('Tel: +34 600 12 34 56')).toBe('+34')
    expect(prefijoTelefono('Tel.: +34 600123456')).toBe('+34')
    // iOS/WhatsApp copian el número envuelto en marcas de dirección (LRM, los
    // aislantes LRE…PDI, el BOM): no deben descolocar la lectura.
    expect(prefijoTelefono('\u200E+34 600 12 34 56')).toBe('+34')
    expect(prefijoTelefono('\u202A+34 600 12 34 56\u202C')).toBe('+34')
    expect(prefijoTelefono('\uFEFF+351 912 345 678')).toBe('+351')
  })

  it('rechaza los prefijos de tres cifras sin asignar', () => {
    // 210, 214, 215, 217, 219… no son ningún país: no se mandan.
    expect(prefijoTelefono('+219 1 2345 6789')).toBe('')
    expect(prefijoTelefono('+210 12 345 678')).toBe('')
    expect(prefijoTelefono('210123456789', { whatsapp: true })).toBe('')
    // Los que sí existen, con sus tres cifras, siguen valiendo.
    expect(prefijoTelefono('+211 912 345 678')).toBe('+211')   // Sudán del Sur
    expect(prefijoTelefono('+599 9 123 4567')).toBe('+599')    // Curazao
  })

  it('con varios números o una extensión, mira solo el primero', () => {
    // Antes se juntaban las cifras de todos en una tira «internacional».
    expect(prefijoTelefono('968 12 34 56 - 600 11 22 33')).toBe('')     // era +968
    expect(prefijoTelefono('600123456 / 611223344')).toBe('')           // era +60
    expect(prefijoTelefono('712 345 678 ext 12')).toBe('')              // era +7
    expect(prefijoTelefono('712 345 678 extensión 12')).toBe('')
    expect(prefijoTelefono('600123456, 611223344')).toBe('')
    expect(prefijoTelefono('600123456; 611223344')).toBe('')
    expect(prefijoTelefono('+34 968 12 34 56 - 600 11 22 33')).toBe('+34')
    expect(prefijoTelefono('+34 968 12 34 56 ext. 12')).toBe('+34')
    expect(prefijoTelefono('600-12-34-56')).toBe('')                     // el guion sin espacios no parte
  })

  it('los móviles de Brasil: con su prefijo sí, sin él no se adivinan', () => {
    expect(prefijoTelefono('+55 11 91234-5678')).toBe('+55')
    expect(prefijoTelefono('5511912345678')).toBe('+55')   // 13 cifras: país + DDD + móvil
    expect(prefijoTelefono('55 11 91234 5678')).toBe('+55')
    // Nacionales de 11 cifras (DDD + móvil). Desde `phone` no se adivinan: ni
    // +1, ni +55, ni el inexistente +219 del DDD de Río.
    expect(prefijoTelefono('(11) 91234-5678')).toBe('')
    expect(prefijoTelefono('11 91234-5678')).toBe('')
    expect(prefijoTelefono('11912345678')).toBe('')
    expect(prefijoTelefono('(21) 98765-4321')).toBe('')
    expect(prefijoTelefono('21 98765-4321')).toBe('')
    expect(prefijoTelefono('21987654321')).toBe('')
    // Belo Horizonte (DDD 31): sería +31 (Países Bajos), que no es. Desde phone, nada.
    expect(prefijoTelefono('31987654321')).toBe('')
    // Un número de Norteamérica en tira ya no se da por bueno desde `phone`
    // (los DDD 12-19 de Brasil se le parecen); desde WhatsApp sí.
    expect(prefijoTelefono('18095551234')).toBe('')
    expect(prefijoTelefono('18095551234', { whatsapp: true })).toBe('+1')
    expect(prefijoTelefono('1 809 555 1234', { whatsapp: true })).toBe('+1')
  })

  it('la tira sin «+» solo con un número en el campo, salvo que venga de WhatsApp', () => {
    expect(prefijoTelefono('34600123456 / 34611223344')).toBe('')
    expect(prefijoTelefono('34600123456 / 34611223344', { whatsapp: true })).toBe('+34')
    expect(prefijoTelefono('https://api.whatsapp.com/send?phone=34600123456&text=hola')).toBe('+34')
    expect(prefijoTelefono('https://wa.me/+5511912345678')).toBe('+55')
    // Ni de WhatsApp vale una tira demasiado corta o demasiado larga.
    expect(prefijoTelefono('600123456', { whatsapp: true })).toBe('')
    expect(prefijoTelefono('34600123456789', { whatsapp: true })).toBe('')
  })

  it('no adivina el país de un número nacional ni de basura', () => {
    expect(prefijoTelefono('600 12 34 56')).toBe('')
    expect(prefijoTelefono('0412 555 1234')).toBe('')
    expect(prefijoTelefono('+34')).toBe('')
    expect(prefijoTelefono('')).toBe('')
    expect(prefijoTelefono(null)).toBe('')
  })
})

describe('avatar · generaAvatar', () => {
  it('al modelo le llega el prefijo, nunca el número entero; y el aviso lleva al Informe', async () => {
    store.contactos = [
      { id: 'a', name: 'Lucía Pérez', phone: '+34 600 12 34 56', source: 'Instagram' },
      { id: 'b', name: 'Jorge Ruiz', whatsapp: '5215512345678', source: 'Anuncios' },
      { id: 'c', name: 'Marta Gil', phone: '612 34 56 78' },
      // Teléfono nacional y WhatsApp con el país: el prefijo sale del segundo.
      { id: 'd', name: 'Ana Sanz', phone: '968 12 34 56', whatsapp: '351 912 345 678' },
    ]
    claudeTurno
      .mockResolvedValueOnce({
        toolCalls: [{
          name: 'entregar_fichas',
          args: { fichas: [1, 2, 3, 4].map(n => ({ n, genero: 'mujer', genero_conf: 'alta', edad_rango: 'desconocido', ubicacion: 'España', facturacion: 'desconocido', perfil: 'p', interes: 'i', senales: 's' })) },
        }],
        usage: { in: 100, out: 50 },
      })
      .mockResolvedValueOnce({
        toolCalls: [{ name: 'entregar_avatar', args: { descripcion: 'Mujer de 30 a 45 en España.' } }],
        usage: { in: 80, out: 40 },
      })

    await generaAvatar({ payload: { clientId: 'c1' } })

    const fichas = claudeTurno.mock.calls[0][0].messages[0].content
    expect(fichas).toContain('prefijo del teléfono: +34')
    expect(fichas).toContain('prefijo del teléfono: +52')
    expect(fichas.split('\n').find(l => l.includes('Ana Sanz'))).toContain('prefijo del teléfono: +351')
    expect(fichas).not.toMatch(/600 ?12 ?34 ?56|5215512345678|612 34 56 78|968 12 34 56|912 345 678/)
    expect(fichas).not.toContain('teléfono: 6')
    // El tercero no tiene prefijo: no sale ni la etiqueta.
    expect(fichas.split('\n').find(l => l.includes('Marta Gil'))).not.toContain('teléfono')

    expect(notificar).toHaveBeenCalledTimes(1)
    const aviso = notificar.mock.calls[0][2]
    expect(aviso.destino).toBe('informe')
    expect(aviso.titulo).toBe('Tu avatar de ventas está listo')
    // El cuerpo es genérico: la campana la ven todos los roles y no debe llevar
    // el resumen del estudio (retrata a los clientes del negocio).
    expect(aviso.cuerpo).toBe('Ábrelo en Informe → Avatar de ventas')
    expect(aviso.cuerpo).not.toContain('Mujer de 30 a 45')
    expect(store.upserts.find(u => u.tabla === 'helm_avatar')?.row.n_analizados).toBe(4)
  })
})

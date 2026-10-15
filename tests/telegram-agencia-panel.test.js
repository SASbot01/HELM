// El panel del bot de Telegram de la agencia (src/helm/TelegramAgencia.jsx):
// qué se enseña según el estado que da api/telegram-agencia.js, y que el
// cliente llama a las rutas del contrato. Sin red ni navegador: la vista se
// pinta a texto con react-dom/server.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../src/utils/supabase.js', () => ({ supabase: {} }))

const { VistaTelegram } = await import('../src/helm/TelegramAgencia.jsx')
const { telegramAgenciaApi } = await import('../src/helm/lib.js')

const BOT = { username: 'Helm_silvestre_bot', nombre: 'HELM Silvestre' }
const ACTIVO = { url: 'https://helm.s4sf.net/api/telegram-agencia?action=webhook', pendientes: 0, ultimoError: null }
const CODIGO = { codigo: 'ABCD-EFGH', enlace: 'https://t.me/Helm_silvestre_bot?start=ABCD-EFGH', caduca: '2026-10-15T10:15:00Z' }
const estado = (cambios = {}) => ({ bot: BOT, webhook: ACTIVO, vinculado: null, permitido: true, plataforma: false, ...cambios })

function pinta(props) {
  const html = renderToStaticMarkup(createElement(VistaTelegram, props))
  return { html, texto: html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') }
}

describe('mientras carga o si falla', () => {
  it('cargando', () => {
    expect(pinta({ estado: null }).texto).toContain('Cargando')
  })
  it('sin estado, el motivo y reintentar', () => {
    const { texto } = pinta({ estado: null, fallo: 'Error 404' })
    expect(texto).toContain('Error 404')
    expect(texto).toContain('Reintentar')
  })
})

describe('el bot y su webhook', () => {
  it('sin token: la plataforma ve qué falta y no se ofrece ni activar ni vincular', () => {
    const { texto } = pinta({ estado: estado({ bot: null, webhook: null, plataforma: true, configurado: false }) })
    expect(texto).toContain('Sin configurar')
    expect(texto).toContain('HELM_TELEGRAM_TOKEN')
    expect(texto).toContain('reinicia la API')
    expect(texto).not.toContain('Activar el bot')
    expect(texto).not.toContain('Vincular mi Telegram')
  })

  it('sin token: un superadmin de agencia no ve nombres de variables', () => {
    const { texto } = pinta({ estado: estado({ bot: null, webhook: null, configurado: false }) })
    expect(texto).toContain('Sin configurar')
    expect(texto).not.toContain('HELM_TELEGRAM_TOKEN')
    expect(texto).not.toContain('Vincular mi Telegram')
  })

  it('con token pero getMe falla (revocado, 429, Telegram caído): no se dice que falte el token', () => {
    const { texto } = pinta({ estado: estado({ bot: null, webhook: null, plataforma: true, configurado: true }) })
    expect(texto).toContain('Sin conexión')
    expect(texto).toContain('no lo acepta o no contesta')
    expect(texto).not.toContain('Falta el token')
    expect(texto).toContain('Volver a mirar')
  })

  it('sin bot y sin saber si hay token: un texto que cubre los tres casos', () => {
    const { texto } = pinta({ estado: estado({ bot: null, webhook: null, plataforma: true }) })
    expect(texto).toContain('Sin conexión')
    expect(texto).toContain('el token ya no vale')
    expect(texto).not.toContain('Falta el token')
    const agencia = pinta({ estado: estado({ bot: null, webhook: null }) }).texto
    expect(agencia).toContain('no se puede hablar con el bot')
    expect(agencia).not.toContain('HELM_TELEGRAM_TOKEN')
  })

  it('webhook sin registrar: la plataforma lo activa y aún no se puede vincular nadie', () => {
    const { texto } = pinta({ estado: estado({ webhook: { url: '', pendientes: 0, ultimoError: null }, plataforma: true }) })
    expect(texto).toContain('Activar el bot')
    expect(texto).toContain('Sin activar')
    expect(texto).not.toContain('Vincular mi Telegram')
  })

  it('webhook sin registrar: quien no es de plataforma no tiene el botón, solo el aviso', () => {
    const { texto } = pinta({ estado: estado({ webhook: { url: '', pendientes: 0, ultimoError: null } }) })
    expect(texto).not.toContain('Activar el bot')
    expect(texto).toContain('Lo activa la cuenta de plataforma')
    expect(texto).not.toContain('Vincular mi Telegram')
  })

  it('webhook sin registrar de verdad (infoWebhook da url null)', () => {
    const { texto } = pinta({ estado: estado({ webhook: { url: null, pendientes: 0, ultimoError: null }, plataforma: true }) })
    expect(texto).toContain('Sin activar')
    expect(texto).toContain('Activar el bot')
  })

  it('webhook con mensajes esperando y un error: se puede reactivar y vincular, y se ve el error', () => {
    const webhook = { ...ACTIVO, pendientes: 3, ultimoError: 'Wrong response from the webhook: 502 Bad Gateway' }
    const { texto } = pinta({ estado: estado({ webhook, plataforma: true }) })
    expect(texto).toContain('Con fallos')
    expect(texto).toContain('Activar el bot')
    expect(texto).toContain('502 Bad Gateway')
    expect(texto).toContain('3 mensajes esperando')
    expect(texto).toContain('se descartan los que esperan')
    expect(texto).toContain('Vincular mi Telegram')
  })

  it('un error reciente, aunque no quede nada esperando: con fallos', () => {
    const webhook = { ...ACTIVO, ultimoError: 'Connection refused', ultimoErrorFecha: '2026-10-15T09:55:00Z' }
    const { texto } = pinta({ estado: estado({ webhook, plataforma: true, ahora: '2026-10-15T10:00:00Z' }) })
    expect(texto).toContain('Con fallos')
    expect(texto).toContain('hace 5 min')
    expect(texto).toContain('Activar el bot')
    const agencia = pinta({ estado: estado({ webhook, ahora: '2026-10-15T10:00:00Z' }) }).texto
    expect(agencia).toContain('problemas para entregarle los mensajes')
  })

  it('un error antiguo (un reinicio de la API) sin nada esperando: activo, y la plataforma lo ve en gris', () => {
    const webhook = { ...ACTIVO, ultimoError: 'Wrong response from the webhook: 502 Bad Gateway', ultimoErrorFecha: '2026-10-15T08:00:00Z' }
    const { texto } = pinta({ estado: estado({ webhook, plataforma: true, ahora: '2026-10-15T10:00:00Z' }) })
    expect(texto).toContain('Activo')
    expect(texto).not.toContain('Con fallos')
    expect(texto).not.toContain('Activar el bot')
    expect(texto).toContain('Último fallo de entrega (hace 2 h)')
    const agencia = pinta({ estado: estado({ webhook, ahora: '2026-10-15T10:00:00Z' }) }).texto
    expect(agencia).toContain('Activo')
    expect(agencia).not.toContain('problemas para entregarle')
    expect(agencia).not.toContain('Último fallo')
  })

  it('sin la hora del servidor, cuenta desde que llegó el estado', () => {
    const webhook = { ...ACTIVO, ultimoError: '502', ultimoErrorFecha: '2026-10-15T09:58:00Z' }
    const leido = Date.parse('2026-10-15T10:00:00Z')
    expect(pinta({ estado: estado({ webhook }), leido }).texto).toContain('Con fallos')
    expect(pinta({ estado: estado({ webhook }), leido: leido + 60 * 60_000 }).texto).toContain('Activo')
  })

  it('un error sin fecha y sin nada esperando no basta para decir que falla', () => {
    const webhook = { ...ACTIVO, ultimoError: '502 Bad Gateway' }
    const { texto } = pinta({ estado: estado({ webhook, plataforma: true }) })
    expect(texto).toContain('Activo')
    expect(texto).not.toContain('Activar el bot')
    expect(texto).toContain('Último fallo de entrega: «502 Bad Gateway»')
  })

  it('si el servidor dice si el webhook es suyo, manda eso y no la URL', () => {
    const ajeno = { ...ACTIVO, propio: false }
    expect(pinta({ estado: estado({ webhook: ajeno, plataforma: true }) }).texto).toContain('Activar el bot')
    const sinUrl = { url: null, pendientes: 0, ultimoError: null, propio: true }
    const { texto } = pinta({ estado: estado({ webhook: sinUrl, plataforma: true }) })
    expect(texto).toContain('Activo')
    expect(texto).not.toContain('Activar el bot')
  })

  it('webhook en otro sitio: se reactiva y la URL (con su secreto) no se enseña nunca', () => {
    const webhook = { url: 'https://helm.s4sf.net/api/telegram?action=webhook&clientId=x&secret=SECRETO123', pendientes: 0, ultimoError: null }
    const { html, texto } = pinta({ estado: estado({ webhook, plataforma: true }) })
    expect(texto).toContain('Activar el bot')
    expect(html).not.toContain('SECRETO123')
    expect(html).not.toContain('/api/telegram?')
  })

  it('activo: sin botón de activar, ni siquiera para la plataforma', () => {
    const { texto } = pinta({ estado: estado({ plataforma: true }) })
    expect(texto).toContain('@Helm_silvestre_bot')
    expect(texto).toContain('Activo')
    expect(texto).not.toContain('Activar el bot')
  })
})

describe('vincular tu Telegram', () => {
  it('sin vincular: el botón, los ejemplos, que lo delicado pide aprobación y que gasta créditos', () => {
    const { texto } = pinta({ estado: estado() })
    expect(texto).toContain('Vincular mi Telegram')
    for (const e of ['¿Cuánto ha cobrado DCC este mes?', 'Apunta en Hugo un gasto de 30 € de IA', 'Lanza el guionista en Detrás de Cámaras']) {
      expect(texto).toContain(e)
    }
    expect(texto).toContain('Aprobar')
    expect(texto).toContain('Rechazar')
    expect(texto).toContain('gasta créditos de la agencia')
  })

  it('con el código vivo: el enlace grande, /vincular copiable, la cuenta atrás y el QR', () => {
    const { html, texto } = pinta({ estado: estado(), codigo: CODIGO, restante: 845, qr: 'data:image/png;base64,QR' })
    expect(html).toContain('href="https://t.me/Helm_silvestre_bot?start=ABCD-EFGH"')
    expect(texto).toContain('Abrir Telegram y vincular')
    expect(texto).toContain('/vincular ABCD-EFGH')
    expect(texto).toContain('14:05')
    expect(html).toContain('src="data:image/png;base64,QR"')
    expect(texto).not.toContain('Vincular mi Telegram')
  })

  it('un enlace que no es de t.me no se pinta (ni su QR), pero el código sí', () => {
    const { html, texto } = pinta({ estado: estado(), codigo: { ...CODIGO, enlace: 'javascript:alert(1)' }, restante: 600, qr: 'data:image/png;base64,QR' })
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:image')
    expect(texto).toContain('/vincular ABCD-EFGH')
  })

  it('código caducado: se pide otro y el viejo desaparece', () => {
    const { texto } = pinta({ estado: estado(), codigo: CODIGO, restante: 0 })
    expect(texto).toContain('ha caducado')
    expect(texto).toContain('Pedir otro código')
    expect(texto).toContain('otra cuenta de HELM')
    expect(texto).not.toContain('ABCD-EFGH')
  })

  it('vinculado: con quién, desde cuándo y desvincular', () => {
    const vinculado = { tg_nombre: 'Alex Silvestre @alex', vinculado_at: '2026-10-15T09:00:00Z' }
    const { html, texto } = pinta({ estado: estado({ vinculado }) })
    expect(texto).toContain('Vinculado con Alex Silvestre @alex')
    expect(texto).toContain('15 de octubre de 2026')
    expect(texto).toContain('Desvincular')
    expect(html).toContain('href="https://t.me/Helm_silvestre_bot"')
    expect(texto).not.toContain('Vincular mi Telegram')
  })
})

describe('una agencia sin el bot', () => {
  it('se le explica sin jerga y no se le ofrece nada', () => {
    const { texto } = pinta({ estado: estado({ permitido: false }) })
    expect(texto).toContain('no está disponible para tu agencia')
    expect(texto).not.toContain('de la casa')
    expect(texto).not.toContain('Vincular mi Telegram')
    expect(texto).not.toContain('¿Cuánto ha cobrado DCC')
    expect(texto).not.toContain('@Helm_silvestre_bot')
  })

  it('si quedó vinculada de antes, al menos puede desvincularse', () => {
    const vinculado = { tg_nombre: 'Pepe', vinculado_at: '2026-10-01T09:00:00Z' }
    const { html, texto } = pinta({ estado: estado({ permitido: false, vinculado }) })
    expect(texto).toContain('Desvincular')
    expect(html).not.toContain('href="https://t.me/')
  })
})

it('el aviso y el error de la última acción', () => {
  const { texto } = pinta({ estado: estado(), aviso: 'Bot activado', error: 'Solo la plataforma' })
  expect(texto).toContain('Bot activado')
  expect(texto).toContain('Solo la plataforma')
})

describe('telegramAgenciaApi, las rutas de api/telegram-agencia.js', () => {
  let llamadas
  beforeEach(() => {
    llamadas = []
    vi.stubGlobal('localStorage', { getItem: (k) => (k === 'bw_admin_jwt' ? 'jwt-de-prueba' : null), removeItem() {} })
    vi.stubGlobal('fetch', vi.fn(async (ruta, opciones) => {
      llamadas.push({ ruta, ...opciones })
      return { status: 200, ok: true, json: async () => ({ ok: true }) }
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('estado, vínculo, código, desvincular y registrar, con la sesión', async () => {
    await telegramAgenciaApi.estado()
    await telegramAgenciaApi.vinculo()
    await telegramAgenciaApi.codigo()
    await telegramAgenciaApi.desvincular()
    await telegramAgenciaApi.registrar()
    expect(llamadas.map(l => [l.method, l.ruta, l.body ?? null])).toEqual([
      ['GET', '/api/telegram-agencia?action=estado', null],
      ['GET', '/api/telegram-agencia?action=estado&solo=vinculo', null],
      ['POST', '/api/telegram-agencia?action=codigo', '{}'],
      ['DELETE', '/api/telegram-agencia?action=vinculo', null],
      ['POST', '/api/telegram-agencia?action=registrar', '{}'],
    ])
    for (const l of llamadas) expect(l.headers.Authorization).toBe('Bearer jwt-de-prueba')
  })
})

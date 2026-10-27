// La subida por trozos, de punta a punta: el servidor (api/_lib/subida-trozos.js,
// con disco de verdad en una carpeta temporal) escribe cada trozo en su sitio y
// solo si toca (409 con lo recibido si no), con su tope, de uno en uno (un
// trozo nuevo corta al que se quedó colgado), y la cierra cuando está entera; y
// el cliente (src/helm/subida.js, con un XMLHttpRequest simulado) manda los
// trozos en orden con la sesión, cuenta el progreso, repite lo que falla por la
// red esperando cada vez más y sigue desde donde diga un 409, tantas veces como
// haga falta mientras avance.
import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { Readable, PassThrough } from 'node:stream'

const {
  recibeTrozo, recibidosDe, cierraSubida, contestaError, limpiaSubidas, MAX_TROZO, PARTE, ESPERA_TROZO_MS,
} = await import('../api/_lib/subida-trozos.js')
const { subePorTrozos, urlDeTrozo, esperaDe, TROZO, REINTENTOS, MAX_SALTOS } = await import('../src/helm/subida.js')
const editorSubida = await import('../src/agents/editor/subida.js')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-trozos-'))
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }))
let n = 0
const carpeta = () => path.join(TMP, `subida-${++n}`)
const bytes = (desde, hasta) => Buffer.from(Array.from({ length: hasta - desde }, (_, i) => (desde + i) % 256))
const peticion = (trozos, headers = {}) => Object.assign(Readable.from(trozos), { headers })
const falla = (p) => p.then(() => { throw new Error('tenía que fallar') }, e => e)
// Espera a que se cumpla `cond` (hasta 2 s): lo que escribe un stream llega al disco a su ritmo.
async function hasta(cond) {
  for (let i = 0; i < 200; i++) { if (await cond()) return; await new Promise(r => setTimeout(r, 10)) }
  throw new Error('no se cumplió a tiempo')
}
// Una petición que se queda abierta (lo que se le escriba, llega; no acaba nunca).
const colgada = (extra = {}) => Object.assign(new PassThrough(), { headers: {} }, extra)

// ── El servidor ─────────────────────────────────────────────────────────────
describe('recibeTrozo', () => {
  it('en orden: cada trozo donde acaba lo recibido, hasta completar', async () => {
    const dir = carpeta()
    expect(await recibidosDe(dir)).toBe(0)
    expect(await recibeTrozo(peticion([bytes(0, 4)]), { dir, total: 10, offset: '0' })).toEqual({ recibidos: 4, completo: false })
    expect(await recibeTrozo(peticion([bytes(4, 6), bytes(6, 10)]), { dir, total: '10', offset: 4 })).toEqual({ recibidos: 10, completo: true })
    expect(fs.readFileSync(path.join(dir, PARTE))).toEqual(bytes(0, 10))
    expect(await recibidosDe(dir)).toBe(10)
  })

  it('un trozo que no toca: 409 con lo recibido, sin escribir, y con el cuerpo leído', async () => {
    const dir = carpeta()
    await recibeTrozo(peticion([bytes(0, 4)]), { dir, total: 10, offset: 0 })
    const repetido = peticion([bytes(0, 4)])
    const e = await falla(recibeTrozo(repetido, { dir, total: 10, offset: 0 }))
    expect(e.statusCode).toBe(409)
    expect(e.recibidos).toBe(4)
    expect(repetido.readableEnded).toBe(true)
    const adelantado = await falla(recibeTrozo(peticion([bytes(8, 10)]), { dir, total: 10, offset: 8 }))
    expect([adelantado.statusCode, adelantado.recibidos]).toEqual([409, 4])
    expect(fs.readFileSync(path.join(dir, PARTE))).toEqual(bytes(0, 4))
  })

  it('el tope de trozo y el del archivo: 413, y lo que se pasa no se queda', async () => {
    const dir = carpeta()
    await recibeTrozo(peticion([bytes(0, 4)]), { dir, total: 20, offset: 0 })
    const gordo = peticion([bytes(4, 7), bytes(7, 10)])
    const grande = await falla(recibeTrozo(gordo, { dir, total: 20, offset: 4, maxTrozo: 4 }))
    expect(grande.statusCode).toBe(413)
    expect(grande.message).toMatch(/pesa más de/)
    expect(await recibidosDe(dir)).toBe(4)
    // Lo que sobra se lee (y se tira) para que el navegador reciba el 413 y no un corte.
    expect(gordo.readableEnded).toBe(true)
    // Pasarse del total también es un 413.
    const pasa = await falla(recibeTrozo(peticion([bytes(4, 21)]), { dir, total: 20, offset: 4 }))
    expect(pasa.statusCode).toBe(413)
    expect(pasa.message).toMatch(/se pasa de lo que pesa/)
    expect(await recibidosDe(dir)).toBe(4)
    // Pasarse muchísimo (más del doble del tope): 413 en el acto y se corta.
    const enorme = peticion([bytes(0, 12)])
    expect((await falla(recibeTrozo(enorme, { dir, total: 20, offset: 4, maxTrozo: 4 }))).statusCode).toBe(413)
    expect(enorme.destroyed).toBe(true)
    expect(await recibidosDe(dir)).toBe(4)
    // Con Content-Length de más no se escribe nada: se tira el cuerpo y 413…
    const anunciado = peticion([bytes(4, 10)], { 'content-length': String(MAX_TROZO + 1) })
    const e = await falla(recibeTrozo(anunciado, { dir, total: MAX_TROZO * 2, offset: 4 }))
    expect([e.statusCode, e.message]).toEqual([413, 'El trozo pesa más de 33 MB.'])
    expect(anunciado.readableEnded).toBe(true)
    // …y si lo anunciado es desmesurado, ni se lee.
    const desmesurado = peticion([bytes(4, 10)], { 'content-length': String(MAX_TROZO * 3) })
    expect((await falla(recibeTrozo(desmesurado, { dir, total: MAX_TROZO * 4, offset: 4 }))).statusCode).toBe(413)
    expect(desmesurado.readableEnded).toBe(false)
    expect(await recibidosDe(dir)).toBe(4)
    expect(MAX_TROZO).toBeGreaterThan(TROZO)
  })

  it('un trozo cortado a medias deja el principio y se sigue desde ahí sin agujeros', async () => {
    const dir = carpeta()
    const roto = Object.assign(new Readable({ read() {} }), { headers: {} })
    roto.push(bytes(0, 3))
    setTimeout(() => roto.destroy(new Error('aborted')), 30)
    const e = await falla(recibeTrozo(roto, { dir, total: 8, offset: 0 }))
    expect(e.statusCode).toBe(400)
    const quedan = await recibidosDe(dir)
    expect(e.recibidos).toBe(quedan)
    expect(quedan).toBeLessThanOrEqual(3)
    // El cliente repite el trozo entero: si algo llegó, 409 con lo que hay y
    // sigue desde ahí; si no llegó nada, el trozo entra sin más.
    const otra = await recibeTrozo(peticion([bytes(0, 8)]), { dir, total: 8, offset: 0 }).catch(x => x)
    if (quedan > 0) {
      expect([otra.statusCode, otra.recibidos]).toEqual([409, quedan])
      expect(await recibeTrozo(peticion([bytes(quedan, 8)]), { dir, total: 8, offset: quedan })).toEqual({ recibidos: 8, completo: true })
    } else {
      expect(otra).toEqual({ recibidos: 8, completo: true })
    }
    expect(fs.readFileSync(path.join(dir, PARTE))).toEqual(bytes(0, 8))
  })

  it('un trozo colgado no bloquea: el nuevo lo corta y sigue desde lo que llegó (409), sin pisarse', async () => {
    const dir = carpeta()
    // El móvil cambia de Wi-Fi a 4G: la conexión vieja manda medio trozo y se queda abierta.
    const vieja = colgada()
    const primero = falla(recibeTrozo(vieja, { dir, total: 6, offset: 0 }))
    vieja.write(bytes(0, 3))
    await hasta(async () => (await recibidosDe(dir)) === 3)
    // El cliente repite el trozo por otra conexión: corta la vieja y le dice lo que hay.
    const e = await falla(recibeTrozo(peticion([bytes(0, 6)]), { dir, total: 6, offset: 0 }))
    expect([e.statusCode, e.recibidos]).toEqual([409, 3])
    expect(vieja.destroyed).toBe(true)
    expect((await primero).statusCode).toBe(400)
    expect(await recibeTrozo(peticion([bytes(3, 6)]), { dir, total: 6, offset: 3 })).toEqual({ recibidos: 6, completo: true })
    expect(fs.readFileSync(path.join(dir, PARTE))).toEqual(bytes(0, 6))
  })

  it('varios colgados a la vez: gana el último', async () => {
    const dir = carpeta()
    const a = colgada()
    const b = colgada()
    const pa = falla(recibeTrozo(a, { dir, total: 4, offset: 0 }))
    const pb = falla(recibeTrozo(b, { dir, total: 4, offset: 0 }))
    const ultimo = recibeTrozo(peticion([bytes(0, 4)]), { dir, total: 4, offset: 0 })
    expect(await ultimo).toEqual({ recibidos: 4, completo: true })
    expect([a.destroyed, b.destroyed]).toEqual([true, true])
    expect([(await pa).statusCode, (await pb).statusCode]).toEqual([400, 400])
    expect(fs.readFileSync(path.join(dir, PARTE))).toEqual(bytes(0, 4))
  })

  it('un trozo que se queda callado se corta a los ESPERA_TROZO_MS; al acabar, se quita el plazo', async () => {
    const plazo = {
      socket: {},
      setTimeout(ms, alCallar) { this.plazo = ms; if (alCallar) this.alCallar = alCallar; return this },
    }
    const callada = colgada({ ...plazo })
    const p = falla(recibeTrozo(callada, { dir: carpeta(), total: 6, offset: 0 }))
    expect(callada.plazo).toBe(ESPERA_TROZO_MS)
    expect(ESPERA_TROZO_MS).toBe(60_000)
    callada.alCallar()
    expect((await p).statusCode).toBe(400)
    const buena = colgada({ ...plazo })
    const q = recibeTrozo(buena, { dir: carpeta(), total: 2, offset: 0 })
    buena.end(bytes(0, 2))
    expect(await q).toEqual({ recibidos: 2, completo: true })
    expect(buena.plazo).toBe(0)
  })

  it('lo que falta o no vale: 400', async () => {
    const dir = carpeta()
    expect((await falla(recibeTrozo(peticion([]), { dir, total: 0, offset: 0 }))).statusCode).toBe(400)
    expect((await falla(recibeTrozo(peticion([]), { dir, total: 10, offset: 'x' }))).statusCode).toBe(400)
    expect((await falla(recibeTrozo(peticion([]), { dir, total: 10, offset: -1 }))).statusCode).toBe(400)
  })

  it('si el cuerpo ya lo leyó el servidor, usa req.rawBody', async () => {
    const dir = carpeta()
    const leida = Readable.from([])
    leida.resume()
    await once(leida, 'end')
    Object.assign(leida, { headers: {}, rawBody: bytes(0, 5) })
    expect(await recibeTrozo(leida, { dir, total: 5, offset: 0 })).toEqual({ recibidos: 5, completo: true })
  })
})

describe('cierraSubida, contestaError y limpiaSubidas', () => {
  it('cierra solo entera; dos veces no rompe; sin nada, 400', async () => {
    const dir = carpeta()
    const destino = path.join(dir, 'original.mp4')
    await recibeTrozo(peticion([bytes(0, 4)]), { dir, total: 10, offset: 0 })
    const e = await falla(cierraSubida(dir, destino, 10))
    expect([e.statusCode, e.recibidos]).toEqual([409, 4])
    await recibeTrozo(peticion([bytes(4, 10)]), { dir, total: 10, offset: 4 })
    expect(await cierraSubida(dir, destino, 10)).toEqual({ bytes: 10 })
    expect(fs.existsSync(path.join(dir, PARTE))).toBe(false)
    expect(fs.readFileSync(destino)).toEqual(bytes(0, 10))
    expect(await cierraSubida(dir, destino, 10)).toEqual({ bytes: 10 })
    expect((await falla(cierraSubida(carpeta(), path.join(TMP, 'nada.mp4'), 10))).statusCode).toBe(400)
  })

  it('cierra aunque haya un trozo colgado: lo corta, espera a que suelte el archivo y mira lo que hay', async () => {
    const dir = carpeta()
    const destino = path.join(dir, 'original.mp4')
    await recibeTrozo(peticion([bytes(0, 3)]), { dir, total: 6, offset: 0 })
    const colgado = colgada()
    const p = falla(recibeTrozo(colgado, { dir, total: 6, offset: 3 }))
    colgado.write(bytes(3, 5))
    await hasta(async () => (await recibidosDe(dir)) === 5)
    const e = await falla(cierraSubida(dir, destino, 6))
    expect([e.statusCode, e.recibidos]).toEqual([409, 5])
    expect(colgado.destroyed).toBe(true)
    expect((await p).statusCode).toBe(400)
    await recibeTrozo(peticion([bytes(5, 6)]), { dir, total: 6, offset: 5 })
    expect(await cierraSubida(dir, destino, 6)).toEqual({ bytes: 6 })
    expect(fs.readFileSync(destino)).toEqual(bytes(0, 6))
  })

  it('contestaError: el 409 lleva recibidos; si no se leyó el cuerpo, cierra la conexión', () => {
    const res = () => ({
      headersSent: false, writableEnded: false, statusCode: 200, body: null, headers: {}, al: {},
      status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this },
      setHeader(k, v) { this.headers[k] = v }, on(ev, fn) { this.al[ev] = fn },
    })
    const leida = { readableEnded: true, destroy() {} }
    const a = res()
    contestaError(leida, a, Object.assign(new Error('Ese trozo no va ahí'), { statusCode: 409, recibidos: 4 }))
    expect([a.statusCode, a.body, a.headers.Connection]).toEqual([409, { error: 'Ese trozo no va ahí', recibidos: 4 }, undefined])
    let cortada = false
    const sinLeer = { readableEnded: false, destroyed: false, destroy() { cortada = true } }
    const b = res()
    contestaError(sinLeer, b, Object.assign(new Error('El trozo pesa más de 33 MB.'), { statusCode: 413 }))
    expect([b.statusCode, b.body, b.headers.Connection]).toEqual([413, { error: 'El trozo pesa más de 33 MB.' }, 'close'])
    b.al.finish()
    expect(cortada).toBe(true)
  })

  it('limpiaSubidas: fuera las que llevan horas sin recibir nada; las vivas y las cerradas, no', async () => {
    const raiz = carpeta()
    const vieja = path.join(raiz, 'vieja')
    const viva = path.join(raiz, 'viva')
    const cerrada = path.join(raiz, 'cerrada')
    for (const d of [vieja, viva, cerrada]) fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(vieja, PARTE), 'abc')
    fs.writeFileSync(path.join(vieja, 'logo.png'), 'x')
    fs.writeFileSync(path.join(viva, PARTE), 'abc')
    fs.writeFileSync(path.join(cerrada, 'original.mp4'), 'abc')
    const hace7h = new Date(Date.now() - 7 * 3_600_000)
    for (const f of [path.join(vieja, PARTE), path.join(vieja, 'logo.png'), vieja, path.join(cerrada, 'original.mp4'), cerrada]) fs.utimesSync(f, hace7h, hace7h)
    expect(await limpiaSubidas(raiz)).toBe(1)
    expect([fs.existsSync(vieja), fs.existsSync(viva), fs.existsSync(cerrada)]).toEqual([false, true, true])
    expect(await limpiaSubidas(path.join(TMP, 'no-existe'))).toBe(0)
  })
})

// ── El cliente ──────────────────────────────────────────────────────────────
// Un XMLHttpRequest de mentira: cada envío sigue el guion (o, sin guion, hace
// de servidor que lo guarda todo).
class FakeXHR {
  static guion = []
  static hechas = []
  static total = 0
  constructor() { this.upload = {}; this.headers = {}; this.status = 0; this.responseText = '' }
  open(metodo, url) { this.metodo = metodo; this.url = url }
  setRequestHeader(k, v) { this.headers[k] = v }
  abort() { this.onabort?.() }
  send(cuerpo) {
    this.cuerpo = cuerpo
    FakeXHR.hechas.push(this)
    const paso = FakeXHR.guion.shift() || servidor
    setTimeout(() => paso(this), 0)
  }
}
const offsetDe = (x) => Number(new URL(x.url, 'http://helm').searchParams.get('offset'))
const contesta = (status, datos) => (x) => { x.status = status; x.responseText = JSON.stringify(datos); x.onload() }
function servidor(x) {
  const recibidos = offsetDe(x) + x.cuerpo.size
  x.upload.onprogress?.({ loaded: Math.floor(x.cuerpo.size / 2) })
  contesta(200, { recibidos, completo: recibidos === FakeXHR.total })(x)
}
const red = (x) => x.onerror()
const URL_TROZO = '/api/editor?action=trozo&clientId=c1&id=e1'
const archivoDe = (tam) => new Blob([bytes(0, tam)])
const contenido = async (x) => Buffer.from(await x.cuerpo.arrayBuffer())

describe('subePorTrozos (cliente)', () => {
  beforeEach(() => {
    FakeXHR.guion = []
    FakeXHR.hechas = []
    FakeXHR.total = 10
    globalThis.XMLHttpRequest = FakeXHR
    globalThis.localStorage = { getItem: (k) => (k === 'bw_admin_jwt' ? 'jwt-de-prueba' : null), removeItem() {} }
  })

  it('manda los trozos en orden, con la sesión, y cuenta el progreso hasta 1', async () => {
    const progreso = []
    const r = await subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, alProgreso: (f, d) => progreso.push([f, d.cargado]) })
    expect(r).toEqual({ recibidos: 10, completo: true })
    expect(FakeXHR.hechas.map(x => x.url)).toEqual([0, 4, 8].map(o => `${URL_TROZO}&offset=${o}`))
    expect(FakeXHR.hechas.every(x => x.metodo === 'POST')).toBe(true)
    expect(FakeXHR.hechas[0].headers).toEqual({ Authorization: 'Bearer jwt-de-prueba', 'Content-Type': 'application/octet-stream' })
    expect(await Promise.all(FakeXHR.hechas.map(contenido))).toEqual([bytes(0, 4), bytes(4, 8), bytes(8, 10)])
    const fracciones = progreso.map(p => p[0])
    expect(fracciones[0]).toBe(0)
    expect(fracciones.at(-1)).toBe(1)
    expect(fracciones).toContain(0.2) // la mitad del primer trozo, mientras sube
    expect(fracciones.every((f, i) => i === 0 || f >= fracciones[i - 1])).toBe(true)
    expect(progreso.at(-1)[1]).toBe(10)
  })

  it('repite lo que falla por la red o con el servidor ocupado; lo demás, no', async () => {
    FakeXHR.guion = [red, contesta(503, { error: 'Ocupado' })]
    const r = await subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, pausa: 1 })
    expect(r.completo).toBe(true)
    expect(FakeXHR.hechas.map(offsetDe)).toEqual([0, 0, 0, 4, 8])

    FakeXHR.hechas = []
    FakeXHR.guion = Array(REINTENTOS + 1).fill(red)
    const e = await falla(subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, pausa: 1 }))
    expect(e.message).toMatch(/La subida se cortó/)
    expect(FakeXHR.hechas).toHaveLength(REINTENTOS + 1)

    FakeXHR.hechas = []
    FakeXHR.guion = [contesta(413, { error: 'El trozo pesa más de 33 MB.' })]
    const g = await falla(subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, pausa: 1 }))
    expect([g.message, g.status]).toEqual(['El trozo pesa más de 33 MB.', 413])
    expect(FakeXHR.hechas).toHaveLength(1)
  })

  it('espera el doble cada vez, hasta 15 s: unos 45 s en total para que vuelva la red', () => {
    const esperas = Array.from({ length: REINTENTOS }, (_, i) => esperaDe(1000, i))
    expect(esperas).toEqual([1000, 2000, 4000, 8000, 15000, 15000])
    expect(esperas.reduce((a, b) => a + b, 0)).toBe(45_000)
  })

  it('muchos cortes que avanzan (cada trozo se corta una vez a medias): llega entero', async () => {
    // Un servidor de verdad en pequeño: guarda los bytes; la primera vez que le
    // llega un trozo desde cada sitio, se queda con su primer byte y se corta la
    // red; al repetirlo, 409 con lo que tiene.
    FakeXHR.total = 30
    const guardado = []
    const cortados = new Set()
    const cortaUnaVez = async (x) => {
      const off = offsetDe(x)
      const trozo = Buffer.from(await x.cuerpo.arrayBuffer())
      if (off !== guardado.length) return contesta(409, { error: 'Ese trozo no va ahí', recibidos: guardado.length })(x)
      if (!cortados.has(off) && cortados.size < 10) {
        cortados.add(off)
        guardado.push(trozo[0])
        return x.onerror()
      }
      guardado.push(...trozo)
      contesta(200, { recibidos: guardado.length, completo: guardado.length === 30 })(x)
    }
    FakeXHR.guion = Array(200).fill(cortaUnaVez)
    const r = await subePorTrozos({ url: URL_TROZO, archivo: archivoDe(30), trozo: 3, pausa: 1 })
    expect(r).toEqual({ recibidos: 30, completo: true })
    expect(cortados.size).toBe(10)
    expect(Buffer.from(guardado)).toEqual(bytes(0, 30))
  })

  it('un servidor que contesta sin avanzar (o que va y viene) acaba en error', async () => {
    FakeXHR.guion = Array(20).fill(contesta(409, { error: 'Ese trozo no va ahí', recibidos: 0 }))
    const e = await falla(subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, pausa: 1 }))
    expect(e.status).toBe(409)
    expect(FakeXHR.hechas).toHaveLength(MAX_SALTOS + 1)
    // Volver a lo que ya había confirmado no es avanzar.
    FakeXHR.hechas = []
    FakeXHR.guion = Array(20).fill(0).map((_, i) => contesta(409, { recibidos: i % 2 ? 0 : 4 }))
    expect((await falla(subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, pausa: 1 }))).status).toBe(409)
    expect(FakeXHR.hechas).toHaveLength(MAX_SALTOS + 2)
  })

  it('con un 409 sigue desde lo que diga el servidor', async () => {
    FakeXHR.guion = [servidor, contesta(409, { error: 'Ese trozo no va ahí', recibidos: 8 })]
    const r = await subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, pausa: 1 })
    expect(r).toEqual({ recibidos: 10, completo: true })
    expect(FakeXHR.hechas.map(offsetDe)).toEqual([0, 4, 8])
    expect(await contenido(FakeXHR.hechas[2])).toEqual(bytes(8, 10))
    // Un 409 que dice que ya está todo, acaba.
    FakeXHR.hechas = []
    FakeXHR.guion = [contesta(409, { recibidos: 10 })]
    expect(await subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4 })).toEqual({ recibidos: 10, completo: true })
    expect(FakeXHR.hechas).toHaveLength(1)
  })

  it('empieza desde `desde` si ya se sabe lo que hay, y se puede cancelar', async () => {
    const progreso = []
    await subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, desde: 8, alProgreso: (f) => progreso.push(f) })
    expect(FakeXHR.hechas.map(offsetDe)).toEqual([8])
    expect(progreso[0]).toBe(0.8)

    const control = new AbortController()
    FakeXHR.guion = [() => {}] // no contesta nunca
    const subida = subePorTrozos({ url: URL_TROZO, archivo: archivoDe(10), trozo: 4, senal: control.signal })
    setTimeout(() => control.abort(), 5)
    const e = await falla(subida)
    expect(e.cancelada).toBe(true)
    await expect(subePorTrozos({ url: URL_TROZO, archivo: new Blob([]) })).rejects.toThrow('vacío')
  })

  it('la url del trozo, con y sin query; y el editor la reexporta', () => {
    expect(urlDeTrozo('/api/trial-reels?action=trozo&id=x', 64)).toBe('/api/trial-reels?action=trozo&id=x&offset=64')
    expect(urlDeTrozo('/subida', 0)).toBe('/subida?offset=0')
    expect(editorSubida.subePorTrozos).toBe(subePorTrozos)
    expect(editorSubida.TROZO).toBe(32 * 1024 * 1024)
    expect(editorSubida.tipoDeVideo({ name: 'Toma.MOV', type: '' })).toBe('video/quicktime')
  })
})

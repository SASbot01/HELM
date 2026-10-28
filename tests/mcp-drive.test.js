// El MCP y el Drive: desde que se quitó el vigilante de la «0 · Entrada», por
// el conector se tiene que poder seguir colocando cualquier vídeo nuevo que haya
// en la Entrada. Dos herramientas:
//   · "calendario" → sin_ordenar: lo que HAY AHORA en la Entrada (en vivo).
//     Las filas antiguas de agent_drive_videos solo completan (lo que dice el
//     vídeo, cuándo llegó) a los archivos que siguen en ella; si Drive falla,
//     viene aviso_drive en vez de una lista vacía.
//   · "ordenar_video": acepta el drive_id de un archivo de la Entrada (además
//     del video_id antiguo), y solo si Drive dice que ese archivo es un vídeo
//     que está AHORA en la Entrada de ESE perfil, tenga fila antigua o no
//     (nadie coloca algo de otro perfil ni saca un vídeo de otra fase).
// Se prueba con los tres alcances: el operador, el enlace de un perfil y el de
// una agencia. Sin red ni base: Supabase, la ingesta y Drive van simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.HELM_MCP_TOKEN = ''

// ── Base simulada: lo justo de PostgREST (filtros + insert + update) ────────
const db = {}
const escrituras = []
function consulta(tabla) {
  const filtros = []
  let op = 'select', datos = null
  const filas = () => (db[tabla] || []).filter(r => filtros.every(f => f(r)))
  const run = (una) => {
    if (op === 'insert') {
      const nueva = { id: `${tabla}-${(db[tabla] || []).length + 1}`, ...datos }
      ;(db[tabla] ||= []).push(nueva); escrituras.push({ tabla, op, datos })
      return { data: una ? nueva : [nueva], error: null }
    }
    if (op === 'update') {
      const tocadas = filas()
      for (const r of tocadas) Object.assign(r, datos)
      escrituras.push({ tabla, op, datos, n: tocadas.length })
      return { data: null, error: null }
    }
    const d = filas()
    return { data: una ? (d[0] || null) : d, error: null }
  }
  const q = {
    select() { return q },
    eq(c, v) { filtros.push(r => r[c] === v); return q },
    neq(c, v) { filtros.push(r => r[c] !== v); return q },
    in(c, vs) { filtros.push(r => vs.includes(r[c])); return q },
    is(c, v) { filtros.push(r => (r[c] ?? null) === v); return q },
    order() { return q }, limit() { return q }, range() { return q },
    insert(d) { op = 'insert'; datos = Array.isArray(d) ? d[0] : d; return q },
    update(d) { op = 'update'; datos = d; return q },
    single() { return Promise.resolve(run(true)) },
    maybeSingle() { return Promise.resolve(run(true)) },
    then(ok, ko) { return Promise.resolve(run(false)).then(ok, ko) },
  }
  return q
}
vi.mock('../api/lib/supabase.js', () => ({ supabase: { from: (t) => consulta(t) } }))

// ── La ingesta y Drive simulados ────────────────────────────────────────────
const TIPOS = { viralidad: 'Viralidad', conversion: 'Conversión', autoridad: 'Autoridad', venta: 'Venta' }
const FASES = { por_grabar: 'Por grabar', sin_editar: 'Sin editar', editado: 'Editado', publicado: 'Publicado' }
// Lo que devuelve enEntrada(clientId): los vídeos que hay ahora en su Entrada.
const ENTRADA = {}
// Las carpetas de cada perfil: su "0 · Entrada" y su "1 · Sin editar" (y tipos).
const CARPETAS = {}
// Los archivos (y carpetas) de Drive por id, con su padre: así se comprueba
// dónde está cada uno.
const DRIVE = {}
const movimientos = []
// Cada id que se le pregunta a Drive: un id raro no tiene que llegar aquí.
const pedidasDrive = []
const fallos = { entrada: null, drive: null }
vi.mock('../api/_lib/ingesta.js', () => ({
  TIPOS, FASES,
  calendario: async () => [],
  enEntrada: async (clientId) => {
    if (fallos.entrada) throw fallos.entrada
    return ENTRADA[clientId] || []
  },
  carpetasDe: async (clientId) => CARPETAS[clientId] || null,
  ordenar: async ({ driveId, desde, guion, tipo }) => {
    const t = guion?.tipo || tipo || 'autoridad'
    movimientos.push({ driveId, desde, guion: guion?.id || null, tipo: t })
    return { pieza: `pieza-${guion?.id || t}`, destino: `1 · Sin editar / ${TIPOS[t]}` }
  },
}))
vi.mock('../api/_lib/drive-helm.js', () => ({
  archivo: async (id) => {
    pedidasDrive.push(id)
    if (fallos.drive) throw fallos.drive
    if (!DRIVE[id]) throw Object.assign(new Error(`Drive 404: File not found: ${id}.`), { status: 404 })
    return DRIVE[id]
  },
}))

const { ejecutaHerramienta, DEL_CLIENTE } = await import('../api/mcp/[token].js')

const GUION = '11111111-1111-4111-8111-111111111111'
// Ids con forma de id de Drive (letras, números, "_" y "-", 10 o más).
const NUEVO = 'fNuevo_0123456789'
const VIEJO = 'fViejo_0123456789'
const AJENO = 'fAjeno_0123456789'
const EDITADO = 'fEditado_0123456789'
const COLOCADO = 'fColocado_0123456789'
const BORRADO = 'fBorrado_0123456789'
const FOTO = 'fFoto_0123456789'

const video = (id, name, padre, extra = {}) => ({ id, name, mimeType: 'video/mp4', parents: [padre], trashed: false, ...extra })

function semilla() {
  for (const k of Object.keys(db)) delete db[k]
  escrituras.length = 0; movimientos.length = 0; pedidasDrive.length = 0
  fallos.entrada = null; fallos.drive = null
  db.clients = [
    { id: 'p1', slug: 'detras-de-camra', name: 'Detrás de Cámara', agencia_id: 'ag1', active: true },
    { id: 'p2', slug: 'otra', name: 'Otra', agencia_id: 'ag2', active: true },
    { id: 'p3', slug: 'tercero', name: 'Tercero', agencia_id: 'ag1', active: true },
  ]
  db.helm_content_calendar = [
    { id: GUION, client_id: 'p1', date: '2026-10-20', title: 'Tres errores', body: 'Si entrenas así, para.', tipo: 'viralidad', grabado_at: null, drive_carpeta_id: null },
  ]
  db.agent_drive_videos = [
    // Una fila que dejó el automático de antes, cuyo vídeo sigue en la Entrada.
    { drive_id: VIEJO, client_id: 'p1', nombre: 'viejo.mp4', estado: 'sin_guion', destino: null, calendario_id: null, transcripcion: 'texto que dejó el automático de antes', created_at: '2026-10-18T09:00:00Z' },
    // Otra cuyo vídeo ya salió de la Entrada (alguien lo movió a "2 · Editados").
    { drive_id: EDITADO, client_id: 'p1', nombre: 'editado.mp4', estado: 'sin_guion', destino: null, calendario_id: null, transcripcion: 'ya editado', created_at: '2026-10-10T09:00:00Z' },
  ]
  db.agent_ejecuciones = []
  for (const k of Object.keys(ENTRADA)) delete ENTRADA[k]
  for (const k of Object.keys(CARPETAS)) delete CARPETAS[k]
  for (const k of Object.keys(DRIVE)) delete DRIVE[k]
  CARPETAS.p1 = {
    entrada: 'ENTRADA-P1', sinEditar: 'SINEDITAR-P1', editados: 'EDITADOS-P1', raiz: 'R1', nombre: 'DDC',
    sinEditarTipo: { viralidad: 'SE-VIR-P1', conversion: 'SE-CON-P1', autoridad: 'SE-AUT-P1', venta: 'SE-VEN-P1' },
  }
  CARPETAS.p2 = { entrada: 'ENTRADA-P2', sinEditar: 'SINEDITAR-P2', raiz: 'R2', nombre: 'Otra', sinEditarTipo: { autoridad: 'SE-AUT-P2' } }
  CARPETAS.p3 = { entrada: 'ENTRADA-P3', sinEditar: 'SINEDITAR-P3', raiz: 'R3', nombre: 'Tercero', sinEditarTipo: { autoridad: 'SE-AUT-P3' } }
  ENTRADA.p1 = [
    { id: NUEVO, name: 'toma1.mp4', mimeType: 'video/mp4', createdTime: '2026-10-25T10:00:00Z' },
    { id: VIEJO, name: 'viejo.mp4', mimeType: 'video/mp4', createdTime: '2026-10-01T10:00:00Z' },
  ]
  DRIVE[NUEVO] = video(NUEVO, 'toma1.mp4', 'ENTRADA-P1')
  DRIVE[VIEJO] = video(VIEJO, 'viejo.mp4', 'ENTRADA-P1')
  DRIVE[EDITADO] = video(EDITADO, 'editado.mp4', 'EDITADOS-P1')
  // Ya colocado: dentro de una pieza de "1 · Sin editar / Autoridad".
  DRIVE['PIEZA-AUT-P1'] = { id: 'PIEZA-AUT-P1', name: '2026-10-19 · Algo', mimeType: 'application/vnd.google-apps.folder', parents: ['SE-AUT-P1'] }
  DRIVE[COLOCADO] = video(COLOCADO, 'colocado.mp4', 'PIEZA-AUT-P1')
  DRIVE[BORRADO] = video(BORRADO, 'borrado.mp4', 'ENTRADA-P1', { trashed: true })
  DRIVE[FOTO] = { id: FOTO, name: 'portada.jpg', mimeType: 'image/jpeg', parents: ['ENTRADA-P1'], trashed: false }
  // Un archivo que está en la Entrada de OTRO perfil: p1 no lo puede mover.
  DRIVE[AJENO] = video(AJENO, 'secreto-del-otro.mp4', 'ENTRADA-P2')
}
beforeEach(semilla)

const OP = { operador: true }
const PERFIL = { clientId: 'p1', slug: 'detras-de-camra', nombre: 'Detrás de Cámara' }
const AGENCIA = {
  agenciaId: 'ag1', nombre: 'Silvestre AI',
  perfiles: [{ id: 'p1', slug: 'detras-de-camra', name: 'Detrás de Cámara' }, { id: 'p3', slug: 'tercero', name: 'Tercero' }],
}
const correr = async (nombre, args, alcance = OP) => {
  const x = await ejecutaHerramienta(nombre, args, alcance)
  return { ...x, datos: x.ok ? JSON.parse(x.texto) : null }
}

describe('MCP · calendario → sin_ordenar es la Entrada en vivo', () => {
  it('lista lo que hay AHORA en la Entrada; la fila antigua solo completa lo que dice y cuándo llegó', async () => {
    const { ok, datos } = await correr('calendario', { perfil: 'detras-de-camra' })
    expect(ok).toBe(true)
    expect(datos.sin_ordenar.map(v => v.video_id).sort()).toEqual([NUEVO, VIEJO].sort())
    const vivo = datos.sin_ordenar.find(v => v.video_id === NUEVO)
    expect(vivo).toEqual({ video_id: NUEVO, nombre: 'toma1.mp4', llego: '2026-10-25T10:00:00Z' })
    const viejo = datos.sin_ordenar.find(v => v.video_id === VIEJO)
    expect(viejo.nombre).toBe('viejo.mp4')
    expect(viejo.dice).toContain('automático')
    expect(viejo.llego).toBe('2026-10-18T09:00:00Z')
    expect(datos.aviso_drive).toBeUndefined()
  })

  it('una fila antigua cuyo vídeo ya salió de la Entrada no se lista', async () => {
    const { datos } = await correr('calendario', { perfil: 'detras-de-camra' })
    expect(datos.sin_ordenar.some(v => v.video_id === EDITADO)).toBe(false)
  })

  it('con la Entrada vacía, sin_ordenar viene vacío aunque haya filas antiguas', async () => {
    ENTRADA.p1 = []
    const { datos } = await correr('calendario', { perfil: 'detras-de-camra' })
    expect(datos.sin_ordenar).toEqual([])
  })

  it('si Drive falla, dice por qué (aviso_drive) en vez de dar una lista vacía', async () => {
    fallos.entrada = new Error('Falta la llave de helm-drive en /x/.google-drive-sa.json')
    const { ok, datos } = await correr('calendario', { perfil: 'detras-de-camra' })
    expect(ok).toBe(true)
    expect(datos.sin_ordenar).toBeUndefined()
    expect(datos.aviso_drive).toBe('No pude mirar la Entrada: Falta la llave de helm-drive en /x/.google-drive-sa.json')
  })
})

describe('MCP · ordenar_video acepta el drive_id de un archivo de la Entrada', () => {
  it('coloca un archivo nuevo de la Entrada en la pieza de su guion, sin escribir agent_drive_videos', async () => {
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: NUEVO, guion_id: GUION })
    expect(ok).toBe(true)
    expect(datos.movido_a).toBe('1 · Sin editar / Viralidad')
    expect(datos.video).toBe('toma1.mp4')
    expect(movimientos).toEqual([{ driveId: NUEVO, desde: 'ENTRADA-P1', guion: GUION, tipo: 'viralidad' }])
    // No hay fila para NUEVO: la tabla ya no se escribe para archivos sueltos.
    expect(escrituras.some(e => e.tabla === 'agent_drive_videos' && e.op === 'update')).toBe(false)
  })

  it('sin guion, con el tipo, va a "1 · Sin editar / <tipo>", a la pieza "Sin guion" del día', async () => {
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: NUEVO, tipo: 'autoridad' })
    expect(ok).toBe(true)
    expect(datos.movido_a).toBe('1 · Sin editar / Autoridad')
    expect(datos.hecho).toContain(`"Sin guion · ${new Date().toISOString().slice(0, 10)}"`)
    expect(movimientos[0]).toMatchObject({ driveId: NUEVO, guion: null, tipo: 'autoridad' })
  })

  it('prueba=true valida la Entrada pero no mueve ni escribe nada', async () => {
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: NUEVO, guion_id: GUION, prueba: true })
    expect(ok).toBe(true)
    expect(datos.prueba).toBe(true)
    expect(movimientos).toEqual([])
    expect(escrituras).toEqual([])
  })

  it('la descripción le dice a Claude que pregunte si no está claro el guion y adónde va sin guion', async () => {
    const { herramientasDe } = await import('../api/mcp/[token].js')
    const d = herramientasDe(OP).find(t => t.name === 'ordenar_video').description
    expect(d).toContain('pregúntalo; no adivines')
    expect(d).toContain('"Sin guion · AAAA-MM-DD"')
  })
})

describe('MCP · ordenar_video no deja mover lo que no está en la Entrada del perfil', () => {
  it('un archivo de la Entrada de OTRO perfil da error, sin decir cómo se llama', async () => {
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: AJENO, tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('no está en la "0 · Entrada" de detras-de-camra')
    expect(x.texto).not.toContain('secreto-del-otro')
    expect(movimientos).toEqual([])
  })

  it('un archivo que no existe en Drive (404) da "No encuentro el archivo"', async () => {
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: 'noExiste_0123456789', tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('No encuentro el archivo')
    expect(movimientos).toEqual([])
  })

  it('otro fallo de Drive no se confunde con un 404', async () => {
    fallos.drive = Object.assign(new Error('Drive 500: backendError'), { status: 500 })
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: NUEVO, tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('No pude mirar el archivo en Drive')
    expect(x.texto).toContain('Drive 500')
    expect(x.texto).not.toContain('No encuentro')
    expect(movimientos).toEqual([])
  })

  it('el mismo drive_id contra otro perfil se comprueba contra la Entrada de ESE perfil', async () => {
    // NUEVO está en la Entrada de p1, no en la de p2: por el perfil "otra" falla.
    const x = await correr('ordenar_video', { perfil: 'otra', drive_id: NUEVO, tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('Entrada')
    expect(movimientos).toEqual([])
  })

  it('un archivo en la papelera da error', async () => {
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: BORRADO, tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('papelera')
    expect(movimientos).toEqual([])
  })

  it('algo que no es un vídeo da error', async () => {
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: FOTO, tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('no es un vídeo')
    expect(movimientos).toEqual([])
  })

  it('un drive_id con caracteres raros da error sin preguntar a Drive', async () => {
    for (const raro of ['../ENTRADA-P2/x', 'abc?fields=*&x=1', 'corto', 'id con espacios 123', `${'a'.repeat(129)}`]) {
      const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: raro, tipo: 'autoridad' })
      expect(x.ok).toBe(false)
      expect(x.texto).toContain('drive_id no válido')
    }
    expect(pedidasDrive).toEqual([])
    expect(movimientos).toEqual([])
  })

  it('sin drive_id ni video_id, dice qué pasar', async () => {
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('drive_id')
  })
})

describe('MCP · ordenar_video con el video_id antiguo (fila en agent_drive_videos)', () => {
  it('mueve el vídeo de una fila vieja que sigue en la Entrada y la marca "ordenado"', async () => {
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', video_id: VIEJO, tipo: 'autoridad' })
    expect(ok).toBe(true)
    expect(datos.movido_a).toBe('1 · Sin editar / Autoridad')
    expect(movimientos[0]).toMatchObject({ driveId: VIEJO, desde: 'ENTRADA-P1', tipo: 'autoridad' })
    expect(db.agent_drive_videos.find(v => v.drive_id === VIEJO).estado).toBe('ordenado')
  })

  it('una fila vieja cuyo vídeo ya no está en la Entrada (p. ej. en "2 · Editados") da error y no se mueve', async () => {
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', video_id: EDITADO, tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('no está en la "0 · Entrada"')
    expect(movimientos).toEqual([])
    expect(db.agent_drive_videos.find(v => v.drive_id === EDITADO).estado).toBe('sin_guion')
  })

  it('una fila que dice "ordenado" pero cuyo vídeo sigue en la Entrada se coloca: manda Drive', async () => {
    const fila = db.agent_drive_videos.find(v => v.drive_id === VIEJO)
    fila.estado = 'ordenado'; fila.destino = '1 · Sin editar / Autoridad'
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', video_id: VIEJO, tipo: 'autoridad' })
    expect(ok).toBe(true)
    expect(datos.ya_estaba).toBeUndefined()
    expect(movimientos).toHaveLength(1)
  })
})

describe('MCP · ordenar_video con un vídeo que ya está en su "1 · Sin editar"', () => {
  it('devuelve ya_estaba (no error) y no lo vuelve a mover', async () => {
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: COLOCADO, tipo: 'autoridad' })
    expect(ok).toBe(true)
    expect(datos.ya_estaba).toBe(true)
    expect(datos.movido_a).toBe('1 · Sin editar / Autoridad')
    expect(movimientos).toEqual([])
    expect(escrituras.some(e => e.tabla === 'agent_drive_videos')).toBe(false)
  })

  it('si se pide otro tipo, dice dónde está y que se mueva a mano', async () => {
    const { ok, datos } = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: COLOCADO, tipo: 'venta' })
    expect(ok).toBe(true)
    expect(datos.ya_estaba).toBe(true)
    expect(datos.hecho).toContain('1 · Sin editar / Venta')
    expect(datos.hecho).toContain('a mano')
    expect(movimientos).toEqual([])
  })

  it('el "1 · Sin editar" de OTRO perfil no cuenta: es un error', async () => {
    DRIVE['PIEZA-AUT-P2'] = { id: 'PIEZA-AUT-P2', name: 'pieza', mimeType: 'application/vnd.google-apps.folder', parents: ['SE-AUT-P2'] }
    DRIVE.fColocadoOtro_0123 = video('fColocadoOtro_0123', 'del-otro.mp4', 'PIEZA-AUT-P2')
    const x = await correr('ordenar_video', { perfil: 'detras-de-camra', drive_id: 'fColocadoOtro_0123', tipo: 'autoridad' })
    expect(x.ok).toBe(false)
    expect(x.texto).not.toContain('del-otro')
  })
})

// El enlace de un perfil y el de una agencia: el perfil lo fija el enlace, y
// lo que no esté en SU Entrada no se mueve aunque se pida otro perfil.
describe.each([
  ['el enlace de un perfil', PERFIL, {}],
  ['el enlace de una agencia', AGENCIA, { perfil: 'detras-de-camra' }],
])('MCP · ordenar_video con %s', (_, alcance, base) => {
  it('mueve un vídeo de la Entrada de su perfil', async () => {
    const { ok, datos } = await correr('ordenar_video', { ...base, drive_id: NUEVO, guion_id: GUION }, alcance)
    expect(ok).toBe(true)
    expect(datos.movido_a).toBe('1 · Sin editar / Viralidad')
    expect(movimientos).toEqual([{ driveId: NUEVO, desde: 'ENTRADA-P1', guion: GUION, tipo: 'viralidad' }])
  })

  it('no mueve un archivo de la Entrada de otro perfil', async () => {
    const x = await correr('ordenar_video', { ...base, drive_id: AJENO, tipo: 'autoridad' }, alcance)
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('Entrada')
    expect(x.texto).not.toContain('secreto-del-otro')
    expect(movimientos).toEqual([])
  })

  it('no mueve un archivo que está fuera de la Entrada', async () => {
    const x = await correr('ordenar_video', { ...base, video_id: EDITADO, tipo: 'autoridad' }, alcance)
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('no está en la "0 · Entrada"')
    expect(movimientos).toEqual([])
  })

  it('un drive_id con caracteres raros da error sin preguntar a Drive', async () => {
    const x = await correr('ordenar_video', { ...base, drive_id: "x' or 1=1 --", tipo: 'autoridad' }, alcance)
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('drive_id no válido')
    expect(pedidasDrive).toEqual([])
    expect(movimientos).toEqual([])
  })

  it('la lista de la Entrada es la de su perfil', async () => {
    ENTRADA.p2 = [{ id: AJENO, name: 'secreto-del-otro.mp4', mimeType: 'video/mp4', createdTime: '2026-10-25T10:00:00Z' }]
    const { ok, datos } = await correr('calendario', { ...base }, alcance)
    expect(ok).toBe(true)
    expect(datos.sin_ordenar.map(v => v.video_id)).not.toContain(AJENO)
    expect(datos.sin_ordenar.map(v => v.video_id)).toContain(NUEVO)
  })
})

describe('MCP · el enlace no deja escoger otro perfil', () => {
  it('con el enlace de un perfil, pedir "otra" sigue siendo su perfil: lo ajeno no se mueve', async () => {
    const x = await correr('ordenar_video', { perfil: 'otra', drive_id: AJENO, tipo: 'autoridad' }, PERFIL)
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('detras-de-camra')
    expect(movimientos).toEqual([])
  })

  it('con el enlace de una agencia, un perfil que no es suyo da error sin preguntar a Drive', async () => {
    const x = await correr('ordenar_video', { perfil: 'otra', drive_id: AJENO, tipo: 'autoridad' }, AGENCIA)
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('Di para qué perfil')
    expect(pedidasDrive).toEqual([])
    expect(movimientos).toEqual([])
  })

  it('con el enlace de una agencia, el vídeo de la Entrada de un perfil no vale para su otro perfil', async () => {
    const x = await correr('ordenar_video', { perfil: 'tercero', drive_id: NUEVO, tipo: 'autoridad' }, AGENCIA)
    expect(x.ok).toBe(false)
    expect(x.texto).toContain('no está en la "0 · Entrada" de tercero')
    expect(movimientos).toEqual([])
  })
})

describe('MCP · el enlace de un perfil también puede ordenar vídeos', () => {
  it('ordenar_video está entre las herramientas del cliente', () => {
    expect(DEL_CLIENTE).toContain('ordenar_video')
    expect(DEL_CLIENTE).toContain('calendario')
  })
})

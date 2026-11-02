// HELM — Email marketing: de lo que escribe el dueño al correo que sale.
//
// El cuerpo se escribe en texto plano con un formato mínimo, que es lo que se
// puede explicar en una línea debajo del cuadro:
//
//   **negrita** · *cursiva* · [texto](https://enlace) · las URL sueltas
//   se enlazan solas · líneas que empiezan por «- » son una lista · «# » es un
//   titular · una línea en blanco separa párrafos
//
// y unas variables: {{nombre}}, {{primer_nombre}}, {{email}} y {{empresa}},
// con valor por defecto si falta el dato: {{nombre|amigo}}.
//
// Lo que importa aquí es que el HTML sea seguro. Los nombres del CRM los
// escribe cualquiera en un formulario público: un «nombre» con
// `<img onerror>` o con `[pincha](https://otra-web)` no puede convertirse en
// HTML ni en un enlace. Por eso las variables se cambian por marcas antes de
// interpretar el formato y su valor entra al final, escapado (y, dentro de un
// enlace, codificado como parte de la URL).
//
// Puro: sin base ni red. Lo usan el panel (api/email-marketing.js, la prueba)
// y el worker (./motor.js), y tiene que salir lo mismo byte a byte en cada
// repetición: la Idempotency-Key de Resend exige el mismo cuerpo.

export const VARIABLES = ['nombre', 'primer_nombre', 'email', 'empresa']

export const TOPES = {
  asunto: 200,
  cuerpo: 20_000,
  nombreCampana: 120,
  mensajes: 10,
  esperaDias: 365,
  porDefecto: 60,
}

const VAR_RE = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^{}\n]*))?\}\}/g
// Marcas de uso privado: no las escribe nadie y no las toca el formato.
const ABRE = ''
const CIERRA = ''
const MARCA_RE = /(\d+)/g

export const escapa = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Las variables que no existen en un texto (para avisar al guardar, no al mandar). */
export function variablesDesconocidas(texto) {
  const malas = new Set()
  for (const m of String(texto ?? '').matchAll(VAR_RE)) {
    if (!VARIABLES.includes(m[1].toLowerCase())) malas.add(m[1])
  }
  return [...malas]
}

/** Los valores de las variables para una persona. */
export function valoresDe({ nombre, email } = {}, { empresa } = {}) {
  const limpio = String(nombre ?? '').replace(/\s+/g, ' ').trim()
  return {
    nombre: limpio,
    primer_nombre: limpio.split(' ')[0] || '',
    email: String(email ?? '').trim(),
    empresa: String(empresa ?? '').trim(),
  }
}

// Las variables → marcas; devuelve el texto marcado y lo que vale cada marca.
function marca(texto, valores) {
  const lista = []
  const marcado = String(texto ?? '').replace(/[]/g, '').replace(VAR_RE, (todo, clave, defecto) => {
    const k = clave.toLowerCase()
    if (!VARIABLES.includes(k)) return todo
    const v = valores[k] || String(defecto ?? '').trim().slice(0, TOPES.porDefecto)
    lista.push(v)
    return `${ABRE}${lista.length - 1}${CIERRA}`
  })
  return { marcado, lista }
}

const sustituye = (s, lista, como) => s.replace(MARCA_RE, (_, n) => como(lista[Number(n)] ?? ''))

/** Un texto de una línea con las variables puestas (el asunto). Sin saltos de línea. */
export function rellena(texto, valores) {
  const { marcado, lista } = marca(texto, valores)
  return sustituye(marcado, lista, v => v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Negrita y cursiva sobre texto YA escapado (los asteriscos no se escapan).
const formato = (t) => escapa(t)
  .replace(/\*\*(?=\S)([^*\n]+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>')

const ENLACE_RE = /\[([^\]\n]{1,300})\]\(([^()\s]{1,2000})\)|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g
const URL_VALIDA = /^(https?:\/\/[^\s"'<>\\]+|mailto:[^\s"'<>\\]+)$/i

// Una línea con su formato y sus enlaces. Los enlaces se buscan en el texto en
// crudo (antes de escapar) y lo que hay entre ellos se formatea aparte: así un
// asterisco de una URL nunca acaba metiendo un <strong> dentro de un href.
function enLinea(crudo, lista) {
  let out = ''
  let i = 0
  for (const m of crudo.matchAll(ENLACE_RE)) {
    out += formato(crudo.slice(i, m.index))
    const [todo, texto, url, suelta] = m
    const destino = sustituye(url ?? suelta, lista, encodeURIComponent)
    if (!URL_VALIDA.test(destino)) out += formato(todo)
    else out += `<a href="${escapa(destino)}" style="color:#1a56db;text-decoration:underline">${texto != null ? formato(texto) : escapa(suelta)}</a>`
    i = m.index + todo.length
  }
  return out + formato(crudo.slice(i))
}

const P = 'margin:0 0 16px'
const ES_LISTA = /^\s*[-•]\s+/
const ES_TITULAR = /^#{1,3}\s+/

// Un bloque (lo que va entre líneas en blanco) en tramos: las líneas de lista
// seguidas son una lista, un «# » suelto es un titular y lo demás, párrafo.
// Así una lista pegada a la frase que la presenta también sale como lista.
function tramos(lineas) {
  const out = []
  for (const l of lineas) {
    const tipo = ES_LISTA.test(l) ? 'lista' : ES_TITULAR.test(l) ? 'titular' : 'parrafo'
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.tipo === tipo && tipo !== 'titular') ultimo.lineas.push(l)
    else out.push({ tipo, lineas: [l] })
  }
  return out
}

/** El cuerpo → HTML seguro (sin el envoltorio ni el pie). */
export function cuerpoHtml(texto, valores) {
  const { marcado, lista } = marca(String(texto ?? '').replace(/\r\n?/g, '\n'), valores)
  const bloques = marcado.split(/\n[ \t]*\n/).map(b => b.replace(/^\n+|\s+$/g, '')).filter(b => b.trim())
  const html = bloques.flatMap(b => tramos(b.split('\n'))).map(({ tipo, lineas }) => {
    if (tipo === 'lista') {
      return `<ul style="${P};padding-left:22px">${lineas.map(l => `<li style="margin:0 0 6px">${enLinea(l.replace(ES_LISTA, ''), lista)}</li>`).join('')}</ul>`
    }
    if (tipo === 'titular') {
      return `<h2 style="margin:0 0 14px;font-size:20px;line-height:1.3">${enLinea(lineas[0].replace(ES_TITULAR, ''), lista)}</h2>`
    }
    return `<p style="${P}">${lineas.map(l => enLinea(l, lista)).join('<br>')}</p>`
  }).join('\n')
  return sustituye(html, lista, escapa)
}

// Dentro de una URL, la marca de una variable cambia a esta otra: al final se
// pone codificada (encodeURIComponent) y no tal cual.
const ABRE_URL = '\uE002'
const CIERRA_URL = '\uE003'
const MARCA_URL_RE = /\uE002(\d+)\uE003/g

/** El cuerpo → texto plano (la parte text/plain del correo). */
export function cuerpoTexto(texto, valores) {
  const { marcado, lista } = marca(String(texto ?? '').replace(/[\uE002\uE003]/g, '').replace(/\r\n?/g, '\n'), valores)
  const plano = marcado
    .replace(/\[([^\]\n]{1,300})\]\(([^()\s]{1,2000})\)/g, (_, t, u) => `${t} (${u.replace(MARCA_RE, (__, n) => `${ABRE_URL}${n}${CIERRA_URL}`)})`)
    .replace(/\*\*(?=\S)([^*\n]+?)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?![*\w])/g, '$1$2')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // Los valores entran al final: lo que traiga un nombre no se interpreta como formato.
  return sustituye(plano, lista, v => v).replace(MARCA_URL_RE, (_, n) => encodeURIComponent(lista[Number(n)] ?? ''))
}

// El pie legal (LSSI, art. 20 y 21): quién manda el correo, desde dónde, y
// cómo dejar de recibirlos con un clic. Va en TODOS los correos, también en
// las pruebas.
function pieHtml({ empresa, direccion }, enlaceBaja) {
  const quien = [empresa && `<strong>${escapa(empresa)}</strong>`, direccion && escapa(direccion)].filter(Boolean).join(' · ')
  return `Recibes este correo de ${quien}.<br>Si no quieres recibir más, <a href="${escapa(enlaceBaja)}" style="color:#6b7280;text-decoration:underline">date de baja aquí</a> y no te escribiremos más.`
}
function pieTexto({ empresa, direccion }, enlaceBaja) {
  return `--\nRecibes este correo de ${[empresa, direccion].filter(Boolean).join(' · ')}.\nSi no quieres recibir más, date de baja aquí: ${enlaceBaja}`
}

/** El remitente para la cabecera From: «"Nombre" <correo>», sin nada que rompa la cabecera. */
export function remitenteDe({ nombre, email } = {}) {
  const n = String(nombre ?? '').replace(/[\r\n]+/g, ' ').replace(/["<>\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return n ? `"${n}" <${email}>` : String(email)
}

/**
 * Un correo de la campaña para una persona.
 * @param {object} p
 * @param {{ asunto: string, cuerpo: string }} p.mensaje
 * @param {{ nombre?: string, email: string }} p.persona
 * @param {{ nombre, email, responderA, empresa, direccion }} p.remitente
 * @param {string} p.enlaceBaja
 * @param {string} [p.prefijo] delante del asunto (las pruebas)
 * @returns {{ subject, html, text }}
 */
export function componerCorreo({ mensaje, persona, remitente, enlaceBaja, prefijo = '' }) {
  const valores = valoresDe(persona, remitente)
  const subject = `${prefijo}${rellena(mensaje.asunto, valores)}`.slice(0, 250)
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapa(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<div style="max-width:600px;margin:0 auto;padding:28px 22px;background:#ffffff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2328">
${cuerpoHtml(mensaje.cuerpo, valores)}
<hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0 14px">
<p style="margin:0;font-size:12px;line-height:1.55;color:#6b7280">${pieHtml(remitente, enlaceBaja)}</p>
</div>
</body></html>`
  const text = `${cuerpoTexto(mensaje.cuerpo, valores)}\n\n${pieTexto(remitente, enlaceBaja)}\n`
  return { subject, html, text }
}

/**
 * Lo que se le manda a Resend por un correo: el compuesto, el remitente y las
 * cabeceras de baja de un clic (RFC 8058, las que piden Gmail y Yahoo).
 */
export function cargaResend({ compuesto, para, remitente, enlaceBaja, etiquetas = {} }) {
  const carga = {
    from: remitenteDe(remitente),
    to: [para],
    subject: compuesto.subject,
    html: compuesto.html,
    text: compuesto.text,
    headers: {
      'List-Unsubscribe': `<${enlaceBaja}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
  if (remitente.responderA) carga.reply_to = remitente.responderA
  // Resend solo admite letras, cifras, _ y - en las etiquetas.
  const tags = Object.entries(etiquetas)
    .map(([name, value]) => ({ name, value: String(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 256) }))
    .filter(t => t.value)
  if (tags.length) carga.tags = tags
  return carga
}

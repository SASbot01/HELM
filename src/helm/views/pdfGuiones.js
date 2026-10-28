// HELM — PDF de guiones en el formato de las "Tandas": portada + tabla
// «Calendario» por día + los guiones completos agrupados por tipo, cada uno con
// su molde de referencia. Se genera abriendo una ventana con el HTML maquetado y
// lanzando la impresión del navegador (Guardar como PDF), como ya hace la vista
// de Documentos — sin librerías.

const TIPOS_LBL = { viralidad: 'Viralidad', autoridad: 'Autoridad', conversion: 'Valor', venta: 'Venta' }
const CTA_DE = { viralidad: 'Alcance', autoridad: 'Confianza', conversion: 'Leads · DM', venta: 'Venta' }
const ORDEN = ['viralidad', 'autoridad', 'conversion', 'venta']

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '') : '—')
const hoyLargo = () => new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

// El cuerpo lleva el guion y, tras "\n\n---\n", la referencia y la nota de gancho.
function parse(body) {
  const partes = String(body || '').split('\n\n---\n')
  let ref = ''
  for (const p of partes.slice(1)) { const t = p.trim(); if (/^inspirado en:/i.test(t)) ref = t.replace(/^inspirado en:\s*/i, '') }
  return { script: partes[0] || '', ref }
}
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1">$1</a>')

/**
 * Abre la vista imprimible (→ Guardar como PDF) de una tanda de guiones.
 * @param {object[]} guiones filas de helm_content_calendar (con body)
 * @param {object} o { perfil, desde, hasta } para la portada
 */
export function descargarPDFGuiones(guiones, { perfil = '', desde, hasta } = {}) {
  const gs = [...(guiones || [])].filter(g => g.title).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!gs.length) { alert('No hay guiones en este periodo para descargar.'); return }
  const rango = desde && hasta ? `${fechaCorta(desde)} – ${fechaCorta(hasta)}` : (gs.length ? `${fechaCorta(gs[0].date)} – ${fechaCorta(gs.at(-1).date)}` : '')

  const filas = gs.map(g => {
    const { ref } = parse(g.body)
    return `<tr><td>${esc(fechaCorta(g.date))}</td><td>${esc(g.title)}</td><td>${esc(TIPOS_LBL[g.tipo] || '—')}</td><td>${esc(ref).slice(0, 120) || '—'}</td><td>${esc(CTA_DE[g.tipo] || '')}</td></tr>`
  }).join('')

  const secciones = ORDEN.map(tipo => {
    const items = gs.filter(g => g.tipo === tipo)
    if (!items.length) return ''
    const cuerpo = items.map(g => {
      const { script, ref } = parse(g.body)
      return `<article class="g"><h3>${esc(g.title)} <small>· ${esc(fechaCorta(g.date))}</small></h3>${ref ? `<p class="ref"><b>Molde de referencia:</b> ${linkify(ref)}</p>` : ''}<pre>${esc(script)}</pre></article>`
    }).join('')
    return `<section class="sec"><h2>${esc(TIPOS_LBL[tipo])} (${items.length})</h2>${cuerpo}</section>`
  }).join('')
  const sinTipo = gs.filter(g => !TIPOS_LBL[g.tipo])
  const extra = sinTipo.length ? `<section class="sec"><h2>Otros (${sinTipo.length})</h2>${sinTipo.map(g => { const { script, ref } = parse(g.body); return `<article class="g"><h3>${esc(g.title)} <small>· ${esc(fechaCorta(g.date))}</small></h3>${ref ? `<p class="ref"><b>Molde de referencia:</b> ${linkify(ref)}</p>` : ''}<pre>${esc(script)}</pre></article>` }).join('')}</section>` : ''

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guiones ${esc(rango)}</title><style>
    @page { margin: 1.8cm; }
    * { box-sizing: border-box; }
    body { font: 15px/1.6 Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 820px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 33px; margin: 0 0 6px; letter-spacing: -.01em; }
    .meta { color: #6a6a6a; margin: 0 0 30px; font-size: 14px; }
    h2 { font-size: 21px; margin: 32px 0 12px; border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
    th { color: #8a8a8a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .sec { break-inside: auto; }
    .g { margin: 0 0 18px; break-inside: avoid; }
    .g h3 { font-size: 17px; margin: 0 0 3px; }
    .g h3 small { color: #8a8a8a; font-weight: normal; }
    .ref { font-style: italic; color: #555; margin: 1px 0 8px; font-size: 13.5px; }
    .g pre { white-space: pre-wrap; font: 14px/1.62 Georgia, serif; margin: 0; }
    a { color: #1a1a1a; }
    @media print { a { text-decoration: none; } }
  </style></head><body>
    <h1>Guiones · ${esc(rango)}</h1>
    <p class="meta">${esc(perfil || 'Perfil')} · ${gs.length} ${gs.length === 1 ? 'guion' : 'guiones'} · ${hoyLargo()}</p>
    <h2>Calendario</h2>
    <table><thead><tr><th>Fecha</th><th>Guion</th><th>Tipo</th><th>Molde de referencia</th><th>CTA</th></tr></thead><tbody>${filas}</tbody></table>
    ${secciones}${extra}
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Permite las ventanas emergentes para descargar el PDF.'); return }
  w.document.open(); w.document.write(html); w.document.close()
  const imprimir = () => { try { w.focus(); w.print() } catch { /* el usuario puede imprimir a mano */ } }
  w.onload = imprimir
  setTimeout(imprimir, 500) // por si onload no dispara con document.write
}

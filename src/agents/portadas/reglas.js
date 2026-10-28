// HELM — Portadas de reels: las reglas, en datos. Módulo puro (sin React ni
// navegador): lo usan la pantalla (Portadas.jsx), el compositor (componer.js)
// y el servidor (api/portadas.js) para validar lo mismo en los tres sitios.
//
// Sale del estudio de portadas del 17-10-2026 (docs/estudio-portadas-reels.md):
//   · la portada no da alcance (Mosseri: efecto «marginal»); convierte en el
//     perfil y en Explorar, que es donde se decide seguir y ver otro vídeo;
//   · la cuadrícula del perfil recorta a 3:4 centrado: de 1080×1920 se ve
//     y 240–1680, y encima van el contador de vistas (abajo a la izquierda)
//     y el icono de reel o fijado (arriba a la derecha);
//   · lo que funciona: 2–6 palabras, una sola resaltada, letra gruesa con caja
//     o sombra, la cara real nítida y la misma plantilla en toda la serie.

export const LIENZO = { ancho: 1080, alto: 1920 }

// Lo que se ve en la cuadrícula (3:4 centrado), con 60 px de margen lateral.
export const ZONA_CUADRICULA = { x0: 60, x1: 1020, y0: 240, y1: 1680 }
// Donde el titular está a salvo en todas las vistas.
export const BANDA_TITULAR = { x0: 60, x1: 1020, y0: 300, y1: 1250 }
// Encima de la portada, en la cuadrícula: el contador de vistas y el icono.
export const ZONAS_ICONOS = [
  { nombre: 'el contador de vistas', x0: 0, x1: 400, y0: 1560, y1: 1680 },
  { nombre: 'el icono de reel', x0: 900, x1: 1080, y0: 240, y1: 340 },
]

export const PALABRAS = { min: 2, max: 6, maxPregunta: 10 }
export const MAX_CARACTERES = 48
export const TAM_MINIMO = 96          // px de cuerpo en el lienzo de 1080
export const CONTRASTE_MINIMO = 4.5   // WCAG AA

export const PLANTILLAS = [
  { id: 'costura', nombre: 'Titular en el centro', desc: 'Dos líneas sobre cajas de color, a media altura. La serie de Kallaway o DotCSV.' },
  { id: 'arriba', nombre: 'Titular arriba', desc: 'Letra grande en el tercio de arriba y la cara debajo, sin taparla.' },
  { id: 'pregunta', nombre: 'Pregunta del cliente', desc: 'La duda del cliente entre comillas en una caja. El formato de Hormozi o Romuald Fons.' },
  { id: 'etiqueta', nombre: 'Etiqueta de serie', desc: 'Una píldora con la etiqueta de la serie y 2–4 palabras. Para que la cuadrícula parezca un canal.' },
  { id: 'numero', nombre: 'Número grande', desc: 'Una cifra enorme y dos líneas al lado. Para listas y resultados.' },
]
const IDS_PLANTILLA = new Set(PLANTILLAS.map(p => p.id))

// Las letras que ya sirve HELM (public/fonts): ninguna sale a Google Fonts.
export const LETRAS = {
  barlow: { familia: 'Barlow Condensed', peso: 900, nombre: 'Barlow Condensed (estrecha)' },
  montserrat: { familia: 'Montserrat', peso: 900, nombre: 'Montserrat' },
  interTight: { familia: 'Inter Tight', peso: 800, nombre: 'Inter Tight' },
}

export const MARCA_POR_DEFECTO = {
  colorPrincipal: '#E4362B',
  colorResalte: '#E8B93A',
  letra: 'barlow',
  mayusculas: true,
  etiqueta: '',
  plantilla: 'costura',
}

const HEX = /^#[0-9a-f]{6}$/i
const limpia = (s, max) => String(s ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** El kit de la serie, saneado: lo que no sea válido vuelve al de por defecto. */
export function normalizaMarca(entrada = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  return {
    colorPrincipal: HEX.test(e.colorPrincipal || '') ? e.colorPrincipal.toUpperCase() : MARCA_POR_DEFECTO.colorPrincipal,
    colorResalte: HEX.test(e.colorResalte || '') ? e.colorResalte.toUpperCase() : MARCA_POR_DEFECTO.colorResalte,
    letra: Object.hasOwn(LETRAS, e.letra) ? e.letra : MARCA_POR_DEFECTO.letra,
    mayusculas: typeof e.mayusculas === 'boolean' ? e.mayusculas : MARCA_POR_DEFECTO.mayusculas,
    etiqueta: limpia(e.etiqueta, 24),
    plantilla: IDS_PLANTILLA.has(e.plantilla) ? e.plantilla : MARCA_POR_DEFECTO.plantilla,
  }
}

export const palabrasDe = (texto) => String(texto || '').split(/\s+/).filter(Boolean)
export const cuentaPalabras = (texto) => palabrasDe(texto).length

/** La primera cifra del texto («5 errores…» → «5»), para la plantilla del número. */
export function primeraCifra(texto) {
  const m = String(texto || '').match(/(\d+(?:[.,]\d+)?\s?(?:%|€|k|K|M)?)/)
  return m ? m[1].replace(/\s/g, '') : null
}

/**
 * Las propuestas de la IA, saneadas. Lo que no cumple las reglas se queda
 * fuera en vez de llegar a la pantalla con un «ya lo arreglará alguien».
 */
export function normalizaOpciones(crudas) {
  const lista = Array.isArray(crudas) ? crudas : []
  const salida = []
  for (const o of lista) {
    if (!o || typeof o !== 'object') continue
    const texto = limpia(o.texto, MAX_CARACTERES + 20)
    const esPregunta = /[¿?]/.test(texto)
    const n = cuentaPalabras(texto)
    if (!texto || n < PALABRAS.min || n > (esPregunta ? PALABRAS.maxPregunta : PALABRAS.max + 2)) continue
    if (texto.length > MAX_CARACTERES + (esPregunta ? 20 : 0)) continue
    // La resaltada tiene que ser una palabra del texto; si no lo es, ninguna.
    const resaltada = limpia(o.resaltada, 40)
    const esta = resaltada && palabrasDe(texto).some(p => quitaSignos(p).toLowerCase() === quitaSignos(resaltada).toLowerCase())
    salida.push({
      texto,
      resaltada: esta ? resaltada : '',
      secundario: limpia(o.secundario, 40),
      plantilla: IDS_PLANTILLA.has(o.plantilla) ? o.plantilla : (esPregunta ? 'pregunta' : primeraCifra(texto) ? 'numero' : 'costura'),
      angulo: limpia(o.angulo, 60),
      porque: limpia(o.porque, 240),
    })
    if (salida.length === 3) break
  }
  return salida
}

export const quitaSignos = (p) => String(p || '').replace(/^[¿¡"'«(]+|[?!"'».,:;)]+$/g, '')

// ── Contraste (WCAG) ────────────────────────────────────────────────────────
function canal(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
export function luminancia([r, g, b]) {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}
export function hexARgb(hex) {
  const h = String(hex || '').replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0)
}
export function contraste(a, b) {
  const la = luminancia(Array.isArray(a) ? a : hexARgb(a))
  const lb = luminancia(Array.isArray(b) ? b : hexARgb(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
/** Blanco o casi negro: el que mejor se lea sobre ese color. */
export const tintaSobre = (fondo) => (contraste('#FFFFFF', fondo) >= contraste('#0D0A02', fondo) ? '#FFFFFF' : '#0D0A02')

// ── Comprobaciones de una portada ya compuesta ─────────────────────────────
const solapa = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/**
 * Lo que se comprueba antes de descargar. `cajas` son los rectángulos donde ha
 * quedado texto; `contrastes`, el contraste medido de cada bloque de texto.
 * Devuelve [{ ok, texto }] en el orden en que se enseña.
 */
export function comprobar({ texto, cajas = [], contrastes = [], tamano = 0 }) {
  const n = cuentaPalabras(texto)
  const esPregunta = /[¿?]/.test(texto || '')
  const max = esPregunta ? PALABRAS.maxPregunta : PALABRAS.max
  const fuera = cajas.filter(c => c.x0 < ZONA_CUADRICULA.x0 - 1 || c.x1 > ZONA_CUADRICULA.x1 + 1 || c.y0 < ZONA_CUADRICULA.y0 || c.y1 > ZONA_CUADRICULA.y1)
  const tapados = ZONAS_ICONOS.filter(z => cajas.some(c => solapa(c, z)))
  const peor = contrastes.length ? Math.min(...contrastes) : null
  return [
    { ok: n >= PALABRAS.min && n <= max, texto: n > max ? `${n} palabras: mejor ${PALABRAS.min}–${max}` : n < PALABRAS.min ? 'Pon al menos dos palabras' : `${n} palabras` },
    { ok: !fuera.length, texto: fuera.length ? 'Hay texto que se corta en la cuadrícula del perfil' : 'Todo el texto se ve en la cuadrícula (3:4)' },
    { ok: !tapados.length, texto: tapados.length ? `Hay texto bajo ${tapados.map(z => z.nombre).join(' y ')} de la cuadrícula` : 'Nada queda tapado por los iconos' },
    { ok: !tamano || tamano >= TAM_MINIMO, texto: tamano && tamano < TAM_MINIMO ? `Letra de ${Math.round(tamano)} px: en el móvil no se lee (mínimo ${TAM_MINIMO})` : 'Letra legible en el móvil' },
    { ok: peor == null || peor >= CONTRASTE_MINIMO, texto: peor == null ? 'Contraste: sin medir' : `Contraste ${peor.toFixed(1)}:1${peor < CONTRASTE_MINIMO ? ' — súbelo (mínimo 4,5:1)' : ''}` },
  ]
}

// HELM — Jev (TypeSafe): el modelo que decide, no el que escribe.
//
// Jev no genera texto. Se le da un contenido (`state`) y unas preguntas
// cerradas, y devuelve para cada una la respuesta con su probabilidad: elegir
// una opción de una lista (choice), sí o no (noul) o un punto de una escala
// (score). Contesta en menos de medio segundo y cuesta céntimos por millón de
// tokens, así que sirve para clasificar, no para redactar: los guiones, los
// resúmenes y los planes siguen siendo cosa de Claude.
//
// Se activa poniendo TYPESAFE_API_KEY en .env.server (la clave se saca en
// console.typesafe.ai/keys). Sin clave, nada de esto se usa.
//
// Aviso de su propia documentación: el idioma en el que mejor acierta es el
// inglés; en los demás hay que probarlo con contenido propio antes de fiarse
// (scripts/jev-compara.mjs hace esa prueba con los reels ya etiquetados).
//
// Documentación: https://docs.typesafe.ai/api.md
const URL_API = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone'
const CLAVE = () => process.env.TYPESAFE_API_KEY || ''
// La versión fija y no `jev-latest`: un alias cambia de modelo sin avisar, y
// con él las respuestas.
const MODELO = process.env.JEV_MODELO || 'jev-1.13.0'

export const jevDisponible = () => Boolean(CLAVE())

const espera = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Una petición a Jev: un contenido y un mapa de preguntas.
 * @param {string|object|Array} state  lo que se evalúa
 * @param {Record<string, {type: 'choice'|'noul'|'score', instructions: any, criteria?: any}>} questions
 * @returns {Promise<{answers: Record<string, object>, tokens: number, modelo: string}>}
 */
export async function jevDecide(state, questions, { timeoutMs = 30_000, fetchImpl = fetch } = {}) {
  if (!CLAVE()) throw new Error('Falta la clave de Jev (TYPESAFE_API_KEY)')
  // 429 (límite) y 529 (saturado) se reintentan con espera; lo demás, no.
  for (let intento = 1; ; intento++) {
    const r = await fetchImpl(URL_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAVE()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: MODELO, questions }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if ((r.status === 429 || r.status === 529) && intento < 4) {
      const pedido = Number(r.headers.get('retry-after'))
      await espera(Math.min((pedido > 0 ? pedido : 2 ** intento) * 1000, 20_000))
      continue
    }
    const cuerpo = await r.json().catch(() => ({}))
    if (!r.ok) {
      const e = new Error(`Jev contestó ${r.status}: ${JSON.stringify(cuerpo).slice(0, 300)}`)
      e.statusCode = r.status
      throw e
    }
    if (!cuerpo.answers || typeof cuerpo.answers !== 'object') throw new Error('Jev contestó sin respuestas')
    return { answers: cuerpo.answers, tokens: cuerpo.usage?.input_tokens || 0, modelo: cuerpo.model || MODELO }
  }
}

// ── Etiquetar con Jev ───────────────────────────────────────────────────────
// Lo usa el worker (scripts/agents-worker.mjs) cuando Claude no puede, antes
// que el modelo local. Una sola petición: la transcripción y una pregunta por
// etiqueta y por línea. Las opciones de cada pregunta son las mismas listas
// cerradas que valida el worker.
//
// Jev no escribe, así que lo que es texto libre sale de otro sitio: la CTA es
// lo que dicen las líneas de venta, literal, y el tema se queda vacío.
const MAX_LINEAS_JEV = 80

export const CRITERIOS_JEV = {
  tipo_gancho: {
    pregunta: 'Abre con una pregunta al espectador',
    dato: 'Abre con una cifra o un hecho que sorprende',
    'error comun': 'Abre señalando un error que comete mucha gente',
    contrarian: 'Abre llevando la contraria a lo que se suele creer',
    historia: 'Abre contando algo que le pasó a alguien',
    promesa: 'Abre prometiendo un resultado o un beneficio',
    lista: 'Abre anunciando una lista (tres cosas, cinco pasos…)',
    demostracion: 'Abre enseñando algo en pantalla o haciéndolo',
  },
  estructura: {
    'problema-solucion': 'Plantea un problema y da la solución',
    lista: 'Una serie de puntos o pasos, uno detrás de otro',
    historia: 'Cuenta una historia de principio a fin',
    comparacion: 'Compara dos opciones, o un antes y un después',
    tutorial: 'Enseña cómo se hace algo, paso a paso',
    opinion: 'Defiende una opinión o una postura',
  },
  tipo: {
    viralidad: 'Busca alcance: gancho fuerte, tema amplio, no pide nada',
    autoridad: 'Demuestra que sabe: enseña, desmonta mitos, cuenta casos',
    conversion: 'Lleva a la conversación: «comenta X», «escríbeme»',
    venta: 'La oferta: testimonios, resultados, llamada a comprar',
  },
  rol: {
    gancho: 'Abre y frena el scroll; casi siempre las primeras líneas',
    planteamiento: 'Desarrolla, explica, da contexto o ejemplos',
    remate: 'La conclusión o el giro',
    venta: 'Pide algo: comentar una palabra, seguir, entrar en un enlace',
  },
}

/** @param {string[]} lineas  el guion, línea a línea */
export async function etiquetaConJev(lineas, opts) {
  const n = Math.min(lineas.length, MAX_LINEAS_JEV)
  const questions = {
    tipo_gancho: { type: 'choice', instructions: 'Este es el guion de un vídeo corto, línea a línea. ¿Con qué tipo de gancho abre?', criteria: CRITERIOS_JEV.tipo_gancho },
    estructura: { type: 'choice', instructions: '¿Qué estructura sigue el guion entero?', criteria: CRITERIOS_JEV.estructura },
    tipo: { type: 'choice', instructions: '¿Para qué sirve este vídeo?', criteria: CRITERIOS_JEV.tipo },
  }
  for (let i = 0; i < n; i++) {
    questions[`rol_${i}`] = { type: 'choice', instructions: `¿Qué papel cumple la línea \`${i}\` dentro del guion?`, criteria: CRITERIOS_JEV.rol }
  }
  const { answers } = await jevDecide(Object.fromEntries(lineas.slice(0, n).map((t, i) => [String(i), t])), questions, opts)
  const elige = (k, validos) => (validos.includes(answers[k]?.choice) ? answers[k].choice : '')
  const tipo_gancho = elige('tipo_gancho', Object.keys(CRITERIOS_JEV.tipo_gancho))
  if (!tipo_gancho) throw new Error('Jev no devolvió un tipo de gancho de la lista')
  const frases = []
  for (let i = 0; i < n; i++) frases.push({ i, rol: elige(`rol_${i}`, Object.keys(CRITERIOS_JEV.rol)) || 'planteamiento' })
  return {
    tema: '',
    tipo_gancho,
    estructura: elige('estructura', Object.keys(CRITERIOS_JEV.estructura)),
    tipo: elige('tipo', Object.keys(CRITERIOS_JEV.tipo)),
    cta: frases.filter(f => f.rol === 'venta').map(f => lineas[f.i]).join(' '),
    frases,
    // Lo segura que está de las tres etiquetas: la menor de las tres.
    confianza: Math.min(...['tipo_gancho', 'estructura', 'tipo'].map(k => Number(answers[k]?.confidence) || 0)),
  }
}

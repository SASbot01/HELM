// Siembra la memoria del chat de HELM con el material específico de la cuenta
// de Silvestre (@silvesttre_ai): perfil, oferta, público, mantras, CTAs y el
// banco de hooks por categoría.
//
// Esto NO es método general (eso vive en api/_lib/copy-knowledge.js) — es
// conocimiento de UNA cuenta, así que va a `helm_knowledge` scoped por
// client_id, igual que lo que se añade luego con /conocimiento.
//
//   node scripts/seed-silvestre-knowledge.mjs [slug]     (slug por defecto: silvestre)
//
// Idempotente: borra las filas sembradas anteriormente (source='seed:silvestre')
// antes de insertar, así se puede re-ejecutar tras editar este archivo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabase = createClient(SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const SLUG = process.argv[2] || 'silvestre'
const SOURCE = 'seed:silvestre'

const KNOWLEDGE = [
  {
    title: 'Perfil del creador',
    content: `Salvador Alejandro Silvestre Fuentes — Instagram @silvesttre_ai. CTO de BlackWolf Security.
Construye software propio: CRM, Dashboard-Ops, sistema multi-agente. Gestiona infoproductores (Abel Casal — Detrás de Cámara).
Propósito: demostrar que la tecnología es el vehículo para que las personas evolucionen.
Valores: ejecución > teoría, esfuerzo innegociable, opinión con fundamento, sin vender humo.
Rutina: gym al despertar, 3 tandas de 2h de deep work, 10 páginas de lectura al día.
Comunica directo, sin rodeos, al grano.`,
  },
  {
    title: 'Público objetivo',
    content: `1) Empresarios con sistemas que necesitan IA para optimizar → les vendemos servicio.
2) Personas apasionadas por tech/IA que quieren trabajar menos y ganar más → contenido y formación.
Nicho principal: agencias de marketing y servicios B2B de 3 a 20 empleados.`,
  },
  {
    title: 'Servicios y flujo de venta',
    content: `Servicio 1 — Sistema Empresa Organizada (entrada): conectar herramientas, CRM, dashboard, automatizaciones.
Para empresas de 3-30 empleados y 100K-2M de facturación. Desde 1.500-3.000€.

Servicio 2 — IA Local (upgrade): servidor propio, IA local, transcripción, base de datos, todo suyo.
Coste fijo del servidor 234€/mes. Desde 3.000-5.000€ de setup.

Flujo: Reel → DM "SYSTEM" → conversación → auditoría gratis de 30 min → propuesta → cierre.`,
  },
  {
    title: 'Mantras (repetir en vídeos regularmente)',
    content: `"No saber IA en 2026 es como no saber internet en 2010"
"Con IA, construir es como montar un LEGO. Las piezas ya existen"
"Planificar es cómodo. Ejecutar duele"
"Un plan sin acción es ego"`,
  },
  {
    title: 'CTAs y frases de cierre',
    content: `CTA universal: DM "SYSTEM".
"Si quieres que analice tu caso gratis, escríbeme"
"Comenta SYSTEM y te explico cómo"
"DM SYSTEM si quieres aprender"
"Sígueme si quieres más contenido sin filtro"`,
  },
  {
    title: 'Banco de hooks — IA técnica (dolor del negocio)',
    content: `"Hay cosas que tu negocio está perdiendo por no usar IA y no te estás dando cuenta"
"Tu equipo pierde 2 horas al día en tareas que una máquina hace en segundos"
"Estás pagando sueldos para que tu gente copie datos de un sitio a otro"
"Si necesitas una reunión para saber cómo va tu empresa, tienes un problema"
"Tu negocio depende de 5 herramientas que no se hablan entre sí"
"Tienes toda la información de tu negocio repartida en 6 sitios y para saber cómo vas tienes que abrir todos"
"Le pagas a tu equipo para pensar y crear pero pasan la mitad del día haciendo tareas que un robot haría mejor"
"Estás tomando decisiones con el instinto cuando la IA ya tiene la respuesta en los datos que tú ni miras"
"Cada mes pagas 5 herramientas distintas que hacen lo mismo porque nadie se paró a conectarlas"
"Llegas a casa reventado y ni siquiera sabes en qué se te ha ido el día"
"Tu equipo trabaja 8 horas pero produce 3 porque el resto es copiar, buscar y preguntar"
"Montaste tu negocio para ser libre y ahora eres esclavo de tus propios procesos"
"Cada noche cierras el portátil sintiendo que no has avanzado nada"
"Estás tan metido en apagar fuegos que ya no recuerdas la última vez que pensaste en crecer"
"Tu mejor empleado se va mañana y se lleva todo lo que sabe en la cabeza"
"Cada vez que un cliente te pregunta algo y tardas un día en responder, está hablando con otro"
"Trabajas más que nunca y facturas igual que hace dos años"`,
  },
  {
    title: 'Banco de hooks — Futuro IA (miedo / urgencia)',
    content: `"En 2010 decían que internet era una moda. ¿Dónde están esos negocios hoy?"
"En 2 años el que sepa IA hará en una hora lo que tú haces en una semana"
"La IA no te va a quitar el trabajo. Te lo va a quitar alguien que sepa usarla"
"Mientras tú lo piensas, tu competencia ya lo está haciendo"
"Las empresas de 3 personas van a comerse a las de 30. Y la diferencia es la IA"
"Tú no compites contra empresas más grandes. Compites contra empresas más automatizadas"
"Dentro de 2 años vas a mirar atrás y desear haber empezado hoy"
"La IA no es una herramienta. Es la nueva electricidad. Y hay negocios que siguen con velas"
"Tus hijos van a vivir en un mundo donde la IA lo hace todo. Y tú todavía no sabes cómo funciona"
"Dentro de 2 años alguien con la mitad de tu experiencia te va a quitar clientes porque sabe usar IA y tú no"
"No te vas a quedar sin trabajo de golpe. Va a ser lento. Primero un cliente menos, luego otro"
"El que no entienda IA no va a quebrar mañana. Va a ir perdiendo poco a poco sin saber por qué"
"La IA no va a llamar a tu puerta para avisarte. Simplemente un día tus clientes dejarán de llamar a la tuya"
"Hay un chaval de 22 años montando con IA lo que a ti te costó 10 años construir"
"No es que la IA sea difícil. Es que da miedo empezar. Y ese miedo te está costando dinero cada día"
"Cuando por fin decidas aprender IA, los que empezaron hoy van a llevar dos años de ventaja"
"Mientras tú sigues apagando fuegos, tu competencia automatizó todo eso y se fue de vacaciones"
"Tu competencia no está contratando más gente. Está contratando menos y produciendo más"
"Vas a ver cómo negocios que empezaron después que tú te adelantan"`,
  },
  {
    title: 'Banco de hooks — Mentalidad / emprendimiento',
    content: `"Montaste tu negocio para vivir mejor y llevas 3 años viviendo peor que cuando trabajabas para otro"
"Si mañana te pones enfermo una semana, ¿tu negocio sobrevive o se para todo?"
"Dices que no tienes tiempo pero llevas una hora scrolleando sin darte cuenta"
"Cada día que pospones lo que sabes que tienes que hacer le estás regalando ventaja a alguien que no lo pospuso"
"La gente quiere resultados de 5 años en 5 meses y cuando no los tiene dice que no funciona"`,
  },
  {
    title: 'Banco de hooks — Dinero / valor',
    content: `"No cobras poco porque tu servicio valga poco. Cobras poco porque no sabes explicar lo que vale"
"El cliente no te elige por ser el mejor. Te elige por ser el que mejor le hizo entender por qué te necesita"
"Estás regalando tu tiempo a clientes que no lo valoran porque tienes miedo de cobrar lo que mereces"
"El problema no es que no vendes. Es que nadie entiende qué coño vendes"
"Todo el dinero del mundo se genera de dos formas. O le das placer a alguien, o le quitas un dolor"`,
  },
  {
    title: 'Banco de hooks — Datos curiosos tech',
    content: `"ChatGPT tardó 5 días en llegar a un millón de usuarios. Netflix tardó 3 años. Spotify 5"
"El 90% de los datos que existen en el mundo se crearon en los últimos 2 años"
"Hay hospitales usando IA que detecta cáncer antes que un médico con 20 años de experiencia"
"OpenAI factura 12 mil millones de dólares al año. De empresas como la tuya pagando por cada pregunta"`,
  },
  {
    title: 'Banco de hooks — Personal / emocional (estilo Buerbaum)',
    content: `"Nadie te dice lo solo que estás cuando decides construir algo de verdad"
"La gente ve el resultado. Nunca ve las 3 de la mañana con un error que no sabes resolver"
"Hay días que no quiero grabar. Hay días que no quiero entrenar. Pero lo hago"
"Hace un año estaba sentado 14 horas al día haciendo todo yo. Había montado una cárcel con mi nombre en la puerta"`,
  },
  {
    title: 'Banco de hooks — Opinión fuerte / controversial',
    content: `"El 90% de los negocios que usan IA la están usando mal. ChatGPT Plus y emails bonitos no es IA"
"Voy a decir algo que a mucha gente no le va a gustar"`,
  },
]

async function main() {
  let { data: client } = await supabase
    .from('clients').select('id, name, slug').eq('slug', SLUG).maybeSingle()

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .insert({ slug: SLUG, name: 'Silvestre AI', client_type: 'growth', active: true, is_demo: false })
      .select('id, name, slug').single()
    if (error) throw error
    client = data
    console.log(`perfil creado: ${client.name} (${client.slug})`)
  } else {
    console.log(`perfil existente: ${client.name} (${client.slug})`)
  }

  await supabase.from('helm_knowledge')
    .delete().eq('client_id', client.id).eq('source', SOURCE)

  const rows = KNOWLEDGE.map(k => ({ ...k, kind: 'nota', client_id: client.id, source: SOURCE }))
  const { error } = await supabase.from('helm_knowledge').insert(rows)
  if (error) throw error

  console.log(`${rows.length} bloques de conocimiento sembrados en ${client.slug}`)
}

main().catch(err => { console.error(err.message || err); process.exit(1) })

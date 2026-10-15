// HELM — Scraper: leads de cinco fuentes al pipeline.
//
//   GET    ?action=status    &clientId=                        → claves por fuente
//   POST   ?action=clave     { clientId, fuente, apiKey }      → valida y guarda
//   DELETE ?action=clave     &clientId= &fuente=
//   POST   ?action=buscar    { clientId, fuente, ...params }   → busca y guarda
//   GET    ?action=lista     &clientId= &estado= &fuente=      → lo encontrado
//   POST   ?action=importar  { clientId, ids, pipelineId, stageKey }
//   POST   ?action=descartar { clientId, ids }
//   POST   ?action=enriquecer { clientId, ids } → lee la web de cada negocio
//   GET    ?action=busquedas &clientId= &fuente=               → el histórico
//
// Lo que cambia según la fuente es de dónde salen las filas (ver
// _lib/fuentes/index.js). Lo de después es idéntico para las cinco, y es lo que
// hace que esto sirva: bandeja de revisión antes del CRM, descarte que no vuelve
// a salir, enriquecimiento leyendo la web y deduplicación contra los contactos.
//
// Va por servidor y no directo desde el panel por dos razones: las claves de API
// no pueden acabar en el navegador (las búsquedas se le facturan a su dueño), y
// la importación tiene que deduplicar contra el CRM antes de escribir.
import { supabase } from './lib/supabase.js'
import { applyCors, rateLimit, getClientIp, writeAudit } from './_lib/auth.js'
import { requireProfileAccess } from './_lib/access.js'
import {
  FUENTES, FUENTE_DEFECTO, fuenteDe, buscarEnFuente,
  getClave, guardarClave, borrarClaveDe,
} from './_lib/fuentes/index.js'
import { enriquecerDesdeWeb } from './_lib/enriquecer.js'

const txt = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max)

// Los últimos 9 dígitos, igual que en los formularios: "+34 962 12 34 56" y
// "0034962123456" son el mismo número, que es como lo escribe la gente.
const cola = (v) => String(v || '').replace(/\D/g, '').slice(-9)

// Cuántos negocios se enriquecen por llamada. Cada uno son hasta 6 peticiones a
// una web ajena, de una en una: pasarse de aquí es agotar el tiempo de la
// función y, sobre todo, machacar servidores de terceros.
const MAX_ENRIQUECER = 10

/** La etapa de entrada de un pipeline, validando que exista de verdad. */
async function destino(clientId, pipelineId, stageKey) {
  if (!pipelineId) return { pipelineId: null, stage: 'lead' }
  const { data: pipeline } = await supabase
    .from('crm_pipelines').select('id, stages').eq('id', pipelineId)
    .eq('client_id', clientId).maybeSingle()
  // El where lleva client_id: sin él se podría meter contactos en el embudo de
  // otro perfil pasando su id.
  if (!pipeline) {
    const e = new Error('Ese embudo no existe en este perfil')
    e.statusCode = 400
    throw e
  }
  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : []
  const elegida = stages.find(s => s.key === stageKey)
  return { pipelineId: pipeline.id, stage: elegida?.key || stages[0]?.key || 'lead' }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  const ip = getClientIp(req)
  // Más apretado que el resto de endpoints: cada búsqueda cuesta dinero real en
  // la cuenta de Google del cliente, y un bucle en el navegador se lo gastaría.
  const gate = rateLimit({ key: `prospeccion:${ip}`, max: 30, windowMs: 60_000 })
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter))
    return res.status(429).json({ error: 'Demasiadas peticiones seguidas', retryAfter: gate.retryAfter })
  }

  const clientId = req.query.clientId || req.body?.clientId
  // Un solo perfil por petición: el que se comprueba es el que se usa. Si
  // vienen los dos (URL y cuerpo) y no coinciden, no se adivina cuál vale.
  if (req.query?.clientId && req.body?.clientId && String(req.query.clientId) !== String(req.body.clientId)) {
    return res.status(400).json({ error: 'El perfil de la URL y el del cuerpo no coinciden' })
  }
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' })

  // El email sale de la sesión y no del cuerpo: es lo que queda escrito en el
  // histórico como "quién lanzó esta búsqueda", y un campo que manda el
  // navegador se puede poner a nombre de cualquiera.
  let auth
  try {
    auth = await requireProfileAccess(req, clientId)
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message })
  }

  try {
    // ── GET ?action=status ─────────────────────────────────────────────────
    // El estado de las CINCO fuentes de una vez. La pantalla las pinta todas a
    // la vez, así que pedirlas de una en una serían cinco viajes para dibujar
    // una fila de tarjetas.
    if (req.method === 'GET' && action === 'status') {
      const fuentes = {}
      for (const f of Object.values(FUENTES)) {
        const row = f.servicio ? await getClave(supabase, clientId, f.servicio) : null
        const apiKey = row?.enabled ? row?.config?.apiKey : null
        fuentes[f.key] = {
          nombre: f.nombre,
          // Las que no piden clave están listas desde el primer día. Es la
          // diferencia que más importa al elegir por dónde empezar.
          necesitaClave: Boolean(f.servicio),
          configurada: f.servicio ? Boolean(apiKey) : true,
          // Nunca la clave entera: solo lo justo para reconocer cuál está
          // puesta. Que la haya guardado este usuario no la hace suya para verla.
          pista: apiKey ? `…${String(apiKey).slice(-6)}` : null,
          updatedAt: row?.updated_at || null,
          maxResultados: f.maxResultados,
          meta: f.meta || null,
        }
      }
      return res.status(200).json({
        fuentes,
        // Compatibilidad con la pantalla anterior, que solo sabía de Maps.
        configurada: fuentes.maps.configurada,
        pista: fuentes.maps.pista,
        maxResultados: fuentes.maps.maxResultados,
      })
    }

    // ── POST ?action=clave ─────────────────────────────────────────────────
    // Se prueba contra Google antes de guardarla: una clave rota guardada es
    // una búsqueda que falla mañana sin que nadie sepa por qué.
    if (req.method === 'POST' && action === 'clave') {
      const fuente = fuenteDe(txt(req.body?.fuente, 20) || FUENTE_DEFECTO)
      const apiKey = txt(req.body?.apiKey, 200)
      if (!fuente.servicio) return res.status(400).json({ error: `${fuente.nombre} no necesita ninguna clave` })
      if (!apiKey) return res.status(400).json({ error: 'Falta la clave de la API' })

      await fuente.verificar(apiKey)
      await guardarClave(supabase, clientId, fuente.servicio, apiKey)
      await writeAudit({ clientId, action: 'prospeccion.clave_guardada', req, metadata: { fuente: fuente.key } })

      return res.status(200).json({ configurada: true, pista: `…${apiKey.slice(-6)}` })
    }

    // ── DELETE ?action=clave ───────────────────────────────────────────────
    if (req.method === 'DELETE' && action === 'clave') {
      const fuente = fuenteDe(txt(req.query.fuente, 20) || FUENTE_DEFECTO)
      if (!fuente.servicio) return res.status(400).json({ error: `${fuente.nombre} no usa ninguna clave` })
      await borrarClaveDe(supabase, clientId, fuente.servicio)
      await writeAudit({ clientId, action: 'prospeccion.clave_borrada', req, metadata: { fuente: fuente.key } })
      return res.status(200).json({ configurada: false })
    }

    // ── POST ?action=buscar ────────────────────────────────────────────────
    // El único sitio donde importa de qué fuente se trata. A partir de la línea
    // de `buscarEnFuente` todo es igual para las cinco.
    if (req.method === 'POST' && action === 'buscar') {
      const key = txt(req.body?.fuente, 20) || FUENTE_DEFECTO
      const fuente = fuenteDe(key)

      // Lista blanca de parámetros. Ninguna fuente recibe el cuerpo entero: lo
      // que llega del navegador acaba en consultas a servicios de terceros, y
      // en la de OSM además dentro de una consulta Overpass.
      const params = {
        tipo:      txt(req.body?.tipo, 80),
        zona:      txt(req.body?.zona, 120),
        provincia: txt(req.body?.provincia, 60),
        acto:      txt(req.body?.acto, 30),
        consulta:  txt(req.body?.consulta, 400),
        texto:     txt(req.body?.texto, 60_000),
        dias:      Math.min(Math.max(Number(req.body?.dias) || 3, 1), 15),
        limite:    Math.min(Math.max(Number(req.body?.limite) || 20, 1), fuente.maxResultados),
      }

      const { consulta, negocios: crudos } = await buscarEnFuente(supabase, clientId, key, params)

      // Un mismo id repetido dentro de la MISMA respuesta reventaría el insert
      // contra el índice único (client_id, place_id). Cada fuente ya deduplica
      // lo suyo, pero eso es una promesa de cinco módulos: aquí se garantiza.
      const negocios = [...new Map(crudos.map(n => [n.place_id, n])).values()]

      // Los que ya se conocían de otras búsquedas. Se miran ANTES de escribir
      // para poder decir cuántos son nuevos de verdad, que es el dato que
      // importa cuando repites una zona.
      const ids = negocios.map(n => n.place_id)
      const { data: conocidos } = ids.length
        ? await supabase.from('helm_prospects')
          .select('place_id, estado').eq('client_id', clientId).in('place_id', ids)
        : { data: [] }
      const yaEstaban = new Set((conocidos || []).map(c => c.place_id))
      const nuevos = negocios.filter(n => !yaEstaban.has(n.place_id))

      const { data: busqueda } = await supabase.from('helm_prospect_searches').insert({
        client_id: clientId,
        fuente: key,
        zona: params.zona || params.provincia,
        tipo: params.tipo || params.acto,
        consulta,
        // El texto pegado NO se guarda: son datos de contacto de terceros y ya
        // están en las filas que han salido de él. Repetirlo aquí sería
        // guardarlos dos veces para nada.
        params: { ...params, texto: params.texto ? `${params.texto.length} caracteres` : '' },
        encontrados: negocios.length,
        nuevos: nuevos.length,
        lanzada_por: txt(auth?.email, 200),
      }).select('id').single()

      const ahora = new Date().toISOString()

      // Los nuevos entran enteros, con lo que traiga su fuente.
      if (nuevos.length) {
        const filas = nuevos.map(n => ({
          client_id: clientId,
          search_id: busqueda?.id || null,
          fuente: key,
          place_id: n.place_id,
          nombre: n.nombre, direccion: n.direccion, telefono: n.telefono, web: n.web,
          categoria: n.categoria, rating: n.rating, resenas: n.resenas,
          maps_url: n.maps_url, lat: n.lat, lng: n.lng,
          email: n.email || '',
          extra: n.extra || {},
          estado: 'nuevo',
          updated_at: ahora,
        }))
        const { error } = await supabase.from('helm_prospects').insert(filas)
        if (error) return res.status(500).json({ error: 'No se pudieron guardar los resultados: ' + error.message })
      }

      // Los conocidos se refrescan SOLO en lo que puede haber cambiado en el
      // negocio (nombre, teléfono, web…). Ni el estado ni lo enriquecido: lo que
      // alguien descartó sigue descartado, y el email que costó una pasada por
      // su web no se pisa con el vacío que trae una búsqueda nueva.
      const repetidos = negocios.filter(n => yaEstaban.has(n.place_id))
      if (repetidos.length) {
        const filas = repetidos.map(n => ({
          client_id: clientId,
          place_id: n.place_id,
          nombre: n.nombre, direccion: n.direccion, telefono: n.telefono, web: n.web,
          categoria: n.categoria, rating: n.rating, resenas: n.resenas,
          updated_at: ahora,
        }))
        const { error } = await supabase.from('helm_prospects')
          .upsert(filas, { onConflict: 'client_id,place_id' })
        if (error) console.warn('[prospeccion] refrescar conocidos', error.message)
      }

      return res.status(200).json({
        fuente: key,
        consulta,
        encontrados: negocios.length,
        nuevos: nuevos.length,
        searchId: busqueda?.id || null,
      })
    }

    // ── GET ?action=lista ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'lista') {
      const estado = txt(req.query.estado, 20)
      const fuente = txt(req.query.fuente, 20)
      let q = supabase.from('helm_prospects').select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }).limit(500)
      if (estado && estado !== 'todos') q = q.eq('estado', estado)
      // Sin filtro de fuente se ven todas juntas, que es lo normal: la bandeja
      // es una sola aunque los leads vengan de cinco sitios.
      if (fuente && fuente !== 'todas') q = q.eq('fuente', fuente)
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ prospects: data || [] })
    }

    // ── GET ?action=busquedas ──────────────────────────────────────────────
    if (req.method === 'GET' && action === 'busquedas') {
      const fuente = txt(req.query.fuente, 20)
      let h = supabase.from('helm_prospect_searches')
        .select('*').eq('client_id', clientId)
        .order('created_at', { ascending: false }).limit(50)
      if (fuente && fuente !== 'todas') h = h.eq('fuente', fuente)
      const { data, error } = await h
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ busquedas: data || [] })
    }

    // ── POST ?action=descartar ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'descartar') {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, 500)
      if (!ids.length) return res.status(400).json({ error: 'No has elegido ninguno' })
      const { error } = await supabase.from('helm_prospects')
        .update({ estado: 'descartado', updated_at: new Date().toISOString() })
        .eq('client_id', clientId).in('id', ids).eq('estado', 'nuevo')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, descartados: ids.length })
    }

    // ── POST ?action=enriquecer ────────────────────────────────────────────
    // Segunda pasada: lo que Maps no tiene y sí está en la web del negocio
    // (email, redes, titular del aviso legal, quién figura con cargo).
    //
    // En tandas pequeñas a propósito. Son webs de terceros: se leen una detrás
    // de otra, no todas a la vez, y con el tope puesto para que una llamada no
    // se coma el tiempo de la función ni parezca un ataque desde el otro lado.
    if (req.method === 'POST' && action === 'enriquecer') {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, MAX_ENRIQUECER)
      if (!ids.length) return res.status(400).json({ error: 'No has elegido ninguno' })

      const { data: prospects } = await supabase.from('helm_prospects')
        .select('id, web, nombre, email, extra').eq('client_id', clientId).in('id', ids)
      if (!prospects?.length) return res.status(400).json({ error: 'No encuentro esos negocios' })

      let conDatos = 0
      for (const p of prospects) {
        const datos = await enriquecerDesdeWeb(p.web)
        const encontrado = Boolean(datos.email || datos.titular || datos.personas.length || datos.telefonos.length)
        if (encontrado) conDatos++

        // Las personas del BORME (las del registro) y las de la web son la
        // misma lista y no se pisan: en un negocio pequeño suelen ser la misma
        // persona escrita de dos formas, y quien llama quiere ver las dos.
        const previas = Array.isArray(p.extra?.personas) ? p.extra.personas : []
        const vistas = new Set(previas.map(x => String(x.nombre || '').toLowerCase()))
        const personas = [
          ...previas,
          ...datos.personas.filter(x => !vistas.has(String(x.nombre || '').toLowerCase())),
        ]

        // Se marca la fecha aunque no se encuentre nada: así no se vuelve a
        // pedir la misma web una y otra vez. `motivo` deja dicho por qué.
        const { error } = await supabase.from('helm_prospects').update({
          // El email de la fuente (OSM y las listas traen) manda sobre el vacío:
          // una web que no suelta email no es motivo para borrar el que ya había.
          email: datos.email || p.email || '',
          telefonos_web: datos.telefonos,
          instagram: datos.instagram || '',
          facebook: datos.facebook || '',
          linkedin: datos.linkedin || '',
          cif: datos.cif || '',
          titular: datos.titular || '',
          // Merge, no reemplazo: `extra` lleva lo que trajo la fuente (el acto
          // del BORME, las etiquetas de OSM) y reescribirlo entero lo tiraba.
          extra: { ...(p.extra || {}), personas, paginas: datos.paginas, motivo: datos.motivo || null },
          enriquecido_en: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', p.id).eq('client_id', clientId)
        if (error) console.warn('[prospeccion] enriquecer', p.nombre, error.message)
      }

      return res.status(200).json({ ok: true, mirados: prospects.length, conDatos })
    }

    // ── POST ?action=importar ──────────────────────────────────────────────
    // Aquí es donde hay que tener cuidado: esto escribe en el CRM de alguien.
    if (req.method === 'POST' && action === 'importar') {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, 200)
      if (!ids.length) return res.status(400).json({ error: 'No has elegido ningún negocio' })

      const { pipelineId, stage } = await destino(clientId, req.body?.pipelineId, req.body?.stageKey)

      const { data: prospects } = await supabase.from('helm_prospects')
        .select('*').eq('client_id', clientId).in('id', ids).eq('estado', 'nuevo')
      if (!prospects?.length) {
        return res.status(400).json({ error: 'Esos negocios ya se importaron o se descartaron. Recarga la lista.' })
      }

      // El CRM entero una vez, no una consulta por negocio: con 200 a importar
      // serían 400 idas y venidas a la base.
      const { data: existentes } = await supabase.from('crm_contacts')
        .select('id, name, phone, custom_fields').eq('client_id', clientId).limit(10000)

      const porTelefono = new Map()
      const porPlace = new Map()
      for (const c of existentes || []) {
        const t = cola(c.phone)
        if (t.length >= 9) porTelefono.set(t, c.id)
        const pid = c.custom_fields?.place_id
        if (pid) porPlace.set(pid, c.id)
      }

      const nuevos = []
      const repetidos = []   // ya estaban en el CRM: se enlazan, no se duplican

      for (const p of prospects) {
        // Ya está en el CRM (por place_id o por teléfono): se marca importado y
        // se apunta a su ficha. Crear un duplicado sería el peor resultado
        // posible — el comercial llamaría dos veces al mismo sitio.
        const yaId = porPlace.get(p.place_id) || (cola(p.telefono).length >= 9 ? porTelefono.get(cola(p.telefono)) : null)
        if (yaId) { repetidos.push({ prospect: p, contactId: yaId }); continue }

        nuevos.push({
          prospect: p,
          fila: {
            client_id: clientId,
            name: p.nombre || 'Sin nombre',
            // El email y el Instagram salen de la segunda pasada; si no se ha
            // hecho, quedan vacíos y el contacto entra igual con el teléfono.
            email: p.email || '',
            // El enriquecimiento guarda la URL entera del perfil; el CRM quiere
            // solo el usuario (la ficha monta instagram.com/<usuario>).
            instagram: (String(p.instagram || '').match(/instagram\.com\/([A-Za-z0-9_.]+)/i) || [])[1] || p.instagram || '',
            website: p.web || '',
            address: p.direccion || '',
            phone: p.telefono || (Array.isArray(p.telefonos_web) ? p.telefonos_web[0] : '') || '',
            whatsapp: p.telefono || '',
            company: p.nombre || '',
            // De dónde salió, con el nombre que entiende quien luego mira el
            // CRM: "Registro Mercantil (BORME)" dice mucho más que "scraper".
            source: FUENTES[p.fuente]?.nombre || 'Google Maps',
            status: stage,
            pipeline_id: pipelineId,
            // La dirección y la web van a las notas porque el CRM no tiene
            // columnas para ellas, y son lo primero que mira quien va a llamar.
            // Lo primero que mira quien va a llamar, en el orden en que lo
            // mira. Las líneas que no aplican a esa fuente no dejan hueco:
            // un lead del BORME no tiene reseñas y no tiene por qué decirlo.
            notes: [
              p.direccion,
              p.web ? `Web: ${p.web}` : '',
              p.extra?.acto ? `BORME: ${p.extra.acto}${p.extra.fecha ? ` (${p.extra.fecha})` : ''}` : '',
              p.extra?.objeto ? `Objeto social: ${p.extra.objeto}` : '',
              p.extra?.capital ? `Capital: ${p.extra.capital}` : '',
              p.titular ? `Titular (aviso legal): ${p.titular}` : '',
              p.cif ? `CIF: ${p.cif}` : '',
              ...(p.extra?.personas || []).map(x => `${x.cargo}: ${x.nombre}`),
              p.linkedin ? `LinkedIn: ${p.linkedin}` : '',
              p.categoria ? `Categoría: ${p.categoria}` : '',
              p.rating ? `Google: ${p.rating}★ (${p.resenas || 0} reseñas)` : '',
              p.extra?.resumen ? `En el buscador: ${p.extra.resumen}` : '',
              p.maps_url,
            ].filter(Boolean).join('\n'),
            custom_fields: {
              fuente: p.fuente || 'maps',
              place_id: p.place_id,
              maps_url: p.maps_url,
              direccion: p.direccion,
              web: p.web,
              categoria: p.categoria,
              rating: p.rating,
              resenas: p.resenas,
              titular: p.titular || null,
              cif: p.cif || null,
              personas: p.extra?.personas || [],
              linkedin: p.linkedin || null,
              facebook: p.facebook || null,
            },
            last_activity_at: new Date().toISOString(),
          },
        })
      }

      let creados = []
      if (nuevos.length) {
        const { data, error } = await supabase.from('crm_contacts')
          .insert(nuevos.map(n => n.fila)).select('id')
        if (error) return res.status(500).json({ error: 'No se pudieron crear los contactos: ' + error.message })
        creados = data || []
      }

      // Cada prospect apunta a su contacto. Se hace de uno en uno porque cada
      // fila lleva un contact_id distinto; son como mucho 200.
      const marcas = [
        ...nuevos.map((n, i) => ({ id: n.prospect.id, contactId: creados[i]?.id || null })),
        ...repetidos.map(r => ({ id: r.prospect.id, contactId: r.contactId })),
      ]
      await Promise.all(marcas.map(m => supabase.from('helm_prospects')
        .update({ estado: 'importado', contact_id: m.contactId, updated_at: new Date().toISOString() })
        .eq('id', m.id).eq('client_id', clientId)))

      await writeAudit({
        clientId, action: 'prospeccion.importados', req,
        metadata: { creados: creados.length, enlazados: repetidos.length, stage },
      })

      return res.status(200).json({
        ok: true,
        creados: creados.length,
        yaEstaban: repetidos.length,
        stage,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[prospeccion]', err)
    return res.status(err.statusCode || 500).json({ error: err.message || 'Error' })
  }
}

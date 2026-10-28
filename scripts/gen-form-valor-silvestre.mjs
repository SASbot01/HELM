// Genera migrations/helm_formulario_valor_silvestre.sql a partir de
// src/pages/silvestreai/preguntas.js.
//
// El cuestionario vive en preguntas.js (es lo que pinta la página) pero el
// plugin Formularios lee la definición de helm_forms, en la base. Escribir a
// mano ochenta y pico campos en SQL es pedir una errata; esto los saca del
// mismo sitio del que salen las preguntas, así que no pueden desincronizarse.
//
//   node scripts/gen-form-valor-silvestre.mjs
//
// Después hay que aplicar la migración como cualquier otra.
import { writeFileSync } from 'node:fs'
import { Q, RAMAS } from '../src/pages/silvestreai/preguntas.js'

const SALIDA = new URL('../migrations/helm_formulario_valor_silvestre.sql', import.meta.url)

// Un formulario por rama y no uno solo con la unión de todas: el visor de
// respuestas pinta TODOS los campos del formulario, así que con los 81 juntos
// cada respuesta saldría con dieciséis contestadas y sesenta y cinco rayas.
const campoDe = (q) => ({
  key: q.id,
  label: typeof q.q === 'function' ? q.q({}) : q.q,
  type: q.type === 'text' ? 'long' : 'select',
  required: true,
  ...(q.options ? { options: q.options.map(o => o.label) } : {}),
})

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`

const bloques = RAMAS.map(rama => {
  const campos = Q.filter(q => q.rama === rama.value).map(campoDe)
  if (campos.length !== 16) throw new Error(`rama ${rama.value}: ${campos.length} preguntas, esperaba 16`)
  return `  -- ── ${rama.corto} ──
  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    ${sq(`valor-${rama.value}`)},
    ${sq(`Formulario de valor · ${rama.corto}`)},
    ${sq(`Respuestas de quien elige "${rama.label}" en helm.s4sf.net/silvestreai/valor`)},
    $json$${JSON.stringify(campos, null, 1)}$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();
`
}).join('\n')

const sql = `-- HELM — Formulario de valor de Silvestre IA en el plugin Formularios.
--
-- GENERADO por scripts/gen-form-valor-silvestre.mjs a partir de
-- src/pages/silvestreai/preguntas.js. No lo edites a mano: cambia las
-- preguntas allí y vuelve a lanzar el script.
--
-- Un formulario por rama. El visor de respuestas pinta todos los campos del
-- formulario, así que uno solo con la unión de las cinco ramas sacaría cada
-- respuesta con dieciséis contestadas y sesenta y cinco rayas. Además, así el
-- panel enseña de un vistazo cuántos leads llegan de cada tipo de empresa.
--
-- Los datos de contacto (nombre, empresa, email, teléfono, web) no van como
-- campos: viven en la ficha del contacto, que es a donde apunta la respuesta.

do $$
declare
  v_client uuid;
begin
  select id into v_client from clients where lower(slug) = 'silvestre' limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil silvestre. El formulario NO se ha creado.';
    return;
  end if;

${bloques}
  raise notice '[HELM] Formulario de valor de Silvestre IA listo (${RAMAS.length} ramas).';
end $$;
`

writeFileSync(SALIDA, sql)
console.log(`escrito ${SALIDA.pathname} · ${RAMAS.length} ramas × 16 preguntas`)

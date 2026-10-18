// Genera migrations/helm_formulario_primermap_silvestre.sql a partir de
// src/pages/primermapa/preguntas.js.
//
// Mismo motivo que scripts/gen-form-valor-silvestre.mjs: el cuestionario vive
// en preguntas.js (es lo que pinta la página) pero el plugin Formularios lee la
// definición de helm_forms, en la base. Sacarlos del mismo sitio es lo único
// que garantiza que no se desincronicen.
//
//   node scripts/gen-form-primermap-silvestre.mjs
//
// Después hay que aplicar la migración como cualquier otra.
import { writeFileSync } from 'node:fs'
import { Q, SECTIONS } from '../src/pages/primermapa/preguntas.js'

const SALIDA = new URL('../migrations/helm_formulario_primermap_silvestre.sql', import.meta.url)

// Aquí sí va un formulario solo, al revés que en el de valor: el diagnóstico no
// tiene ramas excluyentes. De 55 preguntas, 15 son condicionales, así que una
// respuesta enseña unas 40 contestadas y el resto con raya — que es información
// real (a quien vende servicios no se le pregunta por stock), no ruido.
const TIPO = { multi: 'multi', scale: 'scale', text: 'long' }

const campoDe = (q) => ({
  key: q.id,
  // La sección delante: con 55 preguntas seguidas, saber que esta era de
  // "Captación" y no de "Venta" es la mitad de leer la respuesta.
  label: `${SECTIONS[q.sec]} · ${typeof q.q === 'function' ? q.q({}) : q.q}`,
  type: TIPO[q.type] || 'select',
  // Ninguna obligatoria: las condicionales no las ve todo el mundo, y marcarlas
  // como obligatorias haría que el panel las diera por incompletas siempre.
  required: false,
  ...(q.options ? { options: q.options.map(o => o.label) } : {}),
})

const campos = Q.map(campoDe)
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`

const sql = `-- HELM — Diagnóstico operativo de Silvestre IA en el plugin Formularios.
--
-- GENERADO por scripts/gen-form-primermap-silvestre.mjs a partir de
-- src/pages/primermapa/preguntas.js. No lo edites a mano: cambia las preguntas
-- allí y vuelve a lanzar el script.
--
-- El lead magnet de helm.s4sf.net/primermap ya metía el contacto en el CRM de
-- Silvestre, pero las respuestas se quedaban en las notas de la ficha. Con esto
-- salen donde se leen: la pestaña del formulario, pregunta y respuesta una
-- debajo de otra, igual que las de Detrás de Cámara.
--
-- Los datos de contacto (nombre, email, teléfono) no van como campos: viven en
-- la ficha del contacto, que es a donde apunta la respuesta.

do $$
declare
  v_client uuid;
begin
  select id into v_client from clients where lower(slug) = 'silvestre' limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil silvestre. El formulario NO se ha creado.';
    return;
  end if;

  insert into helm_forms (client_id, slug, title, description, fields, active)
  values (
    v_client,
    'primermap',
    ${sq('Diagnóstico operativo')},
    ${sq('Respuestas del lead magnet de helm.s4sf.net/primermap')},
    $json$${JSON.stringify(campos, null, 1)}$json$::jsonb,
    true
  )
  on conflict (client_id, slug) do update
     set title       = excluded.title,
         description = excluded.description,
         fields      = excluded.fields,
         active      = true,
         updated_at  = now();

  raise notice '[HELM] Diagnóstico operativo listo (${campos.length} preguntas).';
end $$;
`

writeFileSync(SALIDA, sql)
console.log(`escrito ${SALIDA.pathname} · ${campos.length} preguntas`)

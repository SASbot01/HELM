#!/usr/bin/env node
// Genera los dos formularios de helm_forms del autodiagnóstico de Elena
// Fontecha a partir de src/pages/elena/diagnostico.js (la misma fuente que
// pinta la página), para que web y CRM no se separen nunca.
//
//   node scripts/gen-form-valor-elena.mjs          escribe la migración
//   node scripts/gen-form-valor-elena.mjs --json   imprime los formularios en
//                                                  JSON (para aplicarlos en vivo)
//
// Un formulario por rama, como hizo Silvestre: el visor de respuestas pinta
// todos los campos del formulario, y así cada lead enseña solo lo suyo y el
// panel cuenta por separado personas y empresas.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PUERTA, RAMAS, CALCULADOS, valorDe } from '../src/pages/elena/diagnostico.js'

const CLIENT_ID = '1b17a1dc-e34a-4aaf-b55e-892e970550bc'
const SALIDA = fileURLToPath(new URL('../migrations/helm_formulario_valor_elenafontecha.sql', import.meta.url))

const FORMS = [
  {
    slug: RAMAS.persona.form,
    rama: 'persona',
    title: 'Autodiagnóstico · Para ti',
    pipeline: 'Captación (leads)',
    stage: 'lead',
    description: 'Landing VSL de Elena (/elenafontecha/valor), rama «Para mí». Preguntas que se adaptan al rol y a lo que quiere revisar; al enviar se calcula el perfil (Rodri, Laura o alta dirección) y la estación de entrada del recorrido. Entra en «Captación (leads)», etapa «Lead (autodiagnóstico)».',
  },
  {
    slug: RAMAS.empresa.form,
    rama: 'empresa',
    title: 'Autodiagnóstico · Empresa',
    pipeline: 'Empresas y equipos',
    stage: 'contacto',
    description: 'Landing VSL de Elena (/elenafontecha/valor), rama «Para mi equipo o mi empresa»: sector, tamaño, momento, a quién va, necesidades, formato, plazo, presupuesto y quién decide. Al enviar se calcula el perfil de empresa y por dónde empezar. Entra en «Empresas y equipos», etapa «Contacto». El nombre de la empresa va a la ficha del contacto.',
  },
]

const tipoCampo = (q) => (q.tipo === 'varios' ? 'multi' : q.tipo === 'texto' ? 'textarea' : 'select')
const etiqueta = (q) => q.labelCrm || (typeof q.label === 'function' ? q.label({}) : q.label)

const campo = (q) => ({
  key: q.key,
  label: etiqueta(q),
  type: tipoCampo(q),
  required: !q.opcional && !q.si,
  ...(q.options ? { options: q.options.map(valorDe) } : {}),
})

export function formularios() {
  return FORMS.map((f) => ({
    ...f,
    fields: [
      campo(PUERTA),
      ...RAMAS[f.rama].preguntas.map(campo),
      ...CALCULADOS[f.rama].map((c) => ({ key: c.key, label: c.label, type: 'text', required: false })),
    ],
  }))
}

function sql(forms) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const bloques = forms.map((f) => `
  -- ── ${f.title} (${f.slug}) → «${f.pipeline}» / ${f.stage} ──
  select id into v_pipeline from crm_pipelines
   where client_id = v_client and name = ${q(f.pipeline)} limit 1;
  if v_pipeline is null then
    raise notice '[HELM] Elena no tiene el embudo ${f.pipeline.replace(/'/g, "''")}: ${f.slug} queda sin embudo.';
  end if;
  insert into helm_forms (client_id, slug, title, description, fields, active, pipeline_id, stage_key, booked_stage_key)
  values (
    v_client, ${q(f.slug)}, ${q(f.title)},
    ${q(f.description)},
    $json$${JSON.stringify(f.fields, null, 2)}$json$::jsonb,
    true, v_pipeline, ${q(f.stage)}, null
  )
  on conflict (client_id, slug) do update
     set title = excluded.title, description = excluded.description, fields = excluded.fields,
         active = true, pipeline_id = excluded.pipeline_id, stage_key = excluded.stage_key,
         booked_stage_key = excluded.booked_stage_key, updated_at = now();`).join('\n')

  return `-- HELM — Autodiagnóstico de la landing VSL de Elena Fontecha (/elenafontecha/valor).
--
-- GENERADO por scripts/gen-form-valor-elena.mjs a partir de
-- src/pages/elena/diagnostico.js. No lo edites a mano: cambia las preguntas
-- allí y vuelve a lanzar el script.
--
-- Dos formularios, uno por rama de la puerta («Para mí» / «Para mi equipo o
-- mi empresa»), cada uno a su embudo. La página manda {slug:'elenafontecha',
-- form:'valor' | 'valor-empresa', ...} a /api/formularios, que descarta toda
-- clave que el formulario no declare. Los datos de contacto (nombre, correo,
-- teléfono, empresa) no van como campos: viven en la ficha del contacto.
--
-- El despliegue del minipc reconstruye el frontend pero no corre migraciones:
-- estos formularios se aplicaron también en vivo con supabase.js.
--
-- Idempotente: se puede aplicar más de una vez sin duplicar nada.

do $$
declare
  v_client   uuid;
  v_pipeline uuid;
begin
  select id into v_client from clients
   where id = '${CLIENT_ID}' or lower(slug) = 'elenafontecha' limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Elena Fontecha. Los formularios NO se han creado.';
    return;
  end if;
${bloques}

  raise notice '[HELM] Autodiagnóstico de Elena Fontecha listo (valor + valor-empresa).';
end $$;
`
}

const forms = formularios()
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ clientId: CLIENT_ID, forms }))
} else {
  writeFileSync(SALIDA, sql(forms))
  for (const f of forms) console.log(`${f.slug}: ${f.fields.length} campos → «${f.pipeline}» / ${f.stage}`)
  console.log('Escrito', SALIDA)
}

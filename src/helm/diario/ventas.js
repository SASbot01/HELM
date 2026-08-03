// HELM — el reporte que mueve el CRM.
//
// El CRM no se mueve solo, y es una decisión, no una carencia: las etapas se
// mueven cuando el closer hace su reporte. Lo único que pasa automático es esto
// — si en el reporte un lead figura como vendido, su ficha se va a la etapa
// ganada con el importe.
//
// Lo que NO se hace aquí: crear la venta. El dinero entra por Stripe o por Woo,
// que es lo que no se equivoca de importe. Si además se creara una fila de
// venta al reportar, la misma operación se contaría dos veces en Ventas, en
// Finanzas, en el Informe y en las comisiones.
import { supabase } from '../lib'
import { loadPipelines, pipelineDe, normalizeStage, WON_KEYS } from '../crm/pipeline'

// La etapa ganada REAL de un pipeline. No vale con poner 'ganado' a pelo: los
// pipelines viejos usan claves en inglés ('won') y uno hecho a mano puede
// llamarla 'cerrado'. Se busca la que signifique eso dentro de SUS etapas.
function etapaGanadaDe(stages = []) {
  const propia = stages.find(s => WON_KEYS.has(String(s.key).toLowerCase()))
  if (propia) return propia.key
  // Si este pipeline no tiene ninguna etapa de cierre, normalizeStage devuelve
  // la más parecida; y si tampoco, la primera. Mejor eso que dejarlo quieto sin
  // decir nada.
  return normalizeStage('ganado', stages)
}

/**
 * Pasa a ganado los contactos que el reporte marca como vendidos.
 *
 * Devuelve `{ movidos, fallos }` en vez de lanzar: el reporte ya está guardado
 * cuando esto corre, y tirarlo abajo porque un contacto se borró entre medias
 * sería perder el reporte entero por el caso raro.
 */
export async function marcarVendidos(clientId, ventas = []) {
  const limpias = (ventas || []).filter(v => v?.contact_id)
  if (limpias.length === 0) return { movidos: 0, fallos: [] }

  const pipelines = await loadPipelines(clientId).catch(() => [])
  const fallos = []
  let movidos = 0

  for (const v of limpias) {
    try {
      const { data: contacto } = await supabase
        .from('crm_contacts').select('id, name, pipeline_id, status')
        .eq('id', v.contact_id).eq('client_id', clientId).maybeSingle()
      if (!contacto) { fallos.push(`${v.name || v.contact_id}: ya no está en el CRM`); continue }

      const pipeline = pipelineDe(contacto, pipelines)
      const ganado = etapaGanadaDe(pipeline?.stages || [])
      const importe = Number(v.amount)

      const { error } = await supabase.from('crm_contacts').update({
        status: ganado,
        // El importe solo se pisa si viene: un reporte sin cifra no debe borrar
        // el valor que ya tuviera el trato.
        ...(Number.isFinite(importe) && importe > 0 ? { deal_value: importe } : {}),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).eq('id', contacto.id)
      if (error) { fallos.push(`${contacto.name}: ${error.message}`); continue }

      // Que quede por qué se movió. Sin esto, dentro de un mes la ficha dice
      // "ganado" y nadie sabe si lo movió una persona, Stripe o este reporte.
      await supabase.from('crm_activities').insert({
        client_id: clientId,
        contact_id: contacto.id,
        type: 'note',
        title: 'Cerrado en el reporte diario',
        description: Number.isFinite(importe) && importe > 0
          ? `Marcado como vendido por ${importe} €.`
          : 'Marcado como vendido, sin importe.',
        performed_by: 'Diario',
        performed_at: new Date().toISOString(),
      })
      movidos++
    } catch (err) {
      fallos.push(`${v.name || v.contact_id}: ${err.message}`)
    }
  }

  return { movidos, fallos }
}

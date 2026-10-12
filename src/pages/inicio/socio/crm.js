// El enlace de Socio IA con el CRM de HELM. Mismo perfil (`silvestre`) y mismo
// embudo ("Página de inicio") que la masterclass (ver ../crm.js); aquí solo va
// lo que añade el formulario de cualificación.
//
// La escritura la hace el servidor (api/leads.js · socio): ahí están las
// etapas, qué se adelanta y qué no, y cómo se suman las notas.
import { pideLead } from '../../leads.js'
import { origen } from './origen.js'

// ── Socio IA ────────────────────────────────────────────────────────────────
// El formulario de cualificación de la página principal. Guarda TODOS los
// envíos, encajen o no: el que no encaja hoy es el que factura el año que viene,
// y sin su ficha no hay a quién volver a escribir.
//
// Etapas del embudo "Página de inicio" (sql/pipeline_pagina_inicio.sql):
//   encaja    → cualificado      (el formulario ya hizo de filtro)
//   no encaja → nurturing        (se le manda a la clase gratis)
//   reserva   → llamada_agendada (lo marca marcaLlamada al volver de Cal.com)
// Quien ya está en "Llamada agendada" o es "Cliente" no retrocede por rellenar
// otra vez el formulario.

/**
 * Da de alta (o actualiza) a quien rellena el formulario de Socio IA.
 * `respuestas` = { que_vende, precio, facturacion, resultados, nombre, email, instagram, rgpd }
 */
export async function altaSocio({ respuestas, encaja, titular }) {
  if (!String(respuestas.email || '').trim()) throw new Error('Falta el email')
  // Las UTM del Reel, guardadas desde la primera página que pisó (origen.js).
  return pideLead('socio', { respuestas, encaja: Boolean(encaja), titular, origen: origen() })
}

/**
 * Marca que ha reservado la llamada. Nunca lanza: la reserva ya está hecha en
 * el calendario, y que falle la anotación no puede dejarle sin su /gracias.
 */
export async function marcaLlamada(id) {
  if (!id) return
  try {
    await pideLead('nota', { id, texto: 'Socio IA: reservó la auditoría en el calendario' })
  } catch {
    // En silencio a propósito.
  }
}

// HELM — CRM · el contacto: normalización y validación.
//
// Vive aquí y no dentro de Crm.jsx porque el alta manual (modal "Nuevo
// contacto") y la ficha (drawer) tienen que comportarse EXACTAMENTE igual: los
// mismos campos, la misma limpieza al guardar y los mismos errores. Cuando
// estaban duplicados, el drawer no dejaba tocar el origen y aceptaba emails que
// el alta rechazaba. Los campos los pinta ./ContactFields.jsx y las etapas del
// pipeline (que son configurables por perfil) viven en ./pipeline.js.
import { normalizeStage } from './pipeline'

// Orígenes sugeridos. Es un datalist, no un select cerrado: se puede escribir
// cualquier otro y se guarda tal cual.
export const SOURCES = [
  'Instagram', 'WhatsApp', 'Referido', 'Web', 'LinkedIn', 'YouTube', 'TikTok',
  'Anuncios', 'Cold email', 'Cold call', 'Evento', 'Newsletter',
]

export const EMPTY_CONTACT = {
  name: '', company: '', position: '',
  email: '', phone: '', whatsapp: '',
  instagram: '', linkedin: '', website: '',
  country: '', address: '',
  source: '', status: 'lead', deal_value: '', assigned_to: '',
  service_id: '',        // servicio contratado (helm_services)
  substages: [],         // subetapas dentro de su columna del pipeline
  tags: '', notes: '',
}

// ── Normalización ──────────────────────────────────────────────────────────
// Todo lo que escribe una persona a mano llega sucio: espacios de copiar y
// pegar, la arroba del handle, el dominio delante, mayúsculas en el email.

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const RE_PHONE = /^\+?[0-9][0-9\s().-]{5,19}$/

export const digitsOf = (v) => String(v || '').replace(/\D/g, '')

// Handle de Instagram: acepta "@juan", "juan", o la URL completa.
const cleanHandle = (v, host) => String(v || '').trim()
  .replace(new RegExp(`^(https?://)?(www\\.)?${host}/`, 'i'), '')
  .replace(/^@+/, '')
  .replace(/[/?#].*$/, '')
  .trim()

// URL: si no trae protocolo se le pone https:// para que el enlace funcione.
const cleanUrl = (v) => {
  const t = String(v || '').trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : 'https://' + t
}

// Etiquetas: "vip, madrid,  b2b" → ['vip','madrid','b2b'] sin vacíos ni repetidas.
export const parseTags = (v) => {
  if (Array.isArray(v)) return v
  return [...new Set(String(v || '').split(',').map(t => t.trim()).filter(Boolean))]
}

// Formulario → fila lista para Supabase. Es la única puerta de escritura:
// si un campo necesita limpieza, se limpia aquí y vale para alta y edición.
// `stages` son las etapas configuradas de este perfil, para no dejar a nadie
// en una etapa que ya no existe.
export function toRow(form, stages) {
  const value = form.deal_value === '' || form.deal_value == null ? 0 : Number(form.deal_value)
  return {
    name: form.name.trim(),
    company: form.company.trim(),
    position: form.position.trim(),
    email: form.email.trim().toLowerCase(),
    phone: form.phone.trim(),
    whatsapp: form.whatsapp.trim(),
    instagram: cleanHandle(form.instagram, 'instagram\\.com'),
    linkedin: cleanUrl(form.linkedin),
    website: cleanUrl(form.website),
    country: form.country.trim(),
    address: form.address.trim(),
    source: form.source.trim(),
    status: normalizeStage(form.status, stages),
    deal_value: Number.isFinite(value) && value > 0 ? value : 0,
    assigned_to: form.assigned_to.trim(),
    service_id: form.service_id || null,
    substages: Array.isArray(form.substages) ? form.substages : [],
    tags: parseTags(form.tags),
    notes: form.notes.trim(),
  }
}

// Fila de Supabase → formulario. El inverso de toRow, para abrir la ficha.
export function toForm(row = {}, stages) {
  return {
    ...EMPTY_CONTACT,
    ...Object.fromEntries(Object.keys(EMPTY_CONTACT).map(k => [k, row[k] ?? EMPTY_CONTACT[k]])),
    status: normalizeStage(row.status, stages),
    service_id: row.service_id || '',
    substages: Array.isArray(row.substages) ? row.substages : [],
    deal_value: row.deal_value == null || Number(row.deal_value) === 0 ? '' : String(row.deal_value),
    tags: Array.isArray(row.tags) ? row.tags.join(', ') : (row.tags || ''),
  }
}

// ── Validación ─────────────────────────────────────────────────────────────
// Devuelve { errors, dup }. `errors` bloquea el guardado; `dup` solo avisa
// (un mismo email puede repetirse legítimamente: dos contactos de una empresa).

export function validate(form, { rows = [], ignoreId = null } = {}) {
  const errors = {}

  if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
  else if (form.name.trim().length < 2) errors.name = 'Demasiado corto'

  const email = form.email.trim()
  if (email && !RE_EMAIL.test(email)) errors.email = 'Email no válido (ej. nombre@empresa.com)'

  const phone = form.phone.trim()
  if (phone && !RE_PHONE.test(phone)) errors.phone = 'Teléfono no válido (6-20 dígitos, se admite +34)'

  const wa = form.whatsapp.trim()
  if (wa && !RE_PHONE.test(wa)) errors.whatsapp = 'WhatsApp no válido'

  if (form.deal_value !== '') {
    const n = Number(form.deal_value)
    if (!Number.isFinite(n)) errors.deal_value = 'Tiene que ser un número'
    else if (n < 0) errors.deal_value = 'No puede ser negativo'
    else if (n > 100_000_000) errors.deal_value = 'Importe fuera de rango'
  }

  // Duplicados: mismo email, o mismo teléfono comparando solo los dígitos
  // (para que "+34 600 11 22 33" y "0034600112233" cuenten como el mismo).
  const emailKey = email.toLowerCase()
  const phoneKey = digitsOf(phone).slice(-9)
  const dup = rows.find(r => {
    if (r.id === ignoreId) return false
    if (emailKey && (r.email || '').toLowerCase() === emailKey) return true
    if (phoneKey.length >= 9 && digitsOf(r.phone).slice(-9) === phoneKey) return true
    return false
  }) || null

  return { errors, dup, ok: Object.keys(errors).length === 0 }
}

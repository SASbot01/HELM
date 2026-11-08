// HELM — /api/creditos es hoy /api/licencia.
//
// Desde el 7-nov-2026 HELM no vende créditos: cada agencia paga una licencia
// anual (api/licencia.js). Este archivo se queda porque el webhook de Stripe
// sigue registrado como /api/creditos?action=webhook: la misma puerta, las
// mismas acciones.
export { default } from './licencia.js'

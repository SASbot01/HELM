-- ─────────────────────────────────────────────────────────────────────────────
-- Global seed: BlackWolf growth launch flow template
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a second global process template (client_id = NULL) that matches the
-- real onboarding & fulfillment flow used at BlackWolf for growth clients:
--   1. Estrategia & Assets
--   2. Captación Orgánica (IG Stories / Reels / YouTube / tráfico a landing)
--   3. Cualificación & Nurturing (formulario → comunidad WhatsApp → webinar)
--   4. Lanzamiento (Webinar)
--   5. Fulfillment & Post-Lanzamiento
--
-- Notes:
--   • Ads y campañas se trackean en el módulo de Marketing — aquí solo lo
--     orgánico + estrategia + fulfillment.
--   • is_default = false: NO desplaza la plantilla default existente
--     ("Lanzamiento Info Producto - Estándar").
--   • Idempotente: el INSERT está guardado por `name`, se puede re-ejecutar.
--   • Los globals (client_id IS NULL) son read-only en la UI: solo se pueden
--     clonar, no editar ni eliminar.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO info_producto_process_templates (client_id, name, description, is_default, phases)
SELECT NULL,
       'Lanzamiento Growth — Onboarding & Fulfillment',
       'Flujo estándar BlackWolf: estrategia → captación orgánica → cualificación en comunidad → webinar de lanzamiento → fulfillment. Los ads y campañas se trackean en Marketing.',
       false,
       '[
         {
           "key": "estrategia",
           "label": "Estrategia & Assets",
           "order": 1,
           "steps": [
             { "key": "brief_avatar", "label": "Brief de avatar y promesa", "order": 1 },
             { "key": "lead_magnet", "label": "Crear lead magnet", "order": 2 },
             { "key": "guion_vsl", "label": "Guión + grabación de VSL", "order": 3 },
             { "key": "landing_page", "label": "Landing page con VSL y formulario", "order": 4 },
             { "key": "formulario_cualif", "label": "Formulario de cualificación de avatar", "order": 5 },
             { "key": "comunidad_whatsapp", "label": "Setup comunidad de WhatsApp", "order": 6 },
             { "key": "copies_landing", "label": "Copies landing page", "order": 7 },
             { "key": "copies_comunidad", "label": "Copies comunidad / bienvenida", "order": 8 },
             { "key": "estrategia_contenido", "label": "Estrategia de contenido (IG / Reels / YouTube)", "order": 9 }
           ]
         },
         {
           "key": "captacion",
           "label": "Captación Orgánica",
           "order": 2,
           "steps": [
             { "key": "instagram_stories", "label": "Instagram Stories", "order": 1 },
             { "key": "reels", "label": "Reels", "order": 2 },
             { "key": "youtube", "label": "YouTube", "order": 3 },
             { "key": "trafico_landing", "label": "Tráfico a landing page", "order": 4 }
           ]
         },
         {
           "key": "cualificacion",
           "label": "Cualificación & Nurturing",
           "order": 3,
           "steps": [
             { "key": "form_submit", "label": "Lead rellena formulario", "order": 1 },
             { "key": "entrada_comunidad", "label": "Entrada a comunidad de WhatsApp", "order": 2 },
             { "key": "nurturing", "label": "Nurturing en comunidad (contenido + copies)", "order": 3 },
             { "key": "invitacion_webinar", "label": "Invitación al webinar de lanzamiento", "order": 4 },
             { "key": "recordatorios", "label": "Recordatorios pre-webinar", "order": 5 }
           ]
         },
         {
           "key": "lanzamiento",
           "label": "Lanzamiento (Webinar)",
           "order": 4,
           "steps": [
             { "key": "webinar_vivo", "label": "Webinar en vivo", "order": 1 },
             { "key": "oferta_cta", "label": "Oferta y CTA", "order": 2 },
             { "key": "cierre", "label": "Cierre de ventas", "order": 3 },
             { "key": "replay", "label": "Replay + seguimiento", "order": 4 }
           ]
         },
         {
           "key": "fulfillment",
           "label": "Fulfillment & Post-Lanzamiento",
           "order": 5,
           "steps": [
             { "key": "onboarding_cliente", "label": "Onboarding del cliente", "order": 1 },
             { "key": "entrega_producto", "label": "Entrega del producto / acceso", "order": 2 },
             { "key": "comunidad_clientes", "label": "Comunidad privada de clientes", "order": 3 },
             { "key": "seguimiento", "label": "Seguimiento y soporte", "order": 4 },
             { "key": "upsell", "label": "Upsell / cross-sell", "order": 5 }
           ]
         }
       ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM info_producto_process_templates
  WHERE name = 'Lanzamiento Growth — Onboarding & Fulfillment'
    AND client_id IS NULL
);

-- 066_whatsapp_phone_placeholder.sql
-- Corrige el placeholder del campo "phone" del servicio whatsapp_qr.
-- El formato anterior (+34 600 000 000) tenía espacios que pueden inducir
-- a error: la librería whatsapp-web.js identifica chats con el formato
-- internacional E.164 sin espacios ni guiones (ej. +34612345678). Ponemos
-- el placeholder en el formato exacto requerido para que el usuario no
-- introduzca caracteres inválidos.

update integration_services
set fields = jsonb_build_array(
  jsonb_build_object(
    'key', 'phone',
    'label', 'Número asociado (E.164)',
    'type', 'tel',
    'required', false,
    'placeholder', '+34612345678'
  )
)
where key = 'whatsapp_qr';

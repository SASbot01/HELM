-- ─────────────────────────────────────────────────────────────────────────────
-- Template de email para CONFIRMACIÓN AUTOMÁTICA de reserva.
-- category='booking_confirmation' — el front (BookPublic.jsx) busca por esa
-- categoría y dispara el envío vía /api/send-email (Resend) al hacer booking.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  bw_id uuid;
BEGIN
  SELECT id INTO bw_id FROM clients WHERE slug = 'black-wolf';
  IF bw_id IS NULL THEN
    RAISE EXCEPTION 'No existe el cliente con slug=black-wolf.';
  END IF;

  -- Reemplaza cualquier template previo con ese nombre
  DELETE FROM email_templates
   WHERE client_id = bw_id
     AND name = 'Booking · Confirmación automática';

  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Booking · Confirmación automática',
    'Reserva confirmada · {{host_name}} · {{meeting_date}}',
    'booking_confirmation',
    $html$
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1a1a1a;background:#ffffff;">

  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:18px;font-weight:600;letter-spacing:-0.01em;">MINIMAL <span style="color:#737373;font-weight:400;">· by BlackWolf</span></div>
  </div>

  <div style="background:#f5f5f7;border-radius:12px;padding:28px;margin-bottom:24px;">
    <div style="font-size:11px;color:#737373;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;margin-bottom:10px;">Reserva confirmada</div>
    <h1 style="font-size:24px;font-weight:600;letter-spacing:-0.02em;margin:0 0 14px;line-height:1.25;">
      Nos vemos el {{meeting_date}}
    </h1>
    <p style="font-size:15px;color:#525252;line-height:1.55;margin:0;">
      Hola {{guest_name}}, tu llamada con <strong style="color:#1a1a1a;">{{host_name}}</strong> ({{host_role}}) está confirmada.
    </p>
  </div>

  <div style="background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:0;margin-bottom:24px;overflow:hidden;">
    <div style="padding:16px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;">
      <span style="color:#737373;font-size:13px;">Fecha</span>
      <span style="font-weight:600;font-size:13px;">{{meeting_date}}</span>
    </div>
    <div style="padding:16px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;">
      <span style="color:#737373;font-size:13px;">Hora</span>
      <span style="font-weight:600;font-size:13px;">{{meeting_time}} – {{meeting_end}}</span>
    </div>
    <div style="padding:16px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;">
      <span style="color:#737373;font-size:13px;">Duración</span>
      <span style="font-weight:600;font-size:13px;">{{duration}}</span>
    </div>
    <div style="padding:16px 22px;display:flex;justify-content:space-between;">
      <span style="color:#737373;font-size:13px;">Con</span>
      <span style="font-weight:600;font-size:13px;">{{host_name}}</span>
    </div>
  </div>

  <div style="margin-bottom:28px;">
    <a href="{{meeting_url}}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:500;letter-spacing:-0.005em;">
      Unirse a la videollamada →
    </a>
    <div style="font-size:11px;color:#a3a3a3;margin-top:10px;">
      Te enviaremos el enlace definitivo unos minutos antes.
    </div>
  </div>

  <div style="background:#fafafa;border-radius:10px;padding:20px;margin-bottom:24px;">
    <div style="font-size:12px;font-weight:600;color:#1a1a1a;margin-bottom:8px;">Para aprovechar bien los {{duration}}:</div>
    <ul style="margin:0;padding:0 0 0 18px;color:#525252;font-size:13px;line-height:1.7;">
      <li>Ten a mano qué herramientas usáis hoy (CRM, email, dashboards).</li>
      <li>Piensa cómo entra un lead hasta cómo se cobra en tu negocio.</li>
      <li>Apunta 1 o 2 cosas que te frustran de cómo opera el equipo.</li>
    </ul>
  </div>

  <div style="padding-top:20px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;line-height:1.6;">
    ¿Necesitas reagendar? <a href="{{reschedule_url}}" style="color:#1a1a1a;text-decoration:underline;">Elige otro horario aquí</a>.<br/>
    Si tienes dudas antes de la reunión, responde a este email.
  </div>

  <div style="margin-top:24px;text-align:center;font-size:11px;color:#a3a3a3;">
    BlackWolf Security · blackwolfsec.io
  </div>

</div>
$html$
  );

  RAISE NOTICE 'Template de confirmación de reserva insertado.';
END $$;

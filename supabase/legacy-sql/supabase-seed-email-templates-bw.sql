-- ─────────────────────────────────────────────────────────────────────────────
-- Plantillas de email comerciales para BlackWolf.
-- Se insertan en email_templates bajo el cliente con slug='black-wolf'.
-- Aparecerán en Email Marketing → Plantillas.
-- Ejecutar múltiples veces es seguro (usa ON CONFLICT por nombre).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  bw_id uuid;
BEGIN
  SELECT id INTO bw_id FROM clients WHERE slug = 'black-wolf';
  IF bw_id IS NULL THEN
    RAISE EXCEPTION 'No existe el cliente con slug=black-wolf.';
  END IF;

  -- Evita duplicados: borra primero las plantillas con nuestros nombres canónicos
  DELETE FROM email_templates
   WHERE client_id = bw_id
     AND name IN (
       'Outbound · Cold 1 — hook',
       'Outbound · Cold 2 — follow-up día 3',
       'Outbound · Cold 3 — último toque día 7',
       'Demo · Confirmación de cita',
       'Demo · Recordatorio 24h antes',
       'Post-demo · Propuesta enviada',
       'Post-demo · Follow-up 48h sin respuesta',
       'Onboarding · Bienvenida cliente nuevo',
       'Renewal · Aviso de renovación 15 días antes'
     );

  -- ── 1. Cold outbound — hook inicial ────────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Outbound · Cold 1 — hook',
    '{{first_name}}, encontré 2 cosas en {{company}}',
    'outbound',
    $html$
<p>Hola {{first_name}},</p>
<p>Vi tu perfil en LinkedIn y revisé {{company}} rápido esta mañana. Detecté 2 cosas que probablemente están costándote horas o dinero que no ves:</p>
<ul>
  <li>{{pain_1}}</li>
  <li>{{pain_2}}</li>
</ul>
<p>Hice un vídeo de 5 minutos mostrando cómo lo resolvemos con MINIMAL, la plataforma que construimos para empresas como {{company}}.</p>
<p><a href="https://blackwolfsec.io/landing?utm_source=email&amp;utm_campaign=cold1">Verlo aquí</a> · toma 5 minutos.</p>
<p>Un saludo,<br/>Alex · BlackWolf</p>
$html$
  );

  -- ── 2. Cold — follow-up día 3 ──────────────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Outbound · Cold 2 — follow-up día 3',
    'Re: {{first_name}}, encontré 2 cosas en {{company}}',
    'outbound',
    $html$
<p>{{first_name}},</p>
<p>Por si se perdió en la bandeja — aquí el vídeo:<br/>
<a href="https://blackwolfsec.io/landing?utm_source=email&amp;utm_campaign=cold2">blackwolfsec.io/landing</a></p>
<p>El 80% de las empresas que lo ven agendan demo. El otro 20% me dice por qué no aplica y me ahorra tiempo. Ambas respuestas me sirven.</p>
<p>¿Cuál es la tuya?</p>
<p>Alex</p>
$html$
  );

  -- ── 3. Cold — último toque día 7 ───────────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Outbound · Cold 3 — último toque día 7',
    'Última vez que te escribo, {{first_name}}',
    'outbound',
    $html$
<p>{{first_name}},</p>
<p>Prometo que este es el último email.</p>
<p>Si MINIMAL no es para {{company}} ahora, zero drama, lo entiendo. Pero si hay 1% de curiosidad, este es el link directo a mi calendario:<br/>
<a href="{{calendly_url}}">{{calendly_url}}</a></p>
<p>30 minutos, sin venta forzada, sin compromiso. Te muestro qué haríamos específicamente en tu negocio y te vas con el plan — lo apliques con nosotros o con quien quieras.</p>
<p>Un saludo,<br/>Alex · BlackWolf</p>
$html$
  );

  -- ── 4. Demo — confirmación ─────────────────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Demo · Confirmación de cita',
    'Confirmada · Demo MINIMAL el {{meeting_date}}',
    'demo',
    $html$
<p>Hola {{first_name}},</p>
<p>Confirmado — nos vemos el <strong>{{meeting_date}}</strong> a las <strong>{{meeting_time}}</strong>.</p>
<p>Link de la reunión: <a href="{{meeting_link}}">{{meeting_link}}</a></p>
<p>Para aprovechar bien los 30 minutos te pediría que vengas con:</p>
<ul>
  <li>Qué herramientas usáis hoy en {{company}} (CRM, email, ventas, finanzas).</li>
  <li>El proceso básico: cómo entra un lead hasta cómo se cobra.</li>
  <li>1 o 2 cosas concretas que te frustran de cómo opera el equipo hoy.</li>
</ul>
<p>No hace falta que lo prepares por escrito — simplemente tenlo en la cabeza.</p>
<p>Nos vemos,<br/>Alex · BlackWolf</p>
$html$
  );

  -- ── 5. Demo — recordatorio 24h antes ──────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Demo · Recordatorio 24h antes',
    'Recordatorio · Mañana nos vemos — MINIMAL',
    'demo',
    $html$
<p>Hola {{first_name}},</p>
<p>Pequeño recordatorio: mañana <strong>{{meeting_date}}</strong> a las <strong>{{meeting_time}}</strong> nos vemos 30 minutos.</p>
<p>Link: <a href="{{meeting_link}}">{{meeting_link}}</a></p>
<p>Si te surge algo y no puedes, dímelo por aquí o <a href="{{reschedule_link}}">reagenda en un click</a>.</p>
<p>Un saludo,<br/>Alex</p>
$html$
  );

  -- ── 6. Post-demo — propuesta enviada ───────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Post-demo · Propuesta enviada',
    '{{first_name}} — resumen de lo que hablamos y propuesta',
    'proposal',
    $html$
<p>Hola {{first_name}},</p>
<p>Gracias por el tiempo de hoy. Te dejo un resumen de lo que identificamos y la propuesta:</p>
<h3>Lo que observamos en {{company}}</h3>
<ul>
  <li>{{insight_1}}</li>
  <li>{{insight_2}}</li>
  <li>{{insight_3}}</li>
</ul>
<h3>Plan que te propongo</h3>
<p><strong>Plan {{plan_name}}</strong> · {{plan_price}} · setup en {{setup_days}} días.</p>
<p>Link a la propuesta completa en PDF: <a href="{{proposal_link}}">{{proposal_link}}</a></p>
<p>Si encaja, me dices y arrancamos esta semana. Si tienes dudas, me llamas o escribes cuando quieras.</p>
<p>Un saludo,<br/>Alex · BlackWolf</p>
$html$
  );

  -- ── 7. Post-demo — follow-up 48h ───────────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Post-demo · Follow-up 48h sin respuesta',
    'Re: {{first_name}} — resumen de lo que hablamos',
    'proposal',
    $html$
<p>{{first_name}},</p>
<p>Te retomo porque la propuesta te la mandé hace un par de días y no queda mucha capacidad este mes.</p>
<p>Solo quería saber:</p>
<ol>
  <li>¿Tiene sentido el plan que te propuse ({{plan_name}})?</li>
  <li>¿Hay algo que te frene — precio, calendario, scope?</li>
  <li>¿Necesitas hablar con alguien más del equipo antes de decidir?</li>
</ol>
<p>Si me respondes a cualquiera de las tres, te doy la respuesta exacta que necesitas.</p>
<p>Un saludo,<br/>Alex</p>
$html$
  );

  -- ── 8. Onboarding — bienvenida cliente nuevo ───────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Onboarding · Bienvenida cliente nuevo',
    'Bienvenido a BlackWolf · Primeros pasos en {{company}}',
    'onboarding',
    $html$
<p>Hola {{first_name}},</p>
<p>Bienvenido. Ya tienes acceso a MINIMAL en tu dominio <strong>{{tenant_url}}</strong>.</p>
<p>Esto es lo que pasa las próximas 72 horas:</p>
<ol>
  <li><strong>Hoy:</strong> recibes este email y las credenciales de tu equipo.</li>
  <li><strong>Mañana:</strong> sesión de kickoff de 45 minutos con {{operator_name}} (tu operador asignado) para mapear tu operación real.</li>
  <li><strong>Día 3:</strong> entregamos el sistema con tus dashboards, CRM y automatizaciones configurados.</li>
  <li><strong>Día 4:</strong> formación del equipo — 30 minutos por rol.</li>
</ol>
<p>Tu operador es {{operator_name}} ({{operator_email}}). Canal directo por WhatsApp o Slack a partir del kickoff.</p>
<p>Si necesitas cualquier cosa antes de mañana, respóndeme a este email.</p>
<p>Un saludo,<br/>Alex · BlackWolf</p>
$html$
  );

  -- ── 9. Renewal — aviso 15 días antes ───────────────────────────────────
  INSERT INTO email_templates (client_id, name, subject, category, html_content) VALUES (
    bw_id,
    'Renewal · Aviso de renovación 15 días antes',
    '{{first_name}} — renovación de {{company}} en 15 días',
    'renewal',
    $html$
<p>Hola {{first_name}},</p>
<p>Te aviso con tiempo: la renovación de tu plan <strong>{{plan_name}}</strong> es el <strong>{{renewal_date}}</strong>.</p>
<p>Resumen del último mes:</p>
<ul>
  <li>{{metric_1}}</li>
  <li>{{metric_2}}</li>
  <li>{{metric_3}}</li>
</ul>
<p>No hay nada que hacer por tu parte — la renovación es automática al mismo precio. Si quieres ajustar el plan, subirte de tier o revisar algo, me dices y montamos una call.</p>
<p>Un saludo,<br/>Alex</p>
$html$
  );

  RAISE NOTICE 'Plantillas de email insertadas en BlackWolf. Ve a Email Marketing → Plantillas.';
END $$;

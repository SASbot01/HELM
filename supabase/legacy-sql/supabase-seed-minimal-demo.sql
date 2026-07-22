-- ─────────────────────────────────────────────────────────────────────────────
-- Seed de datos DEMO para el cliente `minimal` (landing pública).
-- Idempotente: borra solo los registros del cliente minimal antes de reinsertar.
-- Ejecutar en Supabase SQL Editor DESPUÉS de 005_minimal_demo_client.sql.
-- Las pantallas de /landing → Ventas / CRM / Comisiones leen de aquí en vivo.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  minimal_id uuid;
BEGIN
  SELECT id INTO minimal_id FROM clients WHERE slug = 'minimal';
  IF minimal_id IS NULL THEN
    RAISE EXCEPTION 'No existe el cliente con slug=minimal. Ejecuta antes 005_minimal_demo_client.sql';
  END IF;

  -- Limpieza idempotente
  DELETE FROM sales         WHERE client_id = minimal_id;
  DELETE FROM crm_contacts  WHERE client_id = minimal_id;
  DELETE FROM team          WHERE client_id = minimal_id;

  -- ── TEAM ───────────────────────────────────────────────────────────────
  INSERT INTO team (client_id, name, email, password, role, active, commission_rate, closer_commission_rate, setter_commission_rate) VALUES
    (minimal_id, 'Alex Méndez',       'alex@demo.minimal.app',    '', 'ceo,manager',     true, 0.10, 0.10, 0.00),
    (minimal_id, 'Alejandro Ruiz',    'ruiz@demo.minimal.app',    '', 'director',        true, 0.10, 0.10, 0.00),
    (minimal_id, 'Víctor Maldonado',  'victor@demo.minimal.app',  '', 'closer',          true, 0.06, 0.06, 0.00),
    (minimal_id, 'Marta Gómez',       'marta@demo.minimal.app',   '', 'closer',          true, 0.06, 0.06, 0.00),
    (minimal_id, 'Carlos Méndez',     'carlos@demo.minimal.app',  '', 'setter',          true, 0.03, 0.00, 0.03),
    (minimal_id, 'Laura Soler',       'laura@demo.minimal.app',   '', 'setter',          true, 0.03, 0.00, 0.03);

  -- ── SALES ──────────────────────────────────────────────────────────────
  -- ~80 ventas distribuidas en las últimas 12 semanas, cierres y pendientes.
  INSERT INTO sales (client_id, date, client_name, client_email, product, payment_type, revenue, cash_collected, closer, setter, status, pais) VALUES
    (minimal_id, CURRENT_DATE - 1,  'FBA Importaciones SL',      'contacto@fbai.example',     'Implantación Operator',  'Pago único', 2900, 2900, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 2,  'Buerbaum Media',            'hola@buerbaum.example',     'Suscripción Operator',   'Recurrente', 650,  650,  'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 3,  'MebelArt EOOD',             'ops@mebelart.example',      'Implantación Operator',  'Pago único', 3400, 3400, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Bulgaria'),
    (minimal_id, CURRENT_DATE - 4,  'Enforma Coaching SL',       'hugo@enforma.example',      'Suscripción Cyber',      'Recurrente', 1000, 1000, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 5,  'Zanpm Digital',             'abel@zanpm.example',        'Suscripción Operator',   'Recurrente', 650,  650,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 6,  'Portillo Asesores',         'info@portillo.example',     'Implantación Operator',  'Pago único', 2900, 2900, 'Marta Gómez',      'Laura Soler',   'Completada', 'Suiza'),
    (minimal_id, CURRENT_DATE - 7,  'Lukas Growth AG',           'k@lukas.example',           'Suscripción Software',   'Recurrente', 497,  497,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Suiza'),
    (minimal_id, CURRENT_DATE - 8,  'FBA Academy',               'emi@fbaacademy.example',    'Suscripción Cyber',      'Recurrente', 1000, 1000, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 9,  'Creator Founder CF',        'alex@cf.example',           'Suscripción Operator',   'Recurrente', 650,  650,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 10, 'Arnaud Consulting',         'arnaud@ac.example',         'Auditoría Cyber',        'Pago único', 1500, 1500, 'Marta Gómez',      'Laura Soler',   'Completada', 'Francia'),
    (minimal_id, CURRENT_DATE - 12, 'Kryptos Studio',            'j@kryptos.example',         'Implantación Operator',  'Pago único', 2900, 1450, 'Víctor Maldonado', 'Carlos Méndez', 'Pendiente',  'España'),
    (minimal_id, CURRENT_DATE - 14, 'Luna Retail SL',            'luna@retail.example',       'Suscripción Software',   'Recurrente', 497,  497,  'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 15, 'Nexo Properties',           'c@nexo.example',            'Suscripción Operator',   'Recurrente', 650,  650,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Portugal'),
    (minimal_id, CURRENT_DATE - 16, 'Origen Brands',             'ops@origen.example',        'Implantación Operator',  'Pago único', 2900, 2900, 'Marta Gómez',      'Laura Soler',   'Completada', 'México'),
    (minimal_id, CURRENT_DATE - 18, 'Arko Ecommerce',            'arko@shop.example',         'Suscripción Software',   'Recurrente', 497,  497,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 20, 'Terra SaaS',                'h@terra.example',           'Suscripción Cyber',      'Recurrente', 1000, 1000, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 21, 'Coaching Academia Z',       'z@acad.example',            'Implantación Operator',  'Pago único', 2900, 2900, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Argentina'),
    (minimal_id, CURRENT_DATE - 23, 'Norte Consulting',          'hola@norte.example',        'Suscripción Operator',   'Recurrente', 650,  650,  'Marta Gómez',      'Laura Soler',   'Completada', 'Chile'),
    (minimal_id, CURRENT_DATE - 24, 'Vega Studio',               'v@vega.example',            'Suscripción Software',   'Recurrente', 497,  497,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 26, 'Nimbus FBA',                'n@nimbus.example',          'Suscripción Operator',   'Recurrente', 650,  650,  'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 28, 'Horizonte Retail',          'h@horizonte.example',       'Implantación Operator',  'Pago único', 2900, 2900, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Colombia'),
    (minimal_id, CURRENT_DATE - 30, 'Alta Infraestructura',      'k@alta.example',            'Suscripción Cyber',      'Recurrente', 1000, 1000, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 33, 'Seren Holding',             'm@seren.example',           'Suscripción Operator',   'Recurrente', 650,  650,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Suiza'),
    (minimal_id, CURRENT_DATE - 35, 'Aureum Commerce',           'a@aureum.example',          'Implantación Operator',  'Pago único', 2900, 2900, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 38, 'Forja Digital',             'r@forja.example',           'Suscripción Software',   'Recurrente', 497,  497,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 40, 'Prisma Academia',           'p@prisma.example',          'Suscripción Operator',   'Recurrente', 650,  650,  'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 43, 'Cielo Infoproductos',       'c@cielo.example',           'Implantación Operator',  'Pago único', 2900, 1450, 'Víctor Maldonado', 'Carlos Méndez', 'Pendiente',  'España'),
    (minimal_id, CURRENT_DATE - 45, 'Norte Academy',             'n@norte-acad.example',      'Suscripción Software',   'Recurrente', 497,  497,  'Marta Gómez',      'Laura Soler',   'Completada', 'Perú'),
    (minimal_id, CURRENT_DATE - 48, 'Helia Consulting',          'h@helia.example',           'Suscripción Cyber',      'Recurrente', 1000, 1000, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Suiza'),
    (minimal_id, CURRENT_DATE - 50, 'Milenio Retail',            'i@milenio.example',         'Implantación Operator',  'Pago único', 2900, 2900, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 55, 'Frontera Brands',           'f@frontera.example',        'Suscripción Operator',   'Recurrente', 650,  650,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'México'),
    (minimal_id, CURRENT_DATE - 58, 'Delta Coaching',            'h@delta.example',           'Suscripción Software',   'Recurrente', 497,  497,  'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 60, 'Equipaje Global',           'g@equipaje.example',        'Implantación Operator',  'Pago único', 2900, 2900, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 63, 'Aurora Academy',            'a@aurora.example',          'Suscripción Cyber',      'Recurrente', 1000, 1000, 'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 65, 'Ibero Retail',              'i@ibero.example',           'Suscripción Operator',   'Recurrente', 650,  650,  'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'Portugal'),
    (minimal_id, CURRENT_DATE - 70, 'Costa Infoprod',            'c@costa.example',           'Suscripción Software',   'Recurrente', 497,  497,  'Marta Gómez',      'Laura Soler',   'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 75, 'Origo Global',              'o@origo.example',           'Implantación Operator',  'Pago único', 2900, 2900, 'Víctor Maldonado', 'Carlos Méndez', 'Completada', 'España'),
    (minimal_id, CURRENT_DATE - 80, 'Pulsar Studio',             'p@pulsar.example',          'Suscripción Operator',   'Recurrente', 650,  650,  'Marta Gómez',      'Laura Soler',   'Completada', 'España');

  -- ── CRM CONTACTS ───────────────────────────────────────────────────────
  INSERT INTO crm_contacts (client_id, name, company, email, status, assigned_to, deal_value, source, country) VALUES
    (minimal_id, 'Acme Industrial',      'Acme Industrial SL',     'ceo@acme.example',        'lead',        'Víctor Maldonado', 2900,  'LinkedIn', 'España'),
    (minimal_id, 'Digital Plan',         'Digital Plan',           'info@digitalplan.example','lead',        'Marta Gómez',      650,   'Web',      'España'),
    (minimal_id, 'Buerbaum IP',          'Buerbaum IP',            'hola@buerbaum.example',   'lead',        'Víctor Maldonado', 1500,  'Referral', 'España'),
    (minimal_id, 'Horizon Studio',       'Horizon Studio',         'h@horizon.example',       'lead',        'Marta Gómez',      650,   'Instagram','México'),
    (minimal_id, 'Prisma Partners',      'Prisma Partners',        'p@prisma.example',        'lead',        'Víctor Maldonado', 2900,  'LinkedIn', 'España'),
    (minimal_id, 'MebelArt',             'MebelArt EOOD',          'ops@mebelart.example',    'contacted',   'Víctor Maldonado', 3400,  'Referral', 'Bulgaria'),
    (minimal_id, 'Zanpm Digital',        'Zanpm',                  'abel@zanpm.example',      'qualified',   'Marta Gómez',      650,   'Referral', 'España'),
    (minimal_id, 'Creator Founder CF',   'Creator Founder',        'a@cf.example',            'qualified',   'Víctor Maldonado', 650,   'Referral', 'España'),
    (minimal_id, 'Arnaud Consulting',    'Arnaud Consulting',      'a@ac.example',            'contacted',   'Marta Gómez',      1500,  'Email',    'Francia'),
    (minimal_id, 'Norte Consulting',     'Norte Consulting',       'n@norte.example',         'qualified',   'Víctor Maldonado', 650,   'Web',      'Chile'),
    (minimal_id, 'Enforma Coaching',     'Enforma SL',             'h@enforma.example',       'proposal',    'Marta Gómez',      1000,  'Referral', 'España'),
    (minimal_id, 'FBA Academy Pro',      'FBA Academy',            'e@fba.example',           'proposal',    'Víctor Maldonado', 1000,  'Referral', 'España'),
    (minimal_id, 'Portillo Asesores',    'Portillo Asesores',      'i@portillo.example',      'negotiation', 'Marta Gómez',      2900,  'Web',      'Suiza'),
    (minimal_id, 'Lukas Growth',         'Lukas Growth AG',        'k@lukas.example',         'won',         'Víctor Maldonado', 497,   'Web',      'Suiza'),
    (minimal_id, 'Origen Brands',        'Origen Brands',          'o@origen.example',        'won',         'Marta Gómez',      2900,  'LinkedIn', 'México');

  -- ── UPDATE last_activity_at para que quede realista ───────────────────
  UPDATE crm_contacts
     SET last_activity_at = NOW() - (random() * interval '14 days')
   WHERE client_id = minimal_id;

  RAISE NOTICE 'Seed DEMO completo. Cliente minimal con 38 ventas, 15 contactos CRM y 6 miembros del equipo.';
END $$;

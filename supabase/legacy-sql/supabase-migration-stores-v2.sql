-- ============================================
-- GESTIÓN DE TIENDAS v2 — Tickets, Client Portal
-- ============================================

-- 1. Store Clients (portal users for store buyers)
CREATE TABLE IF NOT EXISTS store_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  instagram TEXT,
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_clients_email_client
  ON store_clients(client_id, email);

-- 2. Support Tickets
CREATE TABLE IF NOT EXISTS store_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),

  opened_by TEXT NOT NULL DEFAULT 'client',       -- 'client', 'gestor', 'system'
  opened_by_name TEXT,

  assigned_gestor_id UUID REFERENCES team(id),

  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',             -- 'open', 'in_progress', 'waiting_client', 'waiting_gestor', 'resolved', 'closed'
  priority TEXT DEFAULT 'medium',                  -- 'low', 'medium', 'high', 'urgent'
  category TEXT DEFAULT 'general',                 -- 'account_issue', 'product_question', 'technical', 'schedule_call', 'general'

  scheduled_call_at TIMESTAMPTZ,                   -- for "agendar llamada" tickets

  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Ticket Messages (chat conversation)
CREATE TABLE IF NOT EXISTS store_ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES store_tickets(id) ON DELETE CASCADE,

  sender_type TEXT NOT NULL,    -- 'client', 'gestor', 'system'
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Add CRM link and client portal reference to stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS crm_contact_id UUID;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_client_id UUID;

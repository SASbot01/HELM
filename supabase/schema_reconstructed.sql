-- ============================================================================
-- APEX / apexallinone — Reconstructed database schema
-- Rebuilt from: legacy-sql base + 118 incremental migrations + frontend
-- VALID_COLUMNS contract + code-usage synthesis of dashboard-created tables.
-- Validated by executing the full set against PostgreSQL 16 (0 errors).
-- 193 tables + 8 views + functions/triggers/indexes + permissive RLS ("Allow all").
-- Run this ONCE on a FRESH Supabase project (SQL Editor or `supabase db push`).
-- ============================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- (public schema already exists in Supabase)


--
-- Name: apex_leads_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apex_leads_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: apex_newsletter_posts_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apex_newsletter_posts_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: apex_state_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apex_state_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: asesoriasuiza_job_offers_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asesoriasuiza_job_offers_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: auto_create_logistics_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_create_logistics_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only fire for logistics-tagged contacts moving to cerrado_ganado
  IF NEW.stage = 'cerrado_ganado'
     AND (OLD.stage IS NULL OR OLD.stage <> 'cerrado_ganado')
     AND NEW.tags @> '["logistics"]'::jsonb THEN

    INSERT INTO logistics_orders (
      client_id, customer_name, customer_email, customer_phone, customer_company,
      product_description, product_category,
      destination_country, shipping_method,
      weight_kg, carton_count,
      dimensions_l, dimensions_w, dimensions_h,
      estimated_price_min, estimated_price_max,
      source, notes, status
    ) VALUES (
      NEW.client_id,
      NEW.name,
      NEW.email,
      NEW.phone,
      NEW.company,
      COALESCE(NEW.custom_fields->>'product_description', NEW.custom_fields->>'producto_interes', ''),
      COALESCE(NEW.custom_fields->>'product_category', ''),
      COALESCE(NEW.custom_fields->>'destination_country', ''),
      COALESCE(NEW.custom_fields->>'shipping_method', 'sea'),
      (NEW.custom_fields->>'weight_kg')::NUMERIC,
      (NEW.custom_fields->>'carton_count')::INTEGER,
      (NEW.custom_fields->>'dimensions_l')::NUMERIC,
      (NEW.custom_fields->>'dimensions_w')::NUMERIC,
      (NEW.custom_fields->>'dimensions_h')::NUMERIC,
      (NEW.custom_fields->>'estimated_price_min')::NUMERIC,
      (NEW.custom_fields->>'estimated_price_max')::NUMERIC,
      'crm_pipeline',
      COALESCE(NEW.notes, ''),
      'pending_quote'
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: commission_rules_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commission_rules_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: compute_logistics_shares(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_logistics_shares() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.final_price IS NOT NULL THEN
    NEW.logistics_share := ROUND(NEW.final_price * 0.5, 2);
    NEW.emi_share := ROUND(NEW.final_price * 0.5, 2);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: generate_logistics_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_logistics_order_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'LOG-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO seq
    FROM logistics_orders
    WHERE client_id = NEW.client_id;
  NEW.order_number := 'LOG-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$;


--
-- Name: log_pricing_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_pricing_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only log when final_price is set and billable_weight exists
  IF NEW.final_price IS NOT NULL AND NEW.billable_weight IS NOT NULL AND NEW.billable_weight > 0 THEN
    -- Only fire when final_price actually changed
    IF OLD.final_price IS DISTINCT FROM NEW.final_price THEN
      INSERT INTO logistics_pricing_history (
        client_id, order_id, product_category, shipping_method,
        origin_country, destination_country, billable_weight, carton_count,
        needs_customs, is_dangerous,
        estimated_price_min, estimated_price_max, final_price,
        rate_per_kg, estimation_error_pct
      ) VALUES (
        NEW.client_id, NEW.id, NEW.product_category, NEW.shipping_method,
        NEW.origin_country, NEW.destination_country, NEW.billable_weight, NEW.carton_count,
        NEW.needs_customs, NEW.is_dangerous,
        NEW.estimated_price_min, NEW.estimated_price_max, NEW.final_price,
        ROUND(NEW.final_price / NEW.billable_weight, 4),
        CASE WHEN NEW.estimated_price_min IS NOT NULL AND NEW.estimated_price_max IS NOT NULL
          THEN ROUND(
            ((NEW.final_price - (NEW.estimated_price_min + NEW.estimated_price_max) / 2.0)
             / NULLIF((NEW.estimated_price_min + NEW.estimated_price_max) / 2.0, 0)) * 100, 2)
          ELSE NULL
        END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_task_assigned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_task_assigned() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  assignee_member_id UUID;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- assigned_to puede ser un member.id (uuid) o un email — resolvemos a member_id
  SELECT id INTO assignee_member_id FROM public.team
   WHERE client_id = NEW.client_id
     AND (id::text = NEW.assigned_to OR LOWER(email) = LOWER(NEW.assigned_to))
   LIMIT 1;

  IF assignee_member_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (client_id, member_id, type, title, body, link, resource_type, resource_id)
  VALUES (
    NEW.client_id, assignee_member_id, 'task_assigned',
    'Nueva tarea asignada',
    COALESCE(NEW.title, '(sin título)'),
    '/task-management',
    'crm_tasks', NEW.id::text
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_ticket_assigned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_ticket_assigned() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  assignee_member_id UUID;
  bw_client_id UUID;
BEGIN
  IF NEW.assigned_to_email IS NULL OR NEW.assigned_to_email = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to_email IS NOT DISTINCT FROM NEW.assigned_to_email THEN
    RETURN NEW;
  END IF;

  SELECT id INTO bw_client_id FROM public.clients WHERE slug='black-wolf' LIMIT 1;

  SELECT id INTO assignee_member_id FROM public.team
   WHERE LOWER(email) = LOWER(NEW.assigned_to_email)
     AND (client_id = NEW.client_id OR client_id = bw_client_id)
   LIMIT 1;

  IF assignee_member_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (client_id, member_id, type, title, body, link, resource_type, resource_id)
  VALUES (
    COALESCE(NEW.client_id, bw_client_id),
    assignee_member_id, 'ticket_assigned',
    'Nuevo ticket asignado',
    COALESCE(NEW.subject, '(sin asunto)'),
    '/ops/tickets/' || NEW.id::text,
    'ops_tickets', NEW.id::text
  );

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ops_ticket_pipeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_ticket_pipeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace text DEFAULT 'global'::text NOT NULL,
    stages jsonb DEFAULT '[{"key": "open", "kind": "open", "name": "Open", "color": "#3B82F6", "order": 1}, {"key": "in_review", "kind": "progress", "name": "In Review", "color": "#A855F7", "order": 2}, {"key": "in_progress", "kind": "progress", "name": "In Progress", "color": "#F59E0B", "order": 3}, {"key": "blocked", "kind": "progress", "name": "Blocked", "color": "#EF4444", "order": 4}, {"key": "done", "kind": "progress", "name": "Done", "color": "#22C55E", "order": 5}, {"key": "done_confirmed", "kind": "progress", "name": "Done Confirmed", "color": "#10B981", "order": 6}, {"key": "closed", "kind": "terminal", "name": "Closed", "color": "#6B7280", "order": 7}, {"key": "cancelled", "kind": "cancelled", "name": "Cancelled", "color": "#6B7280", "order": 8}]'::jsonb NOT NULL,
    types jsonb DEFAULT '[{"key": "bug", "icon": "AlertTriangle", "name": "Bug", "color": "#EF4444"}, {"key": "feature_request", "icon": "Sparkles", "name": "Feature Request", "color": "#A855F7"}, {"key": "operation", "icon": "Cog", "name": "Operation", "color": "#F59E0B"}, {"key": "support_question", "icon": "HelpCircle", "name": "Support / Question", "color": "#3B82F6"}]'::jsonb NOT NULL,
    priorities jsonb DEFAULT '[{"key": "urgent", "name": "Urgent", "color": "#EF4444", "order": 1, "sla_hours": 6}, {"key": "high", "name": "High", "color": "#F59E0B", "order": 2, "sla_hours": 12}, {"key": "mid", "name": "Mid", "color": "#3B82F6", "order": 3, "sla_hours": 24}, {"key": "low", "name": "Low", "color": "#6B7280", "order": 4, "sla_hours": 72}]'::jsonb NOT NULL,
    initial_stage_key text DEFAULT 'open'::text NOT NULL,
    done_stage_key text DEFAULT 'done'::text NOT NULL,
    done_confirmed_stage_key text DEFAULT 'done_confirmed'::text NOT NULL,
    closed_stage_key text DEFAULT 'closed'::text NOT NULL,
    cancelled_stage_key text DEFAULT 'cancelled'::text NOT NULL,
    auto_close_hours integer DEFAULT 72 NOT NULL,
    auto_close_enabled boolean DEFAULT true NOT NULL,
    done_prompt_message text DEFAULT 'Soporte ha marcado este ticket como Done. ¿Quieres confirmar que está correcto? Si no respondes en 72 horas, se cerrará automáticamente.'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: TABLE ops_ticket_pipeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ops_ticket_pipeline IS 'Configuración editable del pipeline de ops_tickets: stages, types, priorities, SLAs, mapeos semánticos. Singleton por workspace.';


--
-- Name: ops_pipeline_get(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_pipeline_get() RETURNS public.ops_ticket_pipeline
    LANGUAGE sql STABLE
    AS $$
  select * from ops_ticket_pipeline where workspace = 'global' limit 1;
$$;


--
-- Name: ops_pipeline_sla_hours(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_pipeline_sla_hours(p_priority text) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
declare
  cfg ops_ticket_pipeline;
  hours int;
begin
  cfg := ops_pipeline_get();
  if cfg is null then return 24; end if;
  select (p->>'sla_hours')::int into hours
  from jsonb_array_elements(cfg.priorities) p
  where p->>'key' = p_priority
  limit 1;
  return coalesce(hours, 24);
end
$$;


--
-- Name: ops_ticket_messages_touch_ticket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_ticket_messages_touch_ticket() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update ops_tickets
    set last_message_at = new.created_at,
        updated_at      = now()
  where id = new.ticket_id;
  return new;
end
$$;


--
-- Name: ops_tickets_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_tickets_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  cfg ops_ticket_pipeline;
begin
  if tg_op = 'INSERT' then
    insert into ops_ticket_events(ticket_id, actor_email, actor_role, event_type, to_value)
      values (new.id, new.opened_by_email, 'client_user', 'created', new.status);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    cfg := ops_pipeline_get();

    if new.status is distinct from old.status then
      insert into ops_ticket_events(ticket_id, event_type, from_value, to_value)
        values (new.id, 'status_changed', old.status, new.status);

      if cfg is not null and new.status = cfg.done_stage_key then
        insert into ops_ticket_events(ticket_id, event_type, to_value)
          values (new.id, 'done_marked', new.assigned_to_email);
      elsif cfg is not null and new.status = cfg.done_confirmed_stage_key then
        insert into ops_ticket_events(ticket_id, event_type)
          values (new.id, 'done_confirmed');
      end if;
    end if;

    if new.priority is distinct from old.priority then
      insert into ops_ticket_events(ticket_id, event_type, from_value, to_value)
        values (new.id, 'priority_changed', old.priority, new.priority);
    end if;

    if new.assigned_to_email is distinct from old.assigned_to_email then
      if new.assigned_to_email is null then
        insert into ops_ticket_events(ticket_id, event_type, from_value)
          values (new.id, 'unassigned', old.assigned_to_email);
      else
        insert into ops_ticket_events(ticket_id, event_type, from_value, to_value)
          values (new.id, 'assigned', old.assigned_to_email, new.assigned_to_email);
      end if;
    end if;

    if new.sla_breached_at is distinct from old.sla_breached_at and new.sla_breached_at is not null then
      insert into ops_ticket_events(ticket_id, event_type, to_value)
        values (new.id, 'sla_breached', new.priority);
    end if;
  end if;

  return new;
end
$$;


--
-- Name: ops_tickets_compute_sla(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_tickets_compute_sla() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  hours int;
begin
  if tg_op = 'INSERT' then
    hours := ops_pipeline_sla_hours(new.priority);
    new.sla_due_at := new.created_at + (hours || ' hours')::interval;
  elsif tg_op = 'UPDATE' and new.priority is distinct from old.priority then
    hours := ops_pipeline_sla_hours(new.priority);
    new.sla_due_at := now() + (hours || ' hours')::interval;
  end if;
  return new;
end
$$;


--
-- Name: ops_tickets_done_system_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_tickets_done_system_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  cfg ops_ticket_pipeline;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    cfg := ops_pipeline_get();
    if cfg is not null and new.status = cfg.done_stage_key then
      insert into ops_ticket_messages(ticket_id, author_email, author_role, body)
        values (new.id, 'system@blackwolf', 'system', cfg.done_prompt_message);
    end if;
  end if;
  return new;
end
$$;


--
-- Name: ops_tickets_status_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_tickets_status_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  cfg ops_ticket_pipeline;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    cfg := ops_pipeline_get();
    if cfg is not null then
      if new.status = cfg.done_stage_key and new.done_marked_at is null then
        new.done_marked_at := now();
      end if;
      if new.status = cfg.done_confirmed_stage_key and new.done_confirmed_at is null then
        new.done_confirmed_at := now();
      end if;
      if new.status = cfg.closed_stage_key and new.closed_at is null then
        new.closed_at := now();
      end if;
    end if;
  end if;
  return new;
end
$$;


--
-- Name: ops_tickets_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_tickets_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_updated_at_whatsapp_api_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_whatsapp_api_accounts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: support_messages_touch_ticket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_messages_touch_ticket() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update support_tickets
    set last_message_at = new.created_at,
        updated_at      = now()
  where id = new.ticket_id;
  return new;
end
$$;


--
-- Name: support_tickets_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_tickets_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end
$$;


--
-- Name: sync_task_status_from_stage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_task_status_from_stage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  stage_key TEXT;
  stage_terminal BOOLEAN;
BEGIN
  IF NEW.stage_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    SELECT key, is_terminal INTO stage_key, stage_terminal
    FROM task_stages WHERE id = NEW.stage_id;
    IF stage_key IS NOT NULL THEN
      NEW.status := stage_key;
      NEW.completed := COALESCE(stage_terminal, false);
      IF stage_terminal AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
      ELSIF NOT stage_terminal THEN
        NEW.completed_at := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: tenant_invitations_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_invitations_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end
$$;


--
-- Name: update_agent_learnings_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_learnings_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_recall_calls_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_recall_calls_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: agent_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_email text,
    title text DEFAULT 'Nueva conversación'::text NOT NULL,
    context text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    contact_id uuid
);


--
-- Name: agent_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    client_slug text,
    contact_id uuid,
    agent_name text NOT NULL,
    action_type text NOT NULL,
    input jsonb,
    output jsonb,
    context jsonb,
    reasoning text,
    model text,
    tokens_in integer DEFAULT 0,
    tokens_out integer DEFAULT 0,
    cost_usd numeric(10,6) DEFAULT 0,
    duration_ms integer,
    session_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    decision_id uuid,
    verdict text NOT NULL,
    source text DEFAULT 'human'::text NOT NULL,
    notes text,
    user_email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_learnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_learnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    agent_name text NOT NULL,
    pattern_type text NOT NULL,
    pattern text NOT NULL,
    rationale text,
    confidence numeric(3,2) DEFAULT 0.50,
    source_decision_ids uuid[] DEFAULT '{}'::uuid[],
    status text DEFAULT 'pending'::text NOT NULL,
    times_applied integer DEFAULT 0,
    last_applied_at timestamp with time zone,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_by text,
    rejected_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    client_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    agent_type text DEFAULT 'prospector'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    results_summary jsonb DEFAULT '{}'::jsonb,
    logs text DEFAULT '[]'::text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_runs_agent_type_check CHECK ((agent_type = ANY (ARRAY['prospector'::text, 'personalizer'::text, 'enricher'::text]))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: apex_admin_api_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apex_admin_api_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    api_key_hash text,
    ip inet,
    user_agent text,
    request_body jsonb,
    response_status integer,
    duration_ms integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apex_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apex_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    business_email text NOT NULL,
    phone text NOT NULL,
    job_title text NOT NULL,
    company text NOT NULL,
    country text NOT NULL,
    project text,
    source text DEFAULT 'apex-landing'::text NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    referrer text,
    user_agent text,
    status text DEFAULT 'new'::text NOT NULL,
    notes text,
    contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apex_newsletter_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apex_newsletter_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    excerpt text,
    body_md text NOT NULL,
    hero_url text,
    hero_svg_seed text,
    category text DEFAULT 'Field Notes'::text,
    read_minutes integer DEFAULT 5,
    author_name text DEFAULT 'BlackWolf Team'::text,
    author_role text,
    language text DEFAULT 'en'::text,
    tags text[] DEFAULT ARRAY[]::text[],
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT apex_newsletter_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: apex_newsletter_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apex_newsletter_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    subscriber_count integer NOT NULL,
    resend_batch_id text,
    triggered_by text,
    meta jsonb DEFAULT '{}'::jsonb,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apex_newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apex_newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    status text DEFAULT 'pending'::text NOT NULL,
    language text DEFAULT 'en'::text,
    confirm_token text,
    unsubscribe_token text NOT NULL,
    source text,
    utm jsonb DEFAULT '{}'::jsonb,
    subscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    CONSTRAINT apex_newsletter_subscribers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'unsubscribed'::text, 'bounced'::text, 'complained'::text])))
);


--
-- Name: apex_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apex_state (
    client_id uuid NOT NULL,
    namespace text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE apex_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.apex_state IS 'apex-operations shell: per-tenant JSONB store for admin-surface state (fulfillment / tools / marketing / finance-config). One row per (client_id, namespace). See src/pages/apex-operations/lib/apexState.js.';


--
-- Name: asesoriasuiza_establecimiento_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asesoriasuiza_establecimiento_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner text NOT NULL,
    nombre text NOT NULL,
    email text NOT NULL,
    telefono text,
    empresa text,
    ciudad_suiza text,
    fecha_inicio date,
    estado_trabajo text,
    anmeldung_url text,
    contact_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asesoriasuiza_establecimiento_submissions_owner_check CHECK ((owner = ANY (ARRAY['portillo'::text, 'lukas'::text])))
);


--
-- Name: asesoriasuiza_job_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asesoriasuiza_job_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner text NOT NULL,
    titulo text NOT NULL,
    empresa text NOT NULL,
    ciudad text,
    descripcion text,
    requisitos text,
    salario text,
    gmail_contacto text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asesoriasuiza_job_offers_owner_check CHECK ((owner = ANY (ARRAY['portillo'::text, 'lukas'::text])))
);


--
-- Name: asesoriasuiza_webinar_call_intake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asesoriasuiza_webinar_call_intake (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner text NOT NULL,
    nombre text NOT NULL,
    telefono text NOT NULL,
    email text,
    ubicacion text NOT NULL,
    motivo text,
    intentos_previos text,
    incorporacion text,
    responsabilidades text,
    intencion text,
    inversion text,
    contact_id uuid,
    signup_id uuid,
    booking_status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asesoriasuiza_webinar_call_intake_owner_check CHECK ((owner = ANY (ARRAY['portillo'::text, 'lukas'::text]))),
    CONSTRAINT asesoriasuiza_webinar_call_intake_ubicacion_check CHECK ((ubicacion = ANY (ARRAY['spain'::text, 'switzerland'::text])))
);


--
-- Name: asesoriasuiza_webinar_signups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asesoriasuiza_webinar_signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner text NOT NULL,
    nombre text NOT NULL,
    email text NOT NULL,
    telefono text,
    ubicacion text,
    source text,
    attended boolean DEFAULT false,
    contact_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asesoriasuiza_webinar_signups_owner_check CHECK ((owner = ANY (ARRAY['portillo'::text, 'lukas'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    actor_id uuid,
    actor_email text,
    actor_type text DEFAULT 'user'::text,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    status_code integer,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_actor_type_check CHECK ((actor_type = ANY (ARRAY['user'::text, 'superadmin'::text, 'system'::text, 'webhook'::text, 'agent'::text])))
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Trazabilidad de acciones: who/what/when/where. Escribir desde api/_lib/auth.js writeAudit()';


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    member_id uuid,
    superadmin_id uuid,
    client_id uuid NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT auth_sessions_check CHECK (((member_id IS NOT NULL) OR (superadmin_id IS NOT NULL)))
);


--
-- Name: TABLE auth_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auth_sessions IS 'Per-member auth sessions. Token random server-side (no JWT). Revoked al logout o expiry. Cliente envía Authorization: Bearer <token> en cada request.';


--
-- Name: booking_hosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_hosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text,
    description text DEFAULT ''::text,
    email text DEFAULT ''::text,
    duration_minutes integer DEFAULT 30 NOT NULL,
    google_account_index integer DEFAULT 1,
    host_type text DEFAULT 'individual'::text,
    team_members jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    operator_id uuid,
    target_pipeline_slug text,
    target_stage_key text,
    fixed_meet_url text,
    event_description text,
    booking_window_days integer DEFAULT 14 NOT NULL,
    intake_form_slug text,
    weekly_availability jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT booking_hosts_host_type_check CHECK ((host_type = ANY (ARRAY['individual'::text, 'team'::text, 'round_robin'::text])))
);


--
-- Name: COLUMN booking_hosts.target_pipeline_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_hosts.target_pipeline_slug IS 'Pipeline destino al confirmar reserva con este host. Se busca por crm_pipelines.name (case-insensitive). Si NULL, fallback hardcoded por cliente.';


--
-- Name: COLUMN booking_hosts.target_stage_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_hosts.target_stage_key IS 'Stage key dentro del pipeline destino. Si NULL, fallback hardcoded ("llamada_agendada" / "agendado" según cliente).';


--
-- Name: COLUMN booking_hosts.fixed_meet_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_hosts.fixed_meet_url IS 'Si está seteado, todas las reuniones con este host usarán este enlace de Meet fijo. NULL = generar Meet por reserva.';


--
-- Name: booking_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    channel text NOT NULL,
    offset_minutes integer NOT NULL,
    fire_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    recipient text,
    payload jsonb DEFAULT '{}'::jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_reminders_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text]))),
    CONSTRAINT booking_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: booking_routing_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_routing_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    fallback_host_slug text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    use_llm_scoring boolean DEFAULT false NOT NULL,
    llm_scoring_prompt text,
    score_keys jsonb DEFAULT '[]'::jsonb NOT NULL,
    header_html text,
    default_pipeline_slug text,
    default_stage_key text
);


--
-- Name: booking_routing_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_routing_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routing_form_id uuid,
    client_id uuid,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    assigned_host_slug text,
    matched_rule_index integer,
    booking_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    action_taken text,
    pipeline_slug text,
    stage_key text,
    crm_contact_id uuid
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    host text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 30 NOT NULL,
    guest_name text NOT NULL,
    guest_email text NOT NULL,
    guest_company text DEFAULT ''::text,
    guest_phone text DEFAULT ''::text,
    reason text DEFAULT ''::text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    meeting_url text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    utm_source text DEFAULT ''::text,
    utm_campaign text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    calendly_event_uri text,
    calendly_invitee_uri text,
    crm_contact_id uuid,
    CONSTRAINT bookings_host_check CHECK ((host = ANY (ARRAY['alex'::text, 'alejandro'::text, 'team'::text]))),
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text])))
);


--
-- Name: brain_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    contact_id uuid,
    decision_type text,
    agents_involved jsonb,
    reasoning text,
    actions_taken jsonb,
    confidence numeric,
    kind text,
    subject text,
    context jsonb,
    source text,
    source_ref text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bulk_send_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_send_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    created_by uuid,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    account_index integer DEFAULT 1 NOT NULL,
    message text NOT NULL,
    as_audio boolean DEFAULT false NOT NULL,
    voice_id text,
    total integer DEFAULT 0 NOT NULL,
    sent integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    segment jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT bulk_send_jobs_channel_check CHECK ((channel = 'whatsapp'::text)),
    CONSTRAINT bulk_send_jobs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'paused'::text, 'aborted'::text, 'completed'::text])))
);


--
-- Name: bulk_send_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_send_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    contact_id uuid,
    phone text NOT NULL,
    name text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bulk_send_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: bw_client_deliverables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bw_client_deliverables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    type text DEFAULT 'link'::text NOT NULL,
    title text NOT NULL,
    url text DEFAULT ''::text,
    description text DEFAULT ''::text,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bw_client_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bw_client_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_client_id uuid NOT NULL,
    status text DEFAULT 'onboarding'::text NOT NULL,
    closer text DEFAULT ''::text,
    product text DEFAULT ''::text,
    sale_date date,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: bw_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bw_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    folder text DEFAULT 'General'::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    contract_html text DEFAULT ''::text,
    template_html text DEFAULT ''::text,
    client_data jsonb DEFAULT '{}'::jsonb,
    sent_to_email text DEFAULT ''::text,
    sent_at timestamp with time zone,
    signed_at timestamp with time zone,
    file_url text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bw_onboarding_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bw_onboarding_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    "position" integer DEFAULT 0,
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bw_support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bw_support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    category text DEFAULT 'general'::text,
    created_by text DEFAULT ''::text,
    assigned_to text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bw_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bw_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender text NOT NULL,
    sender_type text DEFAULT 'team'::text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: calendly_auth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendly_auth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_type text DEFAULT 'Bearer'::text,
    expires_at timestamp with time zone NOT NULL,
    calendly_user_uri text,
    calendly_org_uri text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ceo_daily_digests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_daily_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    date date NOT NULL,
    summary text,
    key_metrics text,
    decisions_needed text,
    highlights text,
    alerts text,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.ceo_daily_digests FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_finance_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_finance_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    recurring boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ceo_finance_entries_category_check CHECK ((category = ANY (ARRAY['operativo'::text, 'equipo'::text, 'marketing'::text, 'herramientas'::text, 'otro'::text, 'legal'::text, 'tax'::text])))
);

ALTER TABLE ONLY public.ceo_finance_entries FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    source text DEFAULT 'manual'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    meeting_id uuid,
    project_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ceo_ideas_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT ceo_ideas_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'meeting'::text, 'ai_suggestion'::text]))),
    CONSTRAINT ceo_ideas_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'approved'::text, 'discarded'::text])))
);

ALTER TABLE ONLY public.ceo_ideas FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    service text NOT NULL,
    api_key text,
    config jsonb DEFAULT '{}'::jsonb,
    enabled boolean DEFAULT false,
    last_sync timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ceo_integrations_service_check CHECK ((service = ANY (ARRAY['fireflies'::text, 'google_calendar'::text, 'google_drive'::text, 'meta_ads'::text])))
);

ALTER TABLE ONLY public.ceo_integrations FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    duration_minutes integer,
    participants text,
    summary text,
    action_items text,
    key_topics text,
    sentiment text,
    transcript_url text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ceo_meetings_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text, 'mixed'::text]))),
    CONSTRAINT ceo_meetings_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'fireflies'::text, 'google_calendar'::text]))),
    CONSTRAINT ceo_meetings_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.ceo_meetings FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    owner text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'idea'::text NOT NULL,
    start_date date,
    end_date date,
    progress integer DEFAULT 0,
    tags text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ceo_projects_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT ceo_projects_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT ceo_projects_status_check CHECK ((status = ANY (ARRAY['idea'::text, 'planned'::text, 'in_progress'::text, 'paused'::text, 'completed'::text])))
);

ALTER TABLE ONLY public.ceo_projects FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_team_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_team_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    member_id uuid NOT NULL,
    note text,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.ceo_team_notes FORCE ROW LEVEL SECURITY;


--
-- Name: ceo_weekly_digests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceo_weekly_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    week_start date NOT NULL,
    week_end date NOT NULL,
    numbers_summary text,
    executive_summary text,
    decisions_taken text,
    next_steps text,
    alerts text,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.ceo_weekly_digests FORCE ROW LEVEL SECURITY;


--
-- Name: chat_broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    channel text DEFAULT 'instagram'::text,
    message_content text DEFAULT ''::text,
    message_type text DEFAULT 'text'::text,
    media_url text DEFAULT ''::text,
    target_tags jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    total_sent integer DEFAULT 0,
    total_delivered integer DEFAULT 0,
    total_read integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    platform_id text DEFAULT ''::text,
    platform text DEFAULT 'instagram'::text,
    name text DEFAULT ''::text,
    username text DEFAULT ''::text,
    email text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    avatar_url text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    custom_data jsonb DEFAULT '{}'::jsonb,
    last_interaction timestamp with time zone DEFAULT now(),
    subscribed boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    contact_id uuid,
    flow_id uuid,
    channel text DEFAULT 'instagram'::text,
    status text DEFAULT 'active'::text,
    assigned_to text DEFAULT ''::text,
    last_message text DEFAULT ''::text,
    last_message_at timestamp with time zone DEFAULT now(),
    unread_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    trigger_type text DEFAULT 'keyword'::text,
    trigger_value text DEFAULT ''::text,
    channel text DEFAULT 'instagram'::text,
    active boolean DEFAULT true,
    nodes jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    conversation_id uuid,
    sender_type text DEFAULT 'contact'::text,
    content text DEFAULT ''::text,
    message_type text DEFAULT 'text'::text,
    media_url text DEFAULT ''::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chatbot_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text DEFAULT 'Mi Chatbot'::text NOT NULL,
    system_prompt text DEFAULT ''::text,
    instructions text DEFAULT ''::text,
    knowledge_base jsonb DEFAULT '[]'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    active boolean DEFAULT true,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: chatbot_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chatbot_id uuid NOT NULL,
    client_id uuid NOT NULL,
    type text NOT NULL,
    title text DEFAULT ''::text,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chatbot_knowledge_type_check CHECK ((type = ANY (ARRAY['faq'::text, 'document'::text, 'conversation_learned'::text, 'note'::text])))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    logo_url text DEFAULT ''::text,
    primary_color text DEFAULT '#FF6B00'::text,
    secondary_color text DEFAULT '#FFB800'::text,
    bg_color text DEFAULT '#0A0A0A'::text,
    bg_card_color text DEFAULT '#111111'::text,
    bg_sidebar_color text DEFAULT '#0D0D0D'::text,
    border_color text DEFAULT '#1F1F1F'::text,
    text_color text DEFAULT '#FFFFFF'::text,
    text_secondary_color text DEFAULT '#A0A0A0'::text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    is_demo boolean DEFAULT false NOT NULL,
    demo_started_at timestamp with time zone,
    demo_expires_at timestamp with time zone,
    onboarded_at timestamp with time zone,
    onboarding_answers jsonb DEFAULT '{}'::jsonb,
    source_utm jsonb DEFAULT '{}'::jsonb,
    lead_phone text,
    multi_account_integrations boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    client_type text DEFAULT 'growth'::text,
    enabled_features jsonb,
    parent_slug text
);


--
-- Name: COLUMN clients.config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.config IS 'Config self-service del cliente: language, features, branding, github, integrations, labels. fba-academy NO usa esta columna (queda NULL/{}).';


--
-- Name: COLUMN clients.client_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.client_type IS 'growth | manufactura | consultoria | admin | demo';


--
-- Name: client_config_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.client_config_summary AS
 SELECT id,
    slug,
    name,
    active,
    client_type,
    (config ->> 'language'::text) AS language,
    (config -> 'features'::text) AS features,
    (config -> 'branding'::text) AS branding,
    (config -> 'github'::text) AS github,
    (config -> 'integrations'::text) AS integrations,
    ((config ->> 'locked'::text))::boolean AS locked,
    created_at
   FROM public.clients
  WHERE (slug <> 'fba-academy'::text);


--
-- Name: VIEW client_config_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.client_config_summary IS 'Vista agregada del config por cliente para panel admin. Excluye fba-academy.';


--
-- Name: client_operators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_operators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    slug character varying(64) NOT NULL,
    display_name character varying(120) NOT NULL,
    email character varying(160),
    avatar_url text,
    short_bio text,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    CONSTRAINT client_operators_status_chk CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying])::text[])))
);


--
-- Name: close_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.close_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    sync_type text NOT NULL,
    direction text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    leads_created integer DEFAULT 0,
    leads_updated integer DEFAULT 0,
    leads_failed integer DEFAULT 0,
    error_details jsonb,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT close_sync_log_direction_check CHECK ((direction = ANY (ARRAY['close_to_dashboard'::text, 'dashboard_to_close'::text]))),
    CONSTRAINT close_sync_log_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT close_sync_log_sync_type_check CHECK ((sync_type = ANY (ARRAY['full'::text, 'incremental'::text, 'webhook'::text, 'push'::text])))
);


--
-- Name: commission_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    member_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    role text NOT NULL,
    cash_base numeric DEFAULT 0 NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    commission_amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    role text NOT NULL,
    threshold numeric DEFAULT 0 NOT NULL,
    rate_at_or_above numeric NOT NULL,
    rate_below numeric NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comunidad_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comunidad_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(50) DEFAULT 'general'::character varying,
    description text,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comunidad_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comunidad_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    client_id uuid NOT NULL,
    author_name character varying(100) NOT NULL,
    content text NOT NULL,
    is_announcement boolean DEFAULT false,
    pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: console_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.console_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    scopes jsonb DEFAULT '["read"]'::jsonb,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    active boolean DEFAULT true,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: copies_guiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copies_guiones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    category text,
    name text,
    content text,
    status text,
    guion_type text,
    format text,
    comunidad_asset_id uuid,
    sent_count integer,
    last_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    type text DEFAULT 'note'::text NOT NULL,
    custom_type text DEFAULT ''::text,
    title text DEFAULT ''::text,
    description text DEFAULT ''::text,
    outcome text DEFAULT ''::text,
    duration_minutes integer DEFAULT 0,
    performed_by text DEFAULT ''::text,
    performed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    file_url text DEFAULT ''::text,
    scheduled_at timestamp with time zone,
    CONSTRAINT crm_activities_type_check CHECK ((type = ANY (ARRAY['note'::text, 'call'::text, 'email'::text, 'meeting'::text, 'task'::text, 'whatsapp'::text, 'custom'::text])))
);

ALTER TABLE ONLY public.crm_activities FORCE ROW LEVEL SECURITY;


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    company text DEFAULT ''::text,
    "position" text DEFAULT ''::text,
    instagram text DEFAULT ''::text,
    country text DEFAULT ''::text,
    source text DEFAULT ''::text,
    status text DEFAULT 'lead'::text NOT NULL,
    assigned_to text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    notes text DEFAULT ''::text,
    deal_value numeric DEFAULT 0,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    close_lead_id text,
    close_contact_id text,
    close_opportunity_id text,
    address text DEFAULT ''::text,
    whatsapp text DEFAULT ''::text,
    zoom_link text DEFAULT ''::text,
    website text DEFAULT ''::text,
    linkedin text DEFAULT ''::text,
    pipeline_id uuid,
    assigned_closer text,
    assigned_setter text,
    assigned_cold_caller text,
    producto_interes text,
    capital_disponible text,
    situacion_actual text,
    exp_amazon text,
    decisor_confirmado text,
    fecha_llamada date,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    triager text,
    gestor_asignado text,
    product text,
    payment_type text,
    payment_method text,
    stage_key text
);

ALTER TABLE ONLY public.crm_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: crm_custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    field_key text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb,
    required boolean DEFAULT false,
    "position" integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_custom_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'select'::text, 'multiselect'::text, 'checkbox'::text, 'url'::text, 'email'::text, 'phone'::text, 'currency'::text, 'textarea'::text])))
);


--
-- Name: crm_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size integer DEFAULT 0,
    file_type text DEFAULT ''::text,
    uploaded_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    contact_id uuid,
    channel text,
    direction text,
    sender_name text,
    content text,
    subject text,
    media_url text,
    metadata jsonb,
    status text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text DEFAULT 'Default Pipeline'::text NOT NULL,
    stages jsonb DEFAULT '[{"key": "lead", "color": "#6366F1", "label": "Lead"}, {"key": "contacted", "color": "#F59E0B", "label": "Contactado"}, {"key": "qualified", "color": "#3B82F6", "label": "Cualificado"}, {"key": "proposal", "color": "#8B5CF6", "label": "Propuesta"}, {"key": "negotiation", "color": "#EC4899", "label": "Negociación"}, {"key": "won", "color": "#10B981", "label": "Ganado"}, {"key": "lost", "color": "#EF4444", "label": "Perdido"}]'::jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    owner_scope character varying(32),
    operator_id uuid,
    CONSTRAINT crm_pipelines_owner_scope_chk CHECK (((owner_scope IS NULL) OR ((owner_scope)::text = ANY ((ARRAY['portillo'::character varying, 'lukas'::character varying])::text[]))))
);

ALTER TABLE ONLY public.crm_pipelines FORCE ROW LEVEL SECURITY;


--
-- Name: crm_sequence_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sequence_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    sequence_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    current_step integer DEFAULT 0,
    status text DEFAULT 'active'::text,
    next_action_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT crm_sequence_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'exited'::text])))
);


--
-- Name: crm_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    pipeline_id uuid,
    stage_key text NOT NULL,
    name text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_smart_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_smart_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    columns jsonb DEFAULT '[]'::jsonb,
    sort_by text DEFAULT 'created_at'::text,
    sort_dir text DEFAULT 'desc'::text,
    color text DEFAULT '#6366F1'::text,
    icon text DEFAULT ''::text,
    "position" integer DEFAULT 0,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    pipeline_id uuid
);


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    contact_id uuid,
    title text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text,
    due_date timestamp with time zone,
    assigned_to text DEFAULT ''::text,
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    priority text DEFAULT 'medium'::text,
    created_at timestamp with time zone DEFAULT now(),
    sprint_id uuid,
    pipeline_id uuid,
    stage_id uuid,
    category text DEFAULT 'general'::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    estimated_hours numeric,
    actual_hours numeric,
    roadmap_id uuid,
    CONSTRAINT crm_tasks_category_check CHECK ((category = ANY (ARRAY['project'::text, 'support'::text, 'ai'::text, 'general'::text]))),
    CONSTRAINT crm_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT crm_tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'review'::text, 'done'::text])))
);


--
-- Name: crm_tasks_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_id uuid,
    client_id uuid NOT NULL,
    contact_id uuid,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    assigned_to text,
    completed boolean DEFAULT true NOT NULL,
    completed_at timestamp with time zone,
    priority text,
    category text,
    status text,
    estimated_hours numeric,
    actual_hours numeric,
    notes text,
    video_url text,
    roadmap_id uuid,
    pipeline_id uuid,
    stage_id uuid,
    sprint_id uuid,
    sprint_name text,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    archive_week date NOT NULL,
    archived_by text DEFAULT 'cron'::text NOT NULL
);


--
-- Name: demo_signup_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_signup_attempts (
    id bigint NOT NULL,
    ip text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: demo_signup_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.demo_signup_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demo_signup_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.demo_signup_attempts_id_seq OWNED BY public.demo_signup_attempts.id;


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text,
    from_name text DEFAULT ''::text,
    from_email text DEFAULT ''::text,
    reply_to text DEFAULT ''::text,
    list_id uuid,
    template_id uuid,
    html_content text DEFAULT ''::text,
    status text DEFAULT 'draft'::text,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    total_sent integer DEFAULT 0,
    total_opened integer DEFAULT 0,
    total_clicked integer DEFAULT 0,
    total_bounced integer DEFAULT 0,
    total_unsubscribed integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_index integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: email_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    provider text DEFAULT 'resend'::text,
    api_key text DEFAULT ''::text,
    from_name text DEFAULT ''::text,
    from_email text DEFAULT ''::text,
    reply_to text DEFAULT ''::text,
    domain text DEFAULT ''::text,
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_index integer DEFAULT 1 NOT NULL,
    account_label text DEFAULT ''::text NOT NULL
);


--
-- Name: email_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sequence_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequence_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    sequence_id uuid,
    contact_id uuid,
    current_step integer,
    status text,
    next_send_at timestamp with time zone,
    last_sent_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text,
    active boolean DEFAULT false,
    steps jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    list_id uuid,
    email text NOT NULL,
    name text DEFAULT ''::text,
    status text DEFAULT 'subscribed'::text,
    tags jsonb DEFAULT '[]'::jsonb,
    custom_data jsonb DEFAULT '{}'::jsonb,
    subscribed_at timestamp with time zone DEFAULT now(),
    unsubscribed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text,
    html_content text DEFAULT ''::text,
    json_content jsonb DEFAULT '{}'::jsonb,
    category text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_accounting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_accounting (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    date date,
    account_code text,
    description text,
    debit numeric,
    credit numeric,
    reference text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    slug text,
    logo_url text,
    currency text,
    active boolean DEFAULT false,
    cif text,
    email text,
    phone text,
    address text,
    city text,
    country text,
    website text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    type text,
    name text,
    cif text,
    email text,
    phone text,
    address text,
    city text,
    country text,
    payment_terms integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text,
    email text,
    phone text,
    "position" text,
    department text,
    hire_date date,
    salary numeric,
    contract_type text,
    active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    contact_id uuid,
    type text,
    number text,
    date date,
    due_date date,
    status text,
    subtotal numeric,
    tax_total numeric,
    total numeric,
    paid_amount numeric,
    notes text,
    lines jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_production_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_production_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    number text,
    name text,
    status text,
    params jsonb,
    bom jsonb,
    hardware jsonb,
    warnings jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text,
    sku text,
    type text,
    category text,
    description text,
    sale_price numeric,
    cost_price numeric,
    tax_rate numeric,
    unit text,
    stock_qty numeric,
    min_stock numeric,
    track_stock boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_stock_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_stock_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    product_id uuid,
    type text,
    quantity numeric,
    reference text,
    date date,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: erp_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erp_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text,
    email text,
    password text,
    role text,
    modules jsonb,
    active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id bigint NOT NULL,
    client_id uuid,
    user_id uuid,
    session_id text,
    event_name text NOT NULL,
    event_category text,
    properties jsonb DEFAULT '{}'::jsonb,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    referrer text,
    ip_address inet,
    user_agent text,
    country text,
    revenue_cents bigint,
    currency text DEFAULT 'EUR'::text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.events IS 'Eventos analíticos: signup, pageview, checkout, churn. Input para CAC/LTV/funnel';


--
-- Name: events_funnel_30d; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.events_funnel_30d AS
 SELECT client_id,
    event_name,
    (count(*))::integer AS total,
    (count(DISTINCT user_id))::integer AS unique_users,
    (count(DISTINCT session_id))::integer AS unique_sessions,
    (sum(COALESCE(revenue_cents, (0)::bigint)))::bigint AS revenue_cents
   FROM public.events
  WHERE (occurred_at >= (now() - '30 days'::interval))
  GROUP BY client_id, event_name;


--
-- Name: VIEW events_funnel_30d; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.events_funnel_30d IS 'Funnel agregado últimos 30 días. Consumible por dashboard analytics';


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: feedback_form_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_form_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    intro text NOT NULL,
    scale_questions jsonb NOT NULL,
    yesno_questions jsonb NOT NULL,
    text_question_label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fireflies_transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fireflies_transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    fireflies_id text NOT NULL,
    contact_id uuid,
    title text,
    date timestamp with time zone,
    duration real,
    organizer_email text,
    participants text[],
    summary_overview text,
    summary_action_items text,
    summary_keywords text[],
    summary_short text,
    transcript_url text,
    audio_url text,
    meeting_link text,
    sentences jsonb,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: formacion_cursos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formacion_cursos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    thumbnail_url text,
    category character varying(50) DEFAULT 'general'::character varying,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: formacion_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formacion_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    curso_id uuid NOT NULL,
    client_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    video_url text NOT NULL,
    embed_url text,
    "position" integer DEFAULT 0,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: info_producto_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.info_producto_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    info_producto_id uuid NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    url text,
    status text DEFAULT 'activo'::text,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT info_producto_assets_type_check CHECK ((type = ANY (ARRAY['web'::text, 'comunidad'::text, 'funnel'::text, 'otro'::text])))
);


--
-- Name: info_producto_process_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.info_producto_process_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    info_producto_id uuid NOT NULL,
    phase_key text NOT NULL,
    phase_label text,
    step_key text NOT NULL,
    step_label text NOT NULL,
    description text,
    order_index integer DEFAULT 0,
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    completed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: info_producto_process_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.info_producto_process_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text NOT NULL,
    description text,
    phases jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: info_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.info_productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'pre_lanzamiento'::text NOT NULL,
    current_phase text DEFAULT 'pre_lanzamiento'::text,
    template_id uuid,
    config jsonb DEFAULT '{}'::jsonb,
    launch_date date,
    owner_member_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: infoproducto_about; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_about (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    kind text NOT NULL,
    content text,
    media_url text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT infoproducto_about_kind_chk CHECK ((kind = ANY (ARRAY['heading'::text, 'text'::text, 'image'::text, 'video'::text, 'quote'::text, 'bullet'::text])))
);


--
-- Name: TABLE infoproducto_about; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.infoproducto_about IS 'Bloques editables que componen la página /mid/<slug>/about (estilo Skool). Pública: cualquiera puede leer sin login. Editable solo por admin del tenant.';


--
-- Name: infoproducto_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    category text,
    cover_url text,
    cta_label text,
    cta_url text,
    pinned boolean DEFAULT false NOT NULL,
    published boolean DEFAULT true NOT NULL,
    author_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infoproducto_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    primary_training_route_id uuid,
    hero_title text,
    hero_subtitle text,
    hero_cta_label text,
    hero_cta_url text,
    show_marketplace boolean DEFAULT false NOT NULL,
    show_groups boolean DEFAULT true NOT NULL,
    show_photos boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    host_name text,
    host_role text,
    host_avatar_url text,
    host_bio text,
    host_instagram text,
    host_youtube text,
    host_tiktok text,
    host_website text,
    cover_position integer DEFAULT 50 NOT NULL,
    about_page_title text,
    about_page_subtitle text,
    about_cta_title text,
    about_cta_subtitle text,
    about_cta_button text,
    CONSTRAINT infoproducto_config_cover_position_chk CHECK (((cover_position >= 0) AND (cover_position <= 100)))
);


--
-- Name: COLUMN infoproducto_config.host_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.infoproducto_config.host_name IS 'Nombre del presentador/host que aparece en la sidebar de /mid/<slug>/about.';


--
-- Name: COLUMN infoproducto_config.host_instagram; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.infoproducto_config.host_instagram IS 'Handle de Instagram sin @ (ej: hugodominguez) o URL completa. El frontend normaliza ambos formatos.';


--
-- Name: COLUMN infoproducto_config.cover_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.infoproducto_config.cover_position IS 'Posición vertical del crop del banner (0–100). 0=top visible, 50=center, 100=bottom. Editable desde MidHome → admin → "Recortar".';


--
-- Name: COLUMN infoproducto_config.about_page_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.infoproducto_config.about_page_title IS 'H1 de /mid/<slug>/about. NULL = "About" por defecto.';


--
-- Name: COLUMN infoproducto_config.about_cta_button; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.infoproducto_config.about_cta_button IS 'Label del botón del banner de registro al final de /about. NULL = "Crear cuenta gratis".';


--
-- Name: infoproducto_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infoproducto_group_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_group_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infoproducto_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    name text NOT NULL,
    description text,
    cover_url text,
    is_public boolean DEFAULT true NOT NULL,
    member_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infoproducto_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    user_id uuid,
    url text NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infoproducto_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    user_id uuid NOT NULL,
    tenant_slug text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infoproducto_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infoproducto_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text,
    avatar_url text,
    bio text,
    role text DEFAULT 'member'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    email_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    points integer DEFAULT 0 NOT NULL
);


--
-- Name: installment_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installment_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    installment_number integer NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    paid boolean DEFAULT false NOT NULL,
    paid_date timestamp with time zone,
    marked_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: installment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installment_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    sale_id uuid,
    client_name text NOT NULL,
    client_email text,
    client_phone text,
    product text,
    closer text,
    total_installments integer DEFAULT 1 NOT NULL,
    amount_per_installment numeric(10,2) DEFAULT 0 NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    start_date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_method text,
    CONSTRAINT installment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'defaulted'::text])))
);


--
-- Name: integration_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_services (
    key text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    icon text,
    color text,
    auth_type text NOT NULL,
    description text,
    fields jsonb,
    test_endpoint text,
    sort_order integer DEFAULT 100,
    active boolean DEFAULT true
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    subscription_id uuid,
    stripe_invoice_id text,
    stripe_charge_id text,
    stripe_payment_intent_id text,
    invoice_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    amount_total_cents bigint DEFAULT 0 NOT NULL,
    amount_paid_cents bigint DEFAULT 0,
    amount_refunded_cents bigint DEFAULT 0,
    tax_cents bigint DEFAULT 0,
    currency text DEFAULT 'EUR'::text,
    due_at timestamp with time zone,
    paid_at timestamp with time zone,
    pdf_url text,
    hosted_invoice_url text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    line_items jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'uncollectible'::text, 'void'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE invoices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoices IS 'Facturas emitidas. Sincronizar desde webhook Stripe invoice.*';


--
-- Name: legal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    description text DEFAULT ''::text,
    file_url text,
    file_path text,
    file_name text,
    file_size bigint,
    file_type text,
    related_party text DEFAULT ''::text,
    issue_date date,
    expiry_date date,
    amount numeric,
    currency text DEFAULT 'EUR'::text,
    uploaded_by text,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT legal_documents_category_check CHECK ((category = ANY (ARRAY['contract'::text, 'invoice'::text, 'nda'::text, 'proposal'::text, 'tax'::text, 'other'::text])))
);


--
-- Name: linkedin_daily_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_daily_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    date date NOT NULL,
    requests_sent integer DEFAULT 0 NOT NULL,
    accepted integer DEFAULT 0 NOT NULL,
    profile_views integer DEFAULT 0 NOT NULL,
    followers_total integer,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: linkedin_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    date date NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    url text DEFAULT ''::text,
    post_type text DEFAULT 'text'::text NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    comments integer DEFAULT 0 NOT NULL,
    reposts integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT linkedin_posts_post_type_check CHECK ((post_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'article'::text, 'poll'::text, 'carousel'::text, 'document'::text])))
);


--
-- Name: logistics_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    order_number text,
    status text DEFAULT 'pending_quote'::text,
    product_description text,
    product_category text,
    carton_count integer,
    weight_kg numeric(10,2),
    dimensions_l numeric(10,2),
    dimensions_w numeric(10,2),
    dimensions_h numeric(10,2),
    volumetric_weight numeric(10,2),
    billable_weight numeric(10,2),
    origin_country text DEFAULT 'China'::text,
    origin_city text,
    destination_country text,
    destination_city text,
    shipping_method text,
    incoterm text DEFAULT 'DDP'::text,
    needs_customs boolean DEFAULT true,
    needs_insurance boolean DEFAULT false,
    is_dangerous boolean DEFAULT false,
    estimated_price_min numeric(10,2),
    estimated_price_max numeric(10,2),
    final_price numeric(10,2),
    currency text DEFAULT 'EUR'::text,
    logistics_share numeric(10,2),
    emi_share numeric(10,2),
    tracking_number text,
    estimated_delivery date,
    actual_delivery date,
    customer_name text,
    customer_email text,
    customer_phone text,
    customer_company text,
    assigned_agent text,
    notes text,
    source text DEFAULT 'manual'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT logistics_orders_shipping_method_check CHECK ((shipping_method = ANY (ARRAY['express'::text, 'air'::text, 'sea'::text, 'train'::text]))),
    CONSTRAINT logistics_orders_status_check CHECK ((status = ANY (ARRAY['pending_quote'::text, 'quoted'::text, 'confirmed'::text, 'paid'::text, 'in_warehouse'::text, 'in_transit'::text, 'customs'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: logistics_pricing_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_pricing_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    order_id uuid,
    product_category text,
    shipping_method text,
    origin_country text,
    destination_country text,
    billable_weight numeric(10,2),
    carton_count integer,
    needs_customs boolean,
    is_dangerous boolean,
    estimated_price_min numeric(10,2),
    estimated_price_max numeric(10,2),
    final_price numeric(10,2),
    rate_per_kg numeric(10,4),
    estimation_error_pct numeric(6,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: logistics_pricing_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_pricing_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipping_method text,
    destination_country text,
    product_category text,
    sample_count integer,
    avg_rate_per_kg numeric,
    p75_rate numeric,
    median_rate numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: logistics_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    product_type text,
    weight_kg numeric(10,2),
    dimensions_l numeric(10,2),
    dimensions_w numeric(10,2),
    dimensions_h numeric(10,2),
    volumetric_weight numeric(10,2),
    billable_weight numeric(10,2),
    origin text DEFAULT 'China'::text,
    destination text,
    shipping_method text,
    estimated_price_min numeric(10,2),
    estimated_price_max numeric(10,2),
    contact_name text,
    contact_email text,
    contact_phone text,
    converted boolean DEFAULT false,
    converted_order_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: manychat_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manychat_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    api_key text,
    page_id text,
    webhook_secret text,
    auto_sync_crm boolean DEFAULT false,
    sync_tags text,
    last_sync timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    setter_pipeline_id uuid,
    setter_default_stage_key text,
    account_index integer DEFAULT 1 NOT NULL,
    account_label character varying(64),
    owner_scope character varying(32),
    CONSTRAINT manychat_config_owner_scope_chk CHECK (((owner_scope IS NULL) OR ((owner_scope)::text = ANY ((ARRAY['portillo'::character varying, 'lukas'::character varying])::text[]))))
);


--
-- Name: marketplace_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    job_id uuid,
    applicant_name text,
    applicant_email text,
    applicant_user_id uuid,
    rep_message text,
    status text,
    interview_url text,
    hired_at timestamp with time zone,
    rejected_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketplace_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    title text,
    description text,
    role text,
    salary numeric,
    commission_percent numeric,
    avg_ticket numeric,
    estimated_monthly_earnings numeric,
    language text,
    crm text,
    modality text,
    market text,
    calendly_url text,
    google_form_url text,
    applicants_count integer,
    active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mid_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    name text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    locked boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE mid_channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_channels IS 'Canales tipo Discord del Infoproducto. Públicos: todos los miembros logueados del tenant ven todos los canales.';


--
-- Name: mid_communities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_communities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text,
    name text,
    description text,
    cover_url text,
    route_id uuid,
    "position" integer,
    active boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mid_community_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_community_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    community_id uuid NOT NULL,
    user_id uuid NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mid_community_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_community_members IS 'Grant directo de acceso a una comunidad sin necesidad de mid_route_subscriptions. Usado por admins para invitar a usuarios sueltos (alumnos antiguos, team, beta) que necesitan ver el chat sin inscribirse a una formación.';


--
-- Name: mid_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    title text NOT NULL,
    description text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone,
    zoom_url text,
    recording_url text,
    recording_lesson_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gated_route_id uuid
);


--
-- Name: TABLE mid_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_events IS 'Calendario de clases en directo del Infoproducto. recording_lesson_id se rellena cuando el admin empuja la grabación a Formación.';


--
-- Name: COLUMN mid_events.recording_lesson_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mid_events.recording_lesson_id IS 'FK a training_lessons creada automáticamente al empujar la grabación a un módulo de Formación. NULL si el evento no se ha grabado / no se ha empujado.';


--
-- Name: COLUMN mid_events.gated_route_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mid_events.gated_route_id IS 'Si NOT NULL, el evento solo es visible para users con subscription a esta training_route. NULL = abierto a todos los miembros del tenant. Admins siempre ven todo.';


--
-- Name: mid_gate_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_gate_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    source text NOT NULL,
    reference_id uuid,
    reference_label text,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    phone_country text,
    instagram text,
    notes text,
    user_id uuid,
    user_agent text,
    ip_addr text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mid_gate_submissions_source_check CHECK ((source = ANY (ARRAY['lesson_locked'::text, 'channel_locked'::text, 'bonus_form'::text])))
);


--
-- Name: mid_lesson_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_lesson_grants (
    user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    tenant_slug text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mid_lesson_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_lesson_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    watched_seconds integer
);


--
-- Name: TABLE mid_lesson_progress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_lesson_progress IS 'Progreso de lecciones por miembro del Infoproducto. Binario completed/no. +2 puntos al user al marcar.';


--
-- Name: mid_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    tenant_slug text NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mid_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_messages IS 'Mensajes de la comunidad. Soft delete via deleted_at (preserva historial). Mentions y attachments en JSONB para no normalizar prematuramente.';


--
-- Name: mid_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    user_id uuid NOT NULL,
    title text,
    body text NOT NULL,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    comments_count integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mid_posts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_posts IS 'Posts del feed de comunidad del Infoproducto. Creados por cualquier miembro logueado. Soft delete via deleted_at. +5 puntos al user al crear.';


--
-- Name: mid_route_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_route_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    user_id uuid NOT NULL,
    route_id uuid NOT NULL,
    subscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    full_access boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE mid_route_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_route_subscriptions IS 'Inscripciones de miembros a rutas/cursos. Permite filtrar "mis cursos" en /perfil y "Continuar curso" en /formacion.';


--
-- Name: mid_support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    tenant_slug text NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: mid_support_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mid_support_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_slug text NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    unread_for_admin integer DEFAULT 0 NOT NULL,
    unread_for_user integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mid_support_threads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mid_support_threads IS 'Conversación de soporte entre un miembro y el equipo (admins) del tenant. Uno por user. Aparece como widget bottom-left en /mid/<slug>/*.';


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    price_monthly_cents bigint,
    price_annual_cents bigint,
    currency text DEFAULT 'EUR'::text,
    stripe_product_id text,
    stripe_price_monthly_id text,
    stripe_price_annual_id text,
    features jsonb DEFAULT '[]'::jsonb,
    limits jsonb DEFAULT '{}'::jsonb,
    trial_days integer DEFAULT 14,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE subscription_plans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscription_plans IS 'Catálogo global de planes SaaS (Starter/Growth/Scale/Enterprise). Mapear a Stripe prices antes de activar checkout';


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    plan_id uuid,
    stripe_subscription_id text,
    stripe_customer_id text,
    status text DEFAULT 'trialing'::text NOT NULL,
    billing_interval text,
    mrr_cents bigint DEFAULT 0,
    arr_cents bigint DEFAULT 0,
    currency text DEFAULT 'EUR'::text,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at timestamp with time zone,
    canceled_at timestamp with time zone,
    ended_at timestamp with time zone,
    cancel_reason text,
    churned_at timestamp with time zone,
    upgrade_from_plan_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text, 'week'::text, 'quarter'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'unpaid'::text])))
);

ALTER TABLE ONLY public.subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscriptions IS 'Suscripción activa por cliente. Sincronizar desde webhook Stripe customer.subscription.*';


--
-- Name: mrr_by_client; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.mrr_by_client AS
 SELECT c.id AS client_id,
    c.slug,
    c.name,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.mrr_cents,
    s.current_period_end,
    s.trial_end,
    s.churned_at
   FROM ((public.clients c
     LEFT JOIN public.subscriptions s ON (((s.client_id = c.id) AND (s.status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text])))))
     LEFT JOIN public.subscription_plans p ON ((p.id = s.plan_id)));


--
-- Name: VIEW mrr_by_client; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.mrr_by_client IS 'MRR por cliente con suscripción activa. Consumible por CEO dashboard';


--
-- Name: n8n_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    webhook_url text DEFAULT ''::text,
    api_key text DEFAULT ''::text,
    enabled boolean DEFAULT false,
    last_sync timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.n8n_config FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    member_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    resource_type text,
    resource_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    sequence_id uuid,
    data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: onboarding_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    created_by_email text,
    notes text,
    expires_at timestamp with time zone,
    used_at timestamp with time zone,
    used_by_client_id uuid,
    used_by_email text,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE onboarding_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.onboarding_keys IS 'API keys de un solo uso para acceder a /onboarding. Generadas por admin BW desde /black-wolf/settings/nuevos-clientes. Consumidas al completar tenant-setup.';


--
-- Name: operations_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    category text DEFAULT 'Other'::text,
    description text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ops_ticket_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_ticket_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    actor_email text,
    actor_role text,
    event_type text NOT NULL,
    from_value text,
    to_value text,
    metadata_json jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ops_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_email text NOT NULL,
    author_role text NOT NULL,
    author_name text,
    body text NOT NULL,
    attachments_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    read_by_recipient boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ops_ticket_messages_author_role_check CHECK ((author_role = ANY (ARRAY['client_user'::text, 'blackwolf_staff'::text, 'system'::text])))
);


--
-- Name: ops_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    opened_by_email text NOT NULL,
    opened_by_user_id uuid,
    opened_by_name text,
    subject text NOT NULL,
    description text,
    type text DEFAULT 'operation'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'mid'::text NOT NULL,
    sla_due_at timestamp with time zone,
    sla_breached_at timestamp with time zone,
    assigned_to_email text,
    assigned_to_name text,
    done_marked_at timestamp with time zone,
    done_confirmed_at timestamp with time zone,
    closed_at timestamp with time zone,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ops_tickets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ops_tickets IS 'Sistema operativo de tickets cliente -> Black Wolf. Pipeline editable vía ops_ticket_pipeline.';


--
-- Name: ops_tickets_inbox; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ops_tickets_inbox AS
 SELECT t.id,
    t.client_id,
    c.slug AS client_slug,
    c.name AS client_name,
    t.subject,
    t.description,
    t.type,
    t.status,
    t.priority,
    t.opened_by_email,
    t.opened_by_name,
    t.assigned_to_email,
    t.assigned_to_name,
    t.sla_due_at,
    t.sla_breached_at,
    t.done_marked_at,
    t.done_confirmed_at,
    t.closed_at,
    t.last_message_at,
    t.created_at,
    t.updated_at,
        CASE
            WHEN (( SELECT cfg.stages
               FROM public.ops_ticket_pipeline cfg
              WHERE (cfg.workspace = 'global'::text)) IS NULL) THEN false
            WHEN (t.status = ANY (ARRAY[COALESCE(( SELECT cfg.done_stage_key
               FROM public.ops_ticket_pipeline cfg
              WHERE (cfg.workspace = 'global'::text)), 'done'::text), COALESCE(( SELECT cfg.done_confirmed_stage_key
               FROM public.ops_ticket_pipeline cfg
              WHERE (cfg.workspace = 'global'::text)), 'done_confirmed'::text), COALESCE(( SELECT cfg.closed_stage_key
               FROM public.ops_ticket_pipeline cfg
              WHERE (cfg.workspace = 'global'::text)), 'closed'::text), COALESCE(( SELECT cfg.cancelled_stage_key
               FROM public.ops_ticket_pipeline cfg
              WHERE (cfg.workspace = 'global'::text)), 'cancelled'::text)])) THEN false
            WHEN (t.sla_due_at IS NULL) THEN false
            WHEN (t.sla_due_at < now()) THEN true
            ELSE false
        END AS is_overdue,
        CASE
            WHEN (t.sla_due_at IS NULL) THEN NULL::bigint
            ELSE (EXTRACT(epoch FROM (t.sla_due_at - now())))::bigint
        END AS sla_seconds_remaining,
    (( SELECT count(*) AS count
           FROM public.ops_ticket_messages m
          WHERE ((m.ticket_id = t.id) AND (m.read_by_recipient = false) AND (m.author_role = 'client_user'::text))))::integer AS unread_for_staff,
    (( SELECT count(*) AS count
           FROM public.ops_ticket_messages m
          WHERE ((m.ticket_id = t.id) AND (m.read_by_recipient = false) AND (m.author_role = ANY (ARRAY['blackwolf_staff'::text, 'system'::text])))))::integer AS unread_for_client,
    (( SELECT count(*) AS count
           FROM public.ops_ticket_messages m
          WHERE (m.ticket_id = t.id)))::integer AS message_count
   FROM (public.ops_tickets t
     JOIN public.clients c ON ((c.id = t.client_id)));


--
-- Name: VIEW ops_tickets_inbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.ops_tickets_inbox IS 'Vista agregada de ops_tickets. is_overdue calculado on-the-fly excluyendo stages terminales según el pipeline configurado.';


--
-- Name: orbe_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orbe_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    member_key text DEFAULT 'anon'::text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orbe_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: payment_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    method text NOT NULL,
    fee_rate numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.payment_fees FORCE ROW LEVEL SECURITY;


--
-- Name: payment_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    stripe_payment_link_id text NOT NULL,
    stripe_url text NOT NULL,
    stripe_price_id text,
    product_name text NOT NULL,
    concept text DEFAULT ''::text,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    uses_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone
);


--
-- Name: portal_otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp with time zone,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    data jsonb
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    price numeric DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    stripe_price_id text,
    stripe_product_id text,
    currency text DEFAULT 'EUR'::text,
    billing_interval text,
    trial_days integer DEFAULT 0,
    tax_category text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT products_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['one_time'::text, 'month'::text, 'year'::text, 'week'::text, 'quarter'::text])))
);

ALTER TABLE ONLY public.products FORCE ROW LEVEL SECURITY;


--
-- Name: projections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    period text NOT NULL,
    period_type text DEFAULT 'monthly'::text NOT NULL,
    type text DEFAULT 'company'::text NOT NULL,
    member_id text,
    name text DEFAULT ''::text NOT NULL,
    cash_target numeric DEFAULT 0,
    revenue_target numeric DEFAULT 0,
    appointment_target integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT projections_period_type_check CHECK ((period_type = ANY (ARRAY['weekly'::text, 'monthly'::text]))),
    CONSTRAINT projections_type_check CHECK ((type = ANY (ARRAY['company'::text, 'closer'::text, 'setter'::text])))
);

ALTER TABLE ONLY public.projections FORCE ROW LEVEL SECURITY;


--
-- Name: recall_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    member_id uuid,
    bot_id text NOT NULL,
    meeting_url text NOT NULL,
    platform text,
    meeting_id text,
    calendar_event_id text,
    title text,
    closer_email text,
    classification jsonb,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    contact_id uuid,
    participants jsonb DEFAULT '[]'::jsonb,
    recording_url text,
    transcript jsonb DEFAULT '[]'::jsonb,
    summary text,
    feedback text,
    action_items jsonb DEFAULT '[]'::jsonb,
    keywords text[] DEFAULT '{}'::text[],
    raw_webhook_events jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    role text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    conversations_opened integer DEFAULT 0,
    follow_ups integer DEFAULT 0,
    offers_launched integer DEFAULT 0,
    appointments_booked integer DEFAULT 0,
    scheduled_calls integer DEFAULT 0,
    calls_made integer DEFAULT 0,
    deposits integer DEFAULT 0,
    closes integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    deals integer DEFAULT 0,
    pick_ups integer DEFAULT 0,
    offers integer DEFAULT 0,
    schedule_calls integer DEFAULT 0,
    CONSTRAINT reports_role_check CHECK ((role = ANY (ARRAY['setter'::text, 'closer'::text, 'cold_caller'::text])))
);

ALTER TABLE ONLY public.reports FORCE ROW LEVEL SECURITY;


--
-- Name: roadmap_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roadmap_objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    roadmap_id uuid NOT NULL,
    client_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text,
    kpi_label text DEFAULT ''::text,
    kpi_target numeric DEFAULT 0,
    kpi_current numeric DEFAULT 0,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: roadmaps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roadmaps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    month text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT roadmaps_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text])))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    client_name text DEFAULT ''::text,
    client_email text DEFAULT ''::text,
    client_phone text DEFAULT ''::text,
    instagram text DEFAULT ''::text,
    product text DEFAULT ''::text,
    producto_interes text DEFAULT ''::text,
    payment_type text DEFAULT 'Pago único'::text,
    installment_number text DEFAULT 'Pago único'::text,
    payment_method text DEFAULT 'Transferencia'::text,
    revenue numeric DEFAULT 0,
    cash_collected numeric DEFAULT 0,
    closer text DEFAULT ''::text,
    setter text DEFAULT ''::text,
    triager text DEFAULT ''::text,
    gestor_asignado text DEFAULT ''::text,
    utm_source text DEFAULT ''::text,
    utm_medium text DEFAULT ''::text,
    utm_campaign text DEFAULT ''::text,
    utm_content text DEFAULT ''::text,
    pais text DEFAULT ''::text,
    capital_disponible text DEFAULT ''::text,
    situacion_actual text DEFAULT ''::text,
    exp_amazon text DEFAULT ''::text,
    decisor_confirmado text DEFAULT ''::text,
    fecha_llamada text DEFAULT ''::text,
    status text DEFAULT 'Completada'::text,
    notes text DEFAULT ''::text,
    source text DEFAULT 'manual'::text,
    close_activity_id text,
    created_at timestamp with time zone DEFAULT now(),
    operator_id uuid,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    sale_type text DEFAULT 'venta'::text NOT NULL,
    CONSTRAINT sales_sale_type_check CHECK ((sale_type = ANY (ARRAY['venta'::text, 'reserva'::text, 'deposito'::text])))
);

ALTER TABLE ONLY public.sales FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN sales.sale_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.sale_type IS 'Tipo de operación: venta (cobro firme), reserva (compromiso sin cobro completo), deposito (señal/parcial). Reservas y depósitos NO cuentan como venta cerrada en métricas del dashboard.';


--
-- Name: sales_with_net_cash; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sales_with_net_cash AS
 SELECT s.id,
    s.client_id,
    s.date,
    s.client_name,
    s.client_email,
    s.client_phone,
    s.instagram,
    s.product,
    s.producto_interes,
    s.payment_type,
    s.installment_number,
    s.payment_method,
    s.revenue,
    s.cash_collected,
    s.closer,
    s.setter,
    s.triager,
    s.gestor_asignado,
    s.utm_source,
    s.utm_medium,
    s.utm_campaign,
    s.utm_content,
    s.pais,
    s.capital_disponible,
    s.situacion_actual,
    s.exp_amazon,
    s.decisor_confirmado,
    s.fecha_llamada,
    s.status,
    s.notes,
    s.source,
    s.close_activity_id,
    s.created_at,
    s.operator_id,
    s.attachments,
    s.sale_type,
    round((s.cash_collected * ((1)::numeric - COALESCE(pf.fee_rate, (0)::numeric))), 2) AS net_cash
   FROM (public.sales s
     LEFT JOIN public.payment_fees pf ON (((pf.method = s.payment_method) AND (pf.client_id = s.client_id))));


--
-- Name: scrap_agent_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrap_agent_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    contact_id uuid,
    template_id uuid,
    list_id uuid,
    stage text,
    enrich_started_at timestamp with time zone,
    enrich_completed_at timestamp with time zone,
    personalize_completed_at timestamp with time zone,
    enrich_data jsonb,
    email_subject text,
    email_html text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: signups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    name text,
    company text,
    phone text,
    plan_slug text,
    billing_interval text,
    source text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    referrer text,
    ip_address text,
    user_agent text,
    status text,
    stripe_customer_id text,
    stripe_checkout_session_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: signups_funnel_30d; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.signups_funnel_30d AS
 SELECT (date_trunc('day'::text, created_at))::date AS day,
    (count(*))::integer AS signups
   FROM public.signups
  WHERE (created_at > (now() - '30 days'::interval))
  GROUP BY ((date_trunc('day'::text, created_at))::date)
  ORDER BY ((date_trunc('day'::text, created_at))::date);


--
-- Name: store_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    client_id uuid NOT NULL,
    alert_type text NOT NULL,
    title text NOT NULL,
    message text,
    priority text DEFAULT 'medium'::text,
    resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by text,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    store_id uuid,
    email text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    phone text,
    instagram text,
    active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_daily_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_daily_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    tracking_date date NOT NULL,
    day_number integer,
    daily_sales numeric(10,2) DEFAULT 0,
    daily_units integer DEFAULT 0,
    ppc_spend numeric(10,2) DEFAULT 0,
    organic_position integer,
    sessions integer DEFAULT 0,
    conversion_rate numeric(5,2),
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    month date NOT NULL,
    monthly_revenue numeric(12,2) DEFAULT 0,
    monthly_units integer DEFAULT 0,
    monthly_ppc numeric(10,2) DEFAULT 0,
    profit_margin numeric(5,2),
    health_status text DEFAULT 'stable'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    step_number integer NOT NULL,
    title text NOT NULL,
    description text,
    step_type text DEFAULT 'video'::text NOT NULL,
    video_url text,
    action_url text,
    input_field text,
    input_value text,
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    requires_team_action boolean DEFAULT false,
    team_action_done boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    deliverables jsonb DEFAULT '[]'::jsonb
);


--
-- Name: store_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_name text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: store_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    client_id uuid NOT NULL,
    opened_by text DEFAULT 'client'::text NOT NULL,
    opened_by_name text,
    assigned_gestor_id uuid,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text,
    category text DEFAULT 'general'::text,
    scheduled_call_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    owner_name text NOT NULL,
    owner_email text,
    owner_phone text,
    owner_instagram text,
    brand_name text,
    amazon_marketplace text DEFAULT 'ES'::text,
    capital_disponible numeric(10,2),
    status text DEFAULT 'onboarding'::text NOT NULL,
    gestor_id uuid,
    gestor_name text,
    service_type text DEFAULT 'standard'::text,
    followup_days integer DEFAULT 30,
    start_date date,
    end_date date,
    current_step integer DEFAULT 1,
    total_steps integer DEFAULT 9,
    product_name text,
    product_asin text,
    agent_name text,
    upsell_offered boolean DEFAULT false,
    upsell_result text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    crm_contact_id uuid,
    store_client_id uuid,
    gestor_ids uuid[] DEFAULT '{}'::uuid[],
    gestor_names text[] DEFAULT '{}'::text[]
);


--
-- Name: superadmin_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superadmin_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    commission_rate numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.superadmin_commissions FORCE ROW LEVEL SECURITY;


--
-- Name: superadmins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superadmins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    email text NOT NULL,
    password text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_email text NOT NULL,
    author_role text NOT NULL,
    body text NOT NULL,
    attachments_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    read_by_recipient boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_author_role_check CHECK ((author_role = ANY (ARRAY['tenant_user'::text, 'blackwolf_staff'::text, 'system'::text])))
);


--
-- Name: TABLE support_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.support_messages IS 'Mensajes individuales dentro de un ticket de soporte. PROP-001.';


--
-- Name: COLUMN support_messages.author_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_messages.author_role IS 'tenant_user = usuario que abrió o participa desde el tenant. blackwolf_staff = equipo Black Wolf. system = mensaje automático (estado, asignación).';


--
-- Name: COLUMN support_messages.read_by_recipient; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_messages.read_by_recipient IS 'Si la última parte que tenía que leer este mensaje ya lo leyó. Útil para badges de no leídos.';


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    opened_by_email text NOT NULL,
    opened_by_user_id uuid,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assigned_to_email text,
    last_message_at timestamp with time zone,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'reopened'::text])))
);


--
-- Name: TABLE support_tickets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.support_tickets IS 'Tickets de soporte abiertos por usuarios de un tenant. PROP-001.';


--
-- Name: COLUMN support_tickets.client_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_tickets.client_id IS 'Tenant al que pertenece el ticket. Black Wolf ve todos.';


--
-- Name: COLUMN support_tickets.assigned_to_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_tickets.assigned_to_email IS 'Staff de Black Wolf asignado al ticket. NULL = sin asignar (en cola).';


--
-- Name: support_tickets_inbox; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.support_tickets_inbox AS
 SELECT t.id,
    t.client_id,
    c.slug AS client_slug,
    c.name AS client_name,
    t.subject,
    t.status,
    t.priority,
    t.opened_by_email,
    t.assigned_to_email,
    t.last_message_at,
    t.created_at,
    t.updated_at,
    (( SELECT count(*) AS count
           FROM public.support_messages m
          WHERE ((m.ticket_id = t.id) AND (m.read_by_recipient = false) AND (m.author_role = 'tenant_user'::text))))::integer AS unread_for_staff,
    (( SELECT count(*) AS count
           FROM public.support_messages m
          WHERE (m.ticket_id = t.id)))::integer AS message_count
   FROM (public.support_tickets t
     JOIN public.clients c ON ((c.id = t.client_id)));


--
-- Name: VIEW support_tickets_inbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.support_tickets_inbox IS 'Vista agregada para la bandeja de soporte de Black Wolf: incluye slug y nombre del tenant, contador de no leídos y total de mensajes.';


--
-- Name: system_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    contact_id uuid,
    agent_run_id uuid,
    event_type text,
    source text,
    action text,
    data jsonb,
    webhook_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: task_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    task_id uuid NOT NULL,
    sender_name text DEFAULT ''::text NOT NULL,
    sender_role text DEFAULT 'member'::text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_sprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_sprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    goal text DEFAULT ''::text,
    start_date date,
    end_date date,
    status text DEFAULT 'planned'::text NOT NULL,
    feedback text DEFAULT ''::text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_sprints_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: task_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid NOT NULL,
    name text NOT NULL,
    key text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#71717a'::text NOT NULL,
    is_terminal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    email text NOT NULL,
    password text,
    role text DEFAULT 'closer'::text NOT NULL,
    active boolean DEFAULT true,
    commission_rate numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    calendar_url text,
    closer_commission_rate numeric,
    setter_commission_rate numeric,
    commission_start_date date,
    mgmt_commission_start_date date,
    is_gestor boolean DEFAULT false,
    gestor_commission_rate numeric(5,3) DEFAULT 0,
    gestor_start_date date,
    gestor_capacity integer DEFAULT 8,
    password_hash text,
    owner_scope character varying(32),
    operator_id uuid,
    nav_prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    theme_preference text DEFAULT 'light'::text NOT NULL,
    assigned_clients jsonb,
    CONSTRAINT team_owner_scope_chk CHECK (((owner_scope IS NULL) OR ((owner_scope)::text = ANY ((ARRAY['portillo'::character varying, 'lukas'::character varying])::text[])))),
    CONSTRAINT team_theme_preference_check CHECK ((theme_preference = ANY (ARRAY['light'::text, 'dark'::text])))
);

ALTER TABLE ONLY public.team FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN team.nav_prefs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.nav_prefs IS 'Per-user nav customization. Format: {"hidden": ["/path1", "/path2"]}. Set from MyProfilePage → Mi Menú.';


--
-- Name: COLUMN team.theme_preference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.theme_preference IS 'Per-member UI theme preference. Drives the html.theme-{light|dark} class injected by ThemeContext at runtime.';


--
-- Name: team_leadership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_leadership (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    name text,
    role text,
    created_at timestamp with time zone DEFAULT now(),
    data jsonb
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text,
    email text,
    role text,
    active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'manager'::text NOT NULL,
    full_name text,
    invited_by_email text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: TABLE tenant_invitations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenant_invitations IS 'Invitaciones por email para incorporar usuarios a un tenant. PROP-002.';


--
-- Name: COLUMN tenant_invitations.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenant_invitations.role IS 'Rol con el que se creará la fila en `team` cuando se acepte la invitación. Alineado con los roles existentes (closer, manager, director, gestor, etc.).';


--
-- Name: COLUMN tenant_invitations.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenant_invitations.token IS 'Token único del link de invitación. Debe generarse con suficiente entropía (UUID o random_bytes hex).';


--
-- Name: training_formations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_formations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    route_id uuid,
    name text,
    description text,
    image_url text,
    level text,
    "position" integer,
    active boolean DEFAULT false,
    estimated_hours integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    module_id uuid,
    title text,
    description text,
    video_url text,
    duration text,
    "position" integer,
    locked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    formation_id uuid,
    name text,
    description text,
    image_url text,
    "position" integer,
    content_type text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: COLUMN training_modules.image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.training_modules.image_url IS 'URL de la imagen de portada del módulo (16:9 recomendado). NULL = sin banner.';


--
-- Name: training_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    user_email text,
    lesson_id uuid,
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text,
    description text,
    image_url text,
    "position" integer,
    active boolean DEFAULT false,
    access_type text,
    price_cents numeric,
    price_currency text,
    payment_url text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT training_routes_access_type_chk CHECK ((access_type = ANY (ARRAY['free'::text, 'paid'::text])))
);


--
-- Name: COLUMN training_routes.access_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.training_routes.access_type IS 'free = cualquier usuario registrado puede inscribirse. paid = requiere desbloqueo manual del admin (o webhook futuro) tras pago externo via payment_url.';


--
-- Name: COLUMN training_routes.payment_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.training_routes.payment_url IS 'URL externa de pago (Stripe Checkout link, Hotmart, etc.). El user clica desde la card bloqueada; tras confirmar pago el admin le marca subscription manual.';


--
-- Name: user_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    member_id uuid,
    service text,
    config jsonb,
    enabled boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    account_index text,
    account_label text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_integrations_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_integrations_enriched AS
 SELECT ui.id,
    ui.client_id,
    ui.member_id,
    t.name AS member_name,
    t.email AS member_email,
    t.role AS member_role,
    ui.service,
    ui.account_index,
    ui.account_label,
    ui.enabled,
        CASE
            WHEN (ui.config IS NULL) THEN false
            ELSE true
        END AS has_config,
    ui.created_at,
    ui.updated_at
   FROM (public.user_integrations ui
     JOIN public.team t ON ((t.id = ui.member_id)));


--
-- Name: user_onboarding_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_onboarding_answers (
    id bigint NOT NULL,
    client_id uuid NOT NULL,
    team_id uuid,
    user_email text NOT NULL,
    role text,
    source text,
    crm_experience text,
    prev_tools jsonb DEFAULT '[]'::jsonb,
    main_goal text,
    extra jsonb DEFAULT '{}'::jsonb,
    completed_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_onboarding_answers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_onboarding_answers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_onboarding_answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_onboarding_answers_id_seq OWNED BY public.user_onboarding_answers.id;


--
-- Name: webhook_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    url text,
    secret text,
    events jsonb,
    active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_dlq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_dlq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_id text,
    raw_body text,
    error_message text NOT NULL,
    headers jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retried_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_by text,
    resolved_at timestamp with time zone,
    resolved_notes text
);


--
-- Name: TABLE webhook_dlq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_dlq IS 'Dead letter queue: webhooks que fallaron al procesarse. Se retienen para retry manual o automático. Marcar resolved=true cuando se resuelve manualmente.';


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_id text NOT NULL,
    payload_summary jsonb,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE webhook_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_events IS 'Idempotency log para webhooks. Cada (provider, event_id) único. Permite descartar re-envíos del mismo evento.';


--
-- Name: weekly_feedback_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_feedback_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_email text NOT NULL,
    user_type text,
    client_slug text,
    client_id uuid,
    form_version integer NOT NULL,
    scale_answers jsonb NOT NULL,
    yesno_answers jsonb NOT NULL,
    text_answer text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    yesno_reasons jsonb
);


--
-- Name: weekly_feedback_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_feedback_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    summary_text text NOT NULL,
    analyzed_count integer NOT NULL,
    analyzed_response_ids jsonb NOT NULL,
    model text,
    tokens_in integer,
    tokens_out integer,
    auto_generated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: whatsapp_api_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_api_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    phone_number_id text NOT NULL,
    waba_id text,
    display_phone_number text,
    verified_name text,
    access_token text NOT NULL,
    business_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    webhook_verified boolean DEFAULT false NOT NULL,
    last_verified_at timestamp with time zone,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_api_accounts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'connected'::text, 'error'::text])))
);


--
-- Name: whatsapp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    connected boolean DEFAULT false,
    phone_number text DEFAULT ''::text,
    allowed_numbers text DEFAULT ''::text,
    group_id text DEFAULT ''::text,
    setter_enabled boolean DEFAULT false,
    setter_message text DEFAULT ''::text,
    setter_delay_minutes integer DEFAULT 5,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    setter_pipeline_id uuid,
    account_index integer DEFAULT 1 NOT NULL,
    account_label text DEFAULT ''::text NOT NULL,
    connection_method text DEFAULT 'qr'::text NOT NULL,
    cloud_phone_number_id text,
    cloud_access_token text,
    cloud_waba_id text,
    setter_default_stage_key text,
    operator_id uuid,
    setter_blacklist text[],
    setter_window jsonb,
    CONSTRAINT whatsapp_config_connection_method_check CHECK ((connection_method = ANY (ARRAY['qr'::text, 'cloud'::text])))
);


--
-- Name: COLUMN whatsapp_config.setter_blacklist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_config.setter_blacklist IS 'Lista de números (E.164 sin +) o JIDs (xxx@s.whatsapp.net) que el setter NO debe contactar. NULL/empty = sin blacklist.';


--
-- Name: COLUMN whatsapp_config.setter_window; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_config.setter_window IS 'Ventana horaria configurada: { enabled: bool, start: "HH:MM", end: "HH:MM", days: [0..6 lun..dom], timezone: IANA }. NULL/disabled = setter responde 24/7.';


--
-- Name: workflow_delayed_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_delayed_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    client_id uuid NOT NULL,
    node_id text NOT NULL,
    delay_type text DEFAULT 'delay'::text NOT NULL,
    resume_at timestamp with time zone NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    resumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_run_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_run_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    node_id text NOT NULL,
    node_type text,
    action_type text,
    status text DEFAULT 'pending'::text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    client_id uuid NOT NULL,
    contact_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    trigger_data jsonb DEFAULT '{}'::jsonb,
    context jsonb DEFAULT '{}'::jsonb,
    current_node_id text,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_webhook_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_webhook_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    workflow_id uuid,
    webhook_key text,
    active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text NOT NULL,
    trigger text NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb,
    actions jsonb DEFAULT '[]'::jsonb,
    enabled boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    run_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nodes jsonb DEFAULT '[]'::jsonb,
    edges jsonb DEFAULT '[]'::jsonb,
    version integer DEFAULT 2 NOT NULL,
    folder text DEFAULT ''::text,
    description text DEFAULT ''::text
);


--
-- Name: demo_signup_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_signup_attempts ALTER COLUMN id SET DEFAULT nextval('public.demo_signup_attempts_id_seq'::regclass);


--
-- Name: user_onboarding_answers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_answers ALTER COLUMN id SET DEFAULT nextval('public.user_onboarding_answers_id_seq'::regclass);


--
-- Name: agent_conversations agent_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_conversations
    ADD CONSTRAINT agent_conversations_pkey PRIMARY KEY (id);


--
-- Name: agent_decisions agent_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_decisions
    ADD CONSTRAINT agent_decisions_pkey PRIMARY KEY (id);


--
-- Name: agent_feedback agent_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback
    ADD CONSTRAINT agent_feedback_pkey PRIMARY KEY (id);


--
-- Name: agent_learnings agent_learnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_learnings
    ADD CONSTRAINT agent_learnings_pkey PRIMARY KEY (id);


--
-- Name: agent_messages agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: apex_admin_api_audit apex_admin_api_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_admin_api_audit
    ADD CONSTRAINT apex_admin_api_audit_pkey PRIMARY KEY (id);


--
-- Name: apex_leads apex_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_leads
    ADD CONSTRAINT apex_leads_pkey PRIMARY KEY (id);


--
-- Name: apex_newsletter_posts apex_newsletter_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_newsletter_posts
    ADD CONSTRAINT apex_newsletter_posts_pkey PRIMARY KEY (id);


--
-- Name: apex_newsletter_posts apex_newsletter_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_newsletter_posts
    ADD CONSTRAINT apex_newsletter_posts_slug_key UNIQUE (slug);


--
-- Name: apex_newsletter_sends apex_newsletter_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_newsletter_sends
    ADD CONSTRAINT apex_newsletter_sends_pkey PRIMARY KEY (id);


--
-- Name: apex_newsletter_subscribers apex_newsletter_subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_newsletter_subscribers
    ADD CONSTRAINT apex_newsletter_subscribers_email_key UNIQUE (email);


--
-- Name: apex_newsletter_subscribers apex_newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_newsletter_subscribers
    ADD CONSTRAINT apex_newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: apex_state apex_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_state
    ADD CONSTRAINT apex_state_pkey PRIMARY KEY (client_id, namespace);


--
-- Name: asesoriasuiza_establecimiento_submissions asesoriasuiza_establecimiento_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_establecimiento_submissions
    ADD CONSTRAINT asesoriasuiza_establecimiento_submissions_pkey PRIMARY KEY (id);


--
-- Name: asesoriasuiza_job_offers asesoriasuiza_job_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_job_offers
    ADD CONSTRAINT asesoriasuiza_job_offers_pkey PRIMARY KEY (id);


--
-- Name: asesoriasuiza_webinar_call_intake asesoriasuiza_webinar_call_intake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_webinar_call_intake
    ADD CONSTRAINT asesoriasuiza_webinar_call_intake_pkey PRIMARY KEY (id);


--
-- Name: asesoriasuiza_webinar_signups asesoriasuiza_webinar_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_webinar_signups
    ADD CONSTRAINT asesoriasuiza_webinar_signups_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_token_key UNIQUE (token);


--
-- Name: booking_hosts booking_hosts_client_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_hosts
    ADD CONSTRAINT booking_hosts_client_id_slug_key UNIQUE (client_id, slug);


--
-- Name: booking_hosts booking_hosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_hosts
    ADD CONSTRAINT booking_hosts_pkey PRIMARY KEY (id);


--
-- Name: booking_reminders booking_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_pkey PRIMARY KEY (id);


--
-- Name: booking_reminders booking_reminders_unique_per_booking_channel_offset; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_unique_per_booking_channel_offset UNIQUE (booking_id, channel, offset_minutes);


--
-- Name: booking_routing_forms booking_routing_forms_client_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_forms
    ADD CONSTRAINT booking_routing_forms_client_id_slug_key UNIQUE (client_id, slug);


--
-- Name: booking_routing_forms booking_routing_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_forms
    ADD CONSTRAINT booking_routing_forms_pkey PRIMARY KEY (id);


--
-- Name: booking_routing_responses booking_routing_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_responses
    ADD CONSTRAINT booking_routing_responses_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: brain_decisions brain_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_decisions
    ADD CONSTRAINT brain_decisions_pkey PRIMARY KEY (id);


--
-- Name: bulk_send_jobs bulk_send_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_send_jobs
    ADD CONSTRAINT bulk_send_jobs_pkey PRIMARY KEY (id);


--
-- Name: bulk_send_recipients bulk_send_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_send_recipients
    ADD CONSTRAINT bulk_send_recipients_pkey PRIMARY KEY (id);


--
-- Name: bw_client_deliverables bw_client_deliverables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_client_deliverables
    ADD CONSTRAINT bw_client_deliverables_pkey PRIMARY KEY (id);


--
-- Name: bw_client_projects bw_client_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_client_projects
    ADD CONSTRAINT bw_client_projects_pkey PRIMARY KEY (id);


--
-- Name: bw_client_projects bw_client_projects_target_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_client_projects
    ADD CONSTRAINT bw_client_projects_target_client_id_key UNIQUE (target_client_id);


--
-- Name: bw_contracts bw_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_contracts
    ADD CONSTRAINT bw_contracts_pkey PRIMARY KEY (id);


--
-- Name: bw_onboarding_steps bw_onboarding_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_onboarding_steps
    ADD CONSTRAINT bw_onboarding_steps_pkey PRIMARY KEY (id);


--
-- Name: bw_support_tickets bw_support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_support_tickets
    ADD CONSTRAINT bw_support_tickets_pkey PRIMARY KEY (id);


--
-- Name: bw_ticket_messages bw_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_ticket_messages
    ADD CONSTRAINT bw_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: calendly_auth calendly_auth_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendly_auth
    ADD CONSTRAINT calendly_auth_client_id_key UNIQUE (client_id);


--
-- Name: calendly_auth calendly_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendly_auth
    ADD CONSTRAINT calendly_auth_pkey PRIMARY KEY (id);


--
-- Name: ceo_daily_digests ceo_daily_digests_client_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_daily_digests
    ADD CONSTRAINT ceo_daily_digests_client_id_date_key UNIQUE (client_id, date);


--
-- Name: ceo_daily_digests ceo_daily_digests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_daily_digests
    ADD CONSTRAINT ceo_daily_digests_pkey PRIMARY KEY (id);


--
-- Name: ceo_finance_entries ceo_finance_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_finance_entries
    ADD CONSTRAINT ceo_finance_entries_pkey PRIMARY KEY (id);


--
-- Name: ceo_ideas ceo_ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_ideas
    ADD CONSTRAINT ceo_ideas_pkey PRIMARY KEY (id);


--
-- Name: ceo_integrations ceo_integrations_client_id_service_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_integrations
    ADD CONSTRAINT ceo_integrations_client_id_service_key UNIQUE (client_id, service);


--
-- Name: ceo_integrations ceo_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_integrations
    ADD CONSTRAINT ceo_integrations_pkey PRIMARY KEY (id);


--
-- Name: ceo_meetings ceo_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_meetings
    ADD CONSTRAINT ceo_meetings_pkey PRIMARY KEY (id);


--
-- Name: ceo_projects ceo_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_projects
    ADD CONSTRAINT ceo_projects_pkey PRIMARY KEY (id);


--
-- Name: ceo_team_notes ceo_team_notes_client_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_team_notes
    ADD CONSTRAINT ceo_team_notes_client_id_member_id_key UNIQUE (client_id, member_id);


--
-- Name: ceo_team_notes ceo_team_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_team_notes
    ADD CONSTRAINT ceo_team_notes_pkey PRIMARY KEY (id);


--
-- Name: ceo_weekly_digests ceo_weekly_digests_client_id_week_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_weekly_digests
    ADD CONSTRAINT ceo_weekly_digests_client_id_week_start_key UNIQUE (client_id, week_start);


--
-- Name: ceo_weekly_digests ceo_weekly_digests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_weekly_digests
    ADD CONSTRAINT ceo_weekly_digests_pkey PRIMARY KEY (id);


--
-- Name: chat_broadcasts chat_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_broadcasts
    ADD CONSTRAINT chat_broadcasts_pkey PRIMARY KEY (id);


--
-- Name: chat_contacts chat_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contacts
    ADD CONSTRAINT chat_contacts_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_flows chat_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_flows
    ADD CONSTRAINT chat_flows_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_configs chatbot_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_configs
    ADD CONSTRAINT chatbot_configs_pkey PRIMARY KEY (id);


--
-- Name: chatbot_knowledge chatbot_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_knowledge
    ADD CONSTRAINT chatbot_knowledge_pkey PRIMARY KEY (id);


--
-- Name: client_operators client_operators_client_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_operators
    ADD CONSTRAINT client_operators_client_slug_key UNIQUE (client_id, slug);


--
-- Name: client_operators client_operators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_operators
    ADD CONSTRAINT client_operators_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_slug_key UNIQUE (slug);


--
-- Name: close_sync_log close_sync_log_client_id_started_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_sync_log
    ADD CONSTRAINT close_sync_log_client_id_started_at_key UNIQUE (client_id, started_at);


--
-- Name: close_sync_log close_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_sync_log
    ADD CONSTRAINT close_sync_log_pkey PRIMARY KEY (id);


--
-- Name: commission_payments commission_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payments
    ADD CONSTRAINT commission_payments_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_client_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_client_id_role_key UNIQUE (client_id, role);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: comunidad_channels comunidad_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunidad_channels
    ADD CONSTRAINT comunidad_channels_pkey PRIMARY KEY (id);


--
-- Name: comunidad_messages comunidad_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunidad_messages
    ADD CONSTRAINT comunidad_messages_pkey PRIMARY KEY (id);


--
-- Name: console_api_keys console_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.console_api_keys
    ADD CONSTRAINT console_api_keys_pkey PRIMARY KEY (id);


--
-- Name: copies_guiones copies_guiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies_guiones
    ADD CONSTRAINT copies_guiones_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_custom_fields crm_custom_fields_client_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_custom_fields
    ADD CONSTRAINT crm_custom_fields_client_id_field_key_key UNIQUE (client_id, field_key);


--
-- Name: crm_custom_fields crm_custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_custom_fields
    ADD CONSTRAINT crm_custom_fields_pkey PRIMARY KEY (id);


--
-- Name: crm_files crm_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_files
    ADD CONSTRAINT crm_files_pkey PRIMARY KEY (id);


--
-- Name: crm_messages crm_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_messages
    ADD CONSTRAINT crm_messages_pkey PRIMARY KEY (id);


--
-- Name: crm_pipelines crm_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipelines
    ADD CONSTRAINT crm_pipelines_pkey PRIMARY KEY (id);


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_pkey PRIMARY KEY (id);


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_sequence_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_sequence_id_contact_id_key UNIQUE (sequence_id, contact_id);


--
-- Name: crm_sequences crm_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequences
    ADD CONSTRAINT crm_sequences_pkey PRIMARY KEY (id);


--
-- Name: crm_smart_views crm_smart_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_smart_views
    ADD CONSTRAINT crm_smart_views_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks_archive crm_tasks_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks_archive
    ADD CONSTRAINT crm_tasks_archive_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: demo_signup_attempts demo_signup_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_signup_attempts
    ADD CONSTRAINT demo_signup_attempts_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_config email_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_config
    ADD CONSTRAINT email_config_pkey PRIMARY KEY (id);


--
-- Name: email_lists email_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_lists
    ADD CONSTRAINT email_lists_pkey PRIMARY KEY (id);


--
-- Name: email_sequence_contacts email_sequence_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_contacts
    ADD CONSTRAINT email_sequence_contacts_pkey PRIMARY KEY (id);


--
-- Name: email_sequences email_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequences
    ADD CONSTRAINT email_sequences_pkey PRIMARY KEY (id);


--
-- Name: email_subscribers email_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_subscribers
    ADD CONSTRAINT email_subscribers_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: erp_accounting erp_accounting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_accounting
    ADD CONSTRAINT erp_accounting_pkey PRIMARY KEY (id);


--
-- Name: erp_companies erp_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_companies
    ADD CONSTRAINT erp_companies_pkey PRIMARY KEY (id);


--
-- Name: erp_contacts erp_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_contacts
    ADD CONSTRAINT erp_contacts_pkey PRIMARY KEY (id);


--
-- Name: erp_employees erp_employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_employees
    ADD CONSTRAINT erp_employees_pkey PRIMARY KEY (id);


--
-- Name: erp_invoices erp_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_invoices
    ADD CONSTRAINT erp_invoices_pkey PRIMARY KEY (id);


--
-- Name: erp_production_orders erp_production_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_production_orders
    ADD CONSTRAINT erp_production_orders_pkey PRIMARY KEY (id);


--
-- Name: erp_products erp_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_products
    ADD CONSTRAINT erp_products_pkey PRIMARY KEY (id);


--
-- Name: erp_stock_moves erp_stock_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_stock_moves
    ADD CONSTRAINT erp_stock_moves_pkey PRIMARY KEY (id);


--
-- Name: erp_users erp_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erp_users
    ADD CONSTRAINT erp_users_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: feedback_form_config feedback_form_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_form_config
    ADD CONSTRAINT feedback_form_config_pkey PRIMARY KEY (id);


--
-- Name: fireflies_transcripts fireflies_transcripts_client_id_fireflies_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fireflies_transcripts
    ADD CONSTRAINT fireflies_transcripts_client_id_fireflies_id_key UNIQUE (client_id, fireflies_id);


--
-- Name: fireflies_transcripts fireflies_transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fireflies_transcripts
    ADD CONSTRAINT fireflies_transcripts_pkey PRIMARY KEY (id);


--
-- Name: formacion_cursos formacion_cursos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formacion_cursos
    ADD CONSTRAINT formacion_cursos_pkey PRIMARY KEY (id);


--
-- Name: formacion_videos formacion_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formacion_videos
    ADD CONSTRAINT formacion_videos_pkey PRIMARY KEY (id);


--
-- Name: info_producto_assets info_producto_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_producto_assets
    ADD CONSTRAINT info_producto_assets_pkey PRIMARY KEY (id);


--
-- Name: info_producto_process_steps info_producto_process_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_producto_process_steps
    ADD CONSTRAINT info_producto_process_steps_pkey PRIMARY KEY (id);


--
-- Name: info_producto_process_templates info_producto_process_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_producto_process_templates
    ADD CONSTRAINT info_producto_process_templates_pkey PRIMARY KEY (id);


--
-- Name: info_productos info_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_productos
    ADD CONSTRAINT info_productos_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_about infoproducto_about_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_about
    ADD CONSTRAINT infoproducto_about_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_announcements infoproducto_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_announcements
    ADD CONSTRAINT infoproducto_announcements_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_config infoproducto_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_config
    ADD CONSTRAINT infoproducto_config_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_config infoproducto_config_tenant_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_config
    ADD CONSTRAINT infoproducto_config_tenant_slug_key UNIQUE (tenant_slug);


--
-- Name: infoproducto_group_members infoproducto_group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_members
    ADD CONSTRAINT infoproducto_group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: infoproducto_group_members infoproducto_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_members
    ADD CONSTRAINT infoproducto_group_members_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_group_posts infoproducto_group_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_posts
    ADD CONSTRAINT infoproducto_group_posts_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_groups infoproducto_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_groups
    ADD CONSTRAINT infoproducto_groups_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_photos infoproducto_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_photos
    ADD CONSTRAINT infoproducto_photos_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_sessions infoproducto_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_sessions
    ADD CONSTRAINT infoproducto_sessions_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_sessions infoproducto_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_sessions
    ADD CONSTRAINT infoproducto_sessions_token_key UNIQUE (token);


--
-- Name: infoproducto_users infoproducto_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_users
    ADD CONSTRAINT infoproducto_users_pkey PRIMARY KEY (id);


--
-- Name: infoproducto_users infoproducto_users_tenant_slug_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_users
    ADD CONSTRAINT infoproducto_users_tenant_slug_email_key UNIQUE (tenant_slug, email);


--
-- Name: installment_payments installment_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_payments
    ADD CONSTRAINT installment_payments_pkey PRIMARY KEY (id);


--
-- Name: installment_plans installment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_plans
    ADD CONSTRAINT installment_plans_pkey PRIMARY KEY (id);


--
-- Name: integration_services integration_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_services
    ADD CONSTRAINT integration_services_pkey PRIMARY KEY (key);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_stripe_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);


--
-- Name: legal_documents legal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);


--
-- Name: linkedin_daily_reports linkedin_daily_reports_client_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_daily_reports
    ADD CONSTRAINT linkedin_daily_reports_client_id_date_key UNIQUE (client_id, date);


--
-- Name: linkedin_daily_reports linkedin_daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_daily_reports
    ADD CONSTRAINT linkedin_daily_reports_pkey PRIMARY KEY (id);


--
-- Name: linkedin_posts linkedin_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_posts
    ADD CONSTRAINT linkedin_posts_pkey PRIMARY KEY (id);


--
-- Name: logistics_orders logistics_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_orders
    ADD CONSTRAINT logistics_orders_pkey PRIMARY KEY (id);


--
-- Name: logistics_pricing_history logistics_pricing_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_pricing_history
    ADD CONSTRAINT logistics_pricing_history_pkey PRIMARY KEY (id);


--
-- Name: logistics_pricing_stats logistics_pricing_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_pricing_stats
    ADD CONSTRAINT logistics_pricing_stats_pkey PRIMARY KEY (id);


--
-- Name: logistics_quotes logistics_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_quotes
    ADD CONSTRAINT logistics_quotes_pkey PRIMARY KEY (id);


--
-- Name: manychat_config manychat_config_client_acctidx_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manychat_config
    ADD CONSTRAINT manychat_config_client_acctidx_key UNIQUE (client_id, account_index);


--
-- Name: manychat_config manychat_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manychat_config
    ADD CONSTRAINT manychat_config_pkey PRIMARY KEY (id);


--
-- Name: marketplace_applications marketplace_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_applications
    ADD CONSTRAINT marketplace_applications_pkey PRIMARY KEY (id);


--
-- Name: marketplace_jobs marketplace_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_jobs
    ADD CONSTRAINT marketplace_jobs_pkey PRIMARY KEY (id);


--
-- Name: mid_channels mid_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_channels
    ADD CONSTRAINT mid_channels_pkey PRIMARY KEY (id);


--
-- Name: mid_channels mid_channels_tenant_slug_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_channels
    ADD CONSTRAINT mid_channels_tenant_slug_name_key UNIQUE (tenant_slug, name);


--
-- Name: mid_communities mid_communities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_communities
    ADD CONSTRAINT mid_communities_pkey PRIMARY KEY (id);


--
-- Name: mid_community_members mid_community_members_community_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_community_members
    ADD CONSTRAINT mid_community_members_community_id_user_id_key UNIQUE (community_id, user_id);


--
-- Name: mid_community_members mid_community_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_community_members
    ADD CONSTRAINT mid_community_members_pkey PRIMARY KEY (id);


--
-- Name: mid_events mid_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_events
    ADD CONSTRAINT mid_events_pkey PRIMARY KEY (id);


--
-- Name: mid_gate_submissions mid_gate_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_gate_submissions
    ADD CONSTRAINT mid_gate_submissions_pkey PRIMARY KEY (id);


--
-- Name: mid_lesson_grants mid_lesson_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_grants
    ADD CONSTRAINT mid_lesson_grants_pkey PRIMARY KEY (user_id, lesson_id);


--
-- Name: mid_lesson_progress mid_lesson_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_progress
    ADD CONSTRAINT mid_lesson_progress_pkey PRIMARY KEY (id);


--
-- Name: mid_lesson_progress mid_lesson_progress_user_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_progress
    ADD CONSTRAINT mid_lesson_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);


--
-- Name: mid_messages mid_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_messages
    ADD CONSTRAINT mid_messages_pkey PRIMARY KEY (id);


--
-- Name: mid_posts mid_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_posts
    ADD CONSTRAINT mid_posts_pkey PRIMARY KEY (id);


--
-- Name: mid_route_subscriptions mid_route_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_route_subscriptions
    ADD CONSTRAINT mid_route_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: mid_route_subscriptions mid_route_subscriptions_user_id_route_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_route_subscriptions
    ADD CONSTRAINT mid_route_subscriptions_user_id_route_id_key UNIQUE (user_id, route_id);


--
-- Name: mid_support_messages mid_support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_support_messages
    ADD CONSTRAINT mid_support_messages_pkey PRIMARY KEY (id);


--
-- Name: mid_support_threads mid_support_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_support_threads
    ADD CONSTRAINT mid_support_threads_pkey PRIMARY KEY (id);


--
-- Name: mid_support_threads mid_support_threads_tenant_slug_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_support_threads
    ADD CONSTRAINT mid_support_threads_tenant_slug_user_id_key UNIQUE (tenant_slug, user_id);


--
-- Name: n8n_config n8n_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_config
    ADD CONSTRAINT n8n_config_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onboarding_config onboarding_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_config
    ADD CONSTRAINT onboarding_config_pkey PRIMARY KEY (id);


--
-- Name: onboarding_keys onboarding_keys_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_keys
    ADD CONSTRAINT onboarding_keys_key_key UNIQUE (key);


--
-- Name: onboarding_keys onboarding_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_keys
    ADD CONSTRAINT onboarding_keys_pkey PRIMARY KEY (id);


--
-- Name: operations_links operations_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_links
    ADD CONSTRAINT operations_links_pkey PRIMARY KEY (id);


--
-- Name: ops_ticket_events ops_ticket_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_events
    ADD CONSTRAINT ops_ticket_events_pkey PRIMARY KEY (id);


--
-- Name: ops_ticket_messages ops_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_messages
    ADD CONSTRAINT ops_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: ops_ticket_pipeline ops_ticket_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_pipeline
    ADD CONSTRAINT ops_ticket_pipeline_pkey PRIMARY KEY (id);


--
-- Name: ops_ticket_pipeline ops_ticket_pipeline_workspace_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_pipeline
    ADD CONSTRAINT ops_ticket_pipeline_workspace_key UNIQUE (workspace);


--
-- Name: ops_tickets ops_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_tickets
    ADD CONSTRAINT ops_tickets_pkey PRIMARY KEY (id);


--
-- Name: orbe_messages orbe_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orbe_messages
    ADD CONSTRAINT orbe_messages_pkey PRIMARY KEY (id);


--
-- Name: payment_fees payment_fees_client_id_method_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_fees
    ADD CONSTRAINT payment_fees_client_id_method_key UNIQUE (client_id, method);


--
-- Name: payment_fees payment_fees_client_method_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_fees
    ADD CONSTRAINT payment_fees_client_method_unique UNIQUE (client_id, method);


--
-- Name: payment_fees payment_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_fees
    ADD CONSTRAINT payment_fees_pkey PRIMARY KEY (id);


--
-- Name: payment_links payment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);


--
-- Name: portal_otp_codes portal_otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_otp_codes
    ADD CONSTRAINT portal_otp_codes_pkey PRIMARY KEY (id);


--
-- Name: products products_client_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_client_id_name_key UNIQUE (client_id, name);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: projections projections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projections
    ADD CONSTRAINT projections_pkey PRIMARY KEY (id);


--
-- Name: recall_calls recall_calls_client_id_bot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_calls
    ADD CONSTRAINT recall_calls_client_id_bot_id_key UNIQUE (client_id, bot_id);


--
-- Name: recall_calls recall_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_calls
    ADD CONSTRAINT recall_calls_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: roadmap_objectives roadmap_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_objectives
    ADD CONSTRAINT roadmap_objectives_pkey PRIMARY KEY (id);


--
-- Name: roadmaps roadmaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmaps
    ADD CONSTRAINT roadmaps_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: scrap_agent_queue scrap_agent_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_agent_queue
    ADD CONSTRAINT scrap_agent_queue_pkey PRIMARY KEY (id);


--
-- Name: signups signups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signups
    ADD CONSTRAINT signups_pkey PRIMARY KEY (id);


--
-- Name: store_alerts store_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_alerts
    ADD CONSTRAINT store_alerts_pkey PRIMARY KEY (id);


--
-- Name: store_clients store_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_clients
    ADD CONSTRAINT store_clients_pkey PRIMARY KEY (id);


--
-- Name: store_daily_tracking store_daily_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_daily_tracking
    ADD CONSTRAINT store_daily_tracking_pkey PRIMARY KEY (id);


--
-- Name: store_daily_tracking store_daily_tracking_store_id_tracking_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_daily_tracking
    ADD CONSTRAINT store_daily_tracking_store_id_tracking_date_key UNIQUE (store_id, tracking_date);


--
-- Name: store_history store_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_history
    ADD CONSTRAINT store_history_pkey PRIMARY KEY (id);


--
-- Name: store_history store_history_store_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_history
    ADD CONSTRAINT store_history_store_id_month_key UNIQUE (store_id, month);


--
-- Name: store_steps store_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_steps
    ADD CONSTRAINT store_steps_pkey PRIMARY KEY (id);


--
-- Name: store_ticket_messages store_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_ticket_messages
    ADD CONSTRAINT store_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: store_tickets store_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_tickets
    ADD CONSTRAINT store_tickets_pkey PRIMARY KEY (id);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_slug_key UNIQUE (slug);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: superadmin_commissions superadmin_commissions_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_commissions
    ADD CONSTRAINT superadmin_commissions_client_id_key UNIQUE (client_id);


--
-- Name: superadmin_commissions superadmin_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_commissions
    ADD CONSTRAINT superadmin_commissions_pkey PRIMARY KEY (id);


--
-- Name: superadmins superadmins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmins
    ADD CONSTRAINT superadmins_email_key UNIQUE (email);


--
-- Name: superadmins superadmins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmins
    ADD CONSTRAINT superadmins_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_events system_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_pkey PRIMARY KEY (id);


--
-- Name: task_messages task_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_pkey PRIMARY KEY (id);


--
-- Name: task_pipelines task_pipelines_client_name_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pipelines
    ADD CONSTRAINT task_pipelines_client_name_uniq UNIQUE (client_id, name);


--
-- Name: task_pipelines task_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pipelines
    ADD CONSTRAINT task_pipelines_pkey PRIMARY KEY (id);


--
-- Name: task_sprints task_sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_sprints
    ADD CONSTRAINT task_sprints_pkey PRIMARY KEY (id);


--
-- Name: task_stages task_stages_pipeline_key_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_stages
    ADD CONSTRAINT task_stages_pipeline_key_uniq UNIQUE (pipeline_id, key);


--
-- Name: task_stages task_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_stages
    ADD CONSTRAINT task_stages_pkey PRIMARY KEY (id);


--
-- Name: team team_client_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_client_email_unique UNIQUE (client_id, email);


--
-- Name: team team_client_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_client_id_email_key UNIQUE (client_id, email);


--
-- Name: team_leadership team_leadership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_leadership
    ADD CONSTRAINT team_leadership_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team team_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_pkey PRIMARY KEY (id);


--
-- Name: tenant_invitations tenant_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_pkey PRIMARY KEY (id);


--
-- Name: tenant_invitations tenant_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_token_key UNIQUE (token);


--
-- Name: training_formations training_formations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_formations
    ADD CONSTRAINT training_formations_pkey PRIMARY KEY (id);


--
-- Name: training_lessons training_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lessons
    ADD CONSTRAINT training_lessons_pkey PRIMARY KEY (id);


--
-- Name: training_modules training_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_modules
    ADD CONSTRAINT training_modules_pkey PRIMARY KEY (id);


--
-- Name: training_progress training_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_progress
    ADD CONSTRAINT training_progress_pkey PRIMARY KEY (id);


--
-- Name: training_routes training_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_routes
    ADD CONSTRAINT training_routes_pkey PRIMARY KEY (id);


--
-- Name: user_integrations user_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);


--
-- Name: user_onboarding_answers user_onboarding_answers_client_id_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_answers
    ADD CONSTRAINT user_onboarding_answers_client_id_user_email_key UNIQUE (client_id, user_email);


--
-- Name: user_onboarding_answers user_onboarding_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_answers
    ADD CONSTRAINT user_onboarding_answers_pkey PRIMARY KEY (id);


--
-- Name: webhook_config webhook_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_config
    ADD CONSTRAINT webhook_config_pkey PRIMARY KEY (id);


--
-- Name: webhook_dlq webhook_dlq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_dlq
    ADD CONSTRAINT webhook_dlq_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_provider_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_provider_event_id_key UNIQUE (provider, event_id);


--
-- Name: weekly_feedback_responses weekly_feedback_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_feedback_responses
    ADD CONSTRAINT weekly_feedback_responses_pkey PRIMARY KEY (id);


--
-- Name: weekly_feedback_summaries weekly_feedback_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_feedback_summaries
    ADD CONSTRAINT weekly_feedback_summaries_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_api_accounts whatsapp_api_accounts_client_id_phone_number_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_api_accounts
    ADD CONSTRAINT whatsapp_api_accounts_client_id_phone_number_id_key UNIQUE (client_id, phone_number_id);


--
-- Name: whatsapp_api_accounts whatsapp_api_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_api_accounts
    ADD CONSTRAINT whatsapp_api_accounts_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_config whatsapp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_pkey PRIMARY KEY (id);


--
-- Name: workflow_delayed_steps workflow_delayed_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_delayed_steps
    ADD CONSTRAINT workflow_delayed_steps_pkey PRIMARY KEY (id);


--
-- Name: workflow_run_steps workflow_run_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run_steps
    ADD CONSTRAINT workflow_run_steps_pkey PRIMARY KEY (id);


--
-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: workflow_webhook_triggers workflow_webhook_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_webhook_triggers
    ADD CONSTRAINT workflow_webhook_triggers_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: apex_state_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX apex_state_client_idx ON public.apex_state USING btree (client_id);


--
-- Name: crm_tasks_pipeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_pipeline_idx ON public.crm_tasks USING btree (pipeline_id);


--
-- Name: crm_tasks_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_stage_idx ON public.crm_tasks USING btree (stage_id);


--
-- Name: email_config_client_account_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_config_client_account_uidx ON public.email_config USING btree (client_id, account_index);


--
-- Name: idx_aci_owner_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aci_owner_created ON public.asesoriasuiza_webinar_call_intake USING btree (owner, created_at DESC);


--
-- Name: idx_aci_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aci_status ON public.asesoriasuiza_webinar_call_intake USING btree (booking_status);


--
-- Name: idx_aes_owner_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aes_owner_created ON public.asesoriasuiza_establecimiento_submissions USING btree (owner, created_at DESC);


--
-- Name: idx_agent_conversations_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_conversations_client ON public.agent_conversations USING btree (client_id);


--
-- Name: idx_agent_conversations_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_conversations_contact ON public.agent_conversations USING btree (contact_id);


--
-- Name: idx_agent_conversations_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_conversations_updated ON public.agent_conversations USING btree (updated_at DESC);


--
-- Name: idx_agent_decisions_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_decisions_agent ON public.agent_decisions USING btree (agent_name, created_at DESC);


--
-- Name: idx_agent_decisions_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_decisions_client ON public.agent_decisions USING btree (client_id, created_at DESC);


--
-- Name: idx_agent_decisions_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_decisions_contact ON public.agent_decisions USING btree (contact_id, created_at DESC);


--
-- Name: idx_agent_feedback_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_feedback_decision ON public.agent_feedback USING btree (decision_id);


--
-- Name: idx_agent_feedback_verdict; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_feedback_verdict ON public.agent_feedback USING btree (verdict, created_at DESC);


--
-- Name: idx_agent_learnings_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_learnings_client ON public.agent_learnings USING btree (client_id, agent_name, status);


--
-- Name: idx_agent_learnings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_learnings_status ON public.agent_learnings USING btree (status, agent_name);


--
-- Name: idx_agent_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_messages_conversation ON public.agent_messages USING btree (conversation_id);


--
-- Name: idx_agent_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_messages_created ON public.agent_messages USING btree (created_at);


--
-- Name: idx_agent_runs_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_client ON public.agent_runs USING btree (client_id);


--
-- Name: idx_agent_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_status ON public.agent_runs USING btree (status);


--
-- Name: idx_agent_runs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_type ON public.agent_runs USING btree (agent_type);


--
-- Name: idx_apex_admin_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_admin_audit_created_at ON public.apex_admin_api_audit USING btree (created_at DESC);


--
-- Name: idx_apex_admin_audit_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_admin_audit_endpoint ON public.apex_admin_api_audit USING btree (endpoint, created_at DESC);


--
-- Name: idx_apex_leads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_leads_created_at ON public.apex_leads USING btree (created_at DESC);


--
-- Name: idx_apex_leads_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_leads_email ON public.apex_leads USING btree (business_email);


--
-- Name: idx_apex_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_leads_status ON public.apex_leads USING btree (status);


--
-- Name: idx_apex_posts_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_posts_language ON public.apex_newsletter_posts USING btree (language);


--
-- Name: idx_apex_posts_status_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_posts_status_published ON public.apex_newsletter_posts USING btree (status, published_at DESC NULLS LAST);


--
-- Name: idx_apex_sends_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_sends_post ON public.apex_newsletter_sends USING btree (post_id, sent_at DESC);


--
-- Name: idx_apex_subs_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_subs_email_lower ON public.apex_newsletter_subscribers USING btree (lower(email));


--
-- Name: idx_apex_subs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apex_subs_status ON public.apex_newsletter_subscribers USING btree (status);


--
-- Name: idx_asj_owner_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asj_owner_active ON public.asesoriasuiza_job_offers USING btree (owner, activo, sort_order);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action, created_at DESC);


--
-- Name: idx_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_id, created_at DESC);


--
-- Name: idx_audit_logs_client_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_client_created ON public.audit_logs USING btree (client_id, created_at DESC);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_auth_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_active ON public.auth_sessions USING btree (expires_at, revoked_at);


--
-- Name: idx_auth_sessions_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_member ON public.auth_sessions USING btree (member_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_auth_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_token ON public.auth_sessions USING btree (token) WHERE (revoked_at IS NULL);


--
-- Name: idx_aws_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aws_email ON public.asesoriasuiza_webinar_signups USING btree (email);


--
-- Name: idx_aws_owner_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aws_owner_created ON public.asesoriasuiza_webinar_signups USING btree (owner, created_at DESC);


--
-- Name: idx_booking_hosts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_hosts_client ON public.booking_hosts USING btree (client_id, is_active, "position");


--
-- Name: idx_booking_hosts_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_hosts_operator ON public.booking_hosts USING btree (operator_id);


--
-- Name: idx_booking_reminders_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_reminders_booking ON public.booking_reminders USING btree (booking_id);


--
-- Name: idx_booking_reminders_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_reminders_due ON public.booking_reminders USING btree (status, fire_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_booking_routing_forms_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_routing_forms_client ON public.booking_routing_forms USING btree (client_id, active);


--
-- Name: idx_booking_routing_responses_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_routing_responses_form ON public.booking_routing_responses USING btree (routing_form_id, created_at DESC);


--
-- Name: idx_bookings_calendly_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_calendly_event ON public.bookings USING btree (calendly_event_uri) WHERE (calendly_event_uri IS NOT NULL);


--
-- Name: idx_bookings_calendly_invitee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_calendly_invitee ON public.bookings USING btree (calendly_invitee_uri) WHERE (calendly_invitee_uri IS NOT NULL);


--
-- Name: idx_bookings_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_client ON public.bookings USING btree (client_id);


--
-- Name: idx_bookings_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_host ON public.bookings USING btree (client_id, host);


--
-- Name: idx_bookings_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_start ON public.bookings USING btree (client_id, start_at);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (client_id, status);


--
-- Name: idx_brr_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brr_action ON public.booking_routing_responses USING btree (client_id, action_taken, created_at DESC);


--
-- Name: idx_brr_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brr_contact ON public.booking_routing_responses USING btree (crm_contact_id);


--
-- Name: idx_bulk_send_jobs_client_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_send_jobs_client_status ON public.bulk_send_jobs USING btree (client_id, status, created_at DESC);


--
-- Name: idx_bulk_send_recipients_job_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_send_recipients_job_status ON public.bulk_send_recipients USING btree (job_id, status);


--
-- Name: idx_bulk_send_recipients_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_send_recipients_pending ON public.bulk_send_recipients USING btree (job_id) WHERE (status = 'pending'::text);


--
-- Name: idx_bw_contracts_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_contracts_folder ON public.bw_contracts USING btree (project_id, folder);


--
-- Name: idx_bw_contracts_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_contracts_project ON public.bw_contracts USING btree (project_id);


--
-- Name: idx_bw_deliverables_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_deliverables_project ON public.bw_client_deliverables USING btree (project_id);


--
-- Name: idx_bw_projects_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_projects_target ON public.bw_client_projects USING btree (target_client_id);


--
-- Name: idx_bw_steps_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_steps_project ON public.bw_onboarding_steps USING btree (project_id);


--
-- Name: idx_bw_ticket_msgs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_ticket_msgs ON public.bw_ticket_messages USING btree (ticket_id);


--
-- Name: idx_bw_tickets_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bw_tickets_project ON public.bw_support_tickets USING btree (project_id);


--
-- Name: idx_ceo_daily_digests_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_daily_digests_date ON public.ceo_daily_digests USING btree (client_id, date DESC);


--
-- Name: idx_ceo_finance_entries_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_finance_entries_category ON public.ceo_finance_entries USING btree (client_id, category);


--
-- Name: idx_ceo_finance_entries_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_finance_entries_client ON public.ceo_finance_entries USING btree (client_id);


--
-- Name: idx_ceo_finance_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_finance_entries_date ON public.ceo_finance_entries USING btree (client_id, date DESC);


--
-- Name: idx_ceo_ideas_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_ideas_client ON public.ceo_ideas USING btree (client_id);


--
-- Name: idx_ceo_ideas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_ideas_status ON public.ceo_ideas USING btree (client_id, status);


--
-- Name: idx_ceo_integrations_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_integrations_service ON public.ceo_integrations USING btree (client_id, service);


--
-- Name: idx_ceo_meetings_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_meetings_client ON public.ceo_meetings USING btree (client_id);


--
-- Name: idx_ceo_meetings_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_meetings_date ON public.ceo_meetings USING btree (client_id, date DESC);


--
-- Name: idx_ceo_projects_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_projects_client ON public.ceo_projects USING btree (client_id);


--
-- Name: idx_ceo_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_projects_status ON public.ceo_projects USING btree (client_id, status);


--
-- Name: idx_ceo_team_notes_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_team_notes_member ON public.ceo_team_notes USING btree (client_id, member_id);


--
-- Name: idx_ceo_weekly_digests_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceo_weekly_digests_week ON public.ceo_weekly_digests USING btree (client_id, week_start DESC);


--
-- Name: idx_chatbot_configs_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_configs_client ON public.chatbot_configs USING btree (client_id);


--
-- Name: idx_chatbot_knowledge_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_knowledge_chatbot ON public.chatbot_knowledge USING btree (chatbot_id);


--
-- Name: idx_chatbot_knowledge_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_knowledge_client ON public.chatbot_knowledge USING btree (client_id);


--
-- Name: idx_client_operators_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_operators_client ON public.client_operators USING btree (client_id);


--
-- Name: idx_clients_config_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_config_language ON public.clients USING btree (((config ->> 'language'::text))) WHERE (slug <> 'fba-academy'::text);


--
-- Name: idx_clients_demo_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_demo_expires ON public.clients USING btree (demo_expires_at) WHERE (client_type = 'demo'::text);


--
-- Name: idx_clients_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_slug ON public.clients USING btree (slug);


--
-- Name: idx_close_sync_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_close_sync_client ON public.close_sync_log USING btree (client_id);


--
-- Name: idx_close_sync_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_close_sync_status ON public.close_sync_log USING btree (status);


--
-- Name: idx_commission_payments_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_payments_client ON public.commission_payments USING btree (client_id);


--
-- Name: idx_commission_payments_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_payments_member ON public.commission_payments USING btree (member_id);


--
-- Name: idx_commission_payments_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_payments_period ON public.commission_payments USING btree (period_start, period_end);


--
-- Name: idx_commission_rules_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_rules_client ON public.commission_rules USING btree (client_id);


--
-- Name: idx_comunidad_channels_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comunidad_channels_client ON public.comunidad_channels USING btree (client_id);


--
-- Name: idx_comunidad_messages_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comunidad_messages_channel ON public.comunidad_messages USING btree (channel_id);


--
-- Name: idx_comunidad_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comunidad_messages_created ON public.comunidad_messages USING btree (created_at DESC);


--
-- Name: idx_console_api_keys_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_console_api_keys_client ON public.console_api_keys USING btree (client_id);


--
-- Name: idx_console_api_keys_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_console_api_keys_hash ON public.console_api_keys USING btree (key_hash);


--
-- Name: idx_copies_guiones_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_guiones_cat ON public.copies_guiones USING btree (client_id, category);


--
-- Name: idx_copies_guiones_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_guiones_client ON public.copies_guiones USING btree (client_id);


--
-- Name: idx_crm_activities_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_client ON public.crm_activities USING btree (client_id);


--
-- Name: idx_crm_activities_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_contact ON public.crm_activities USING btree (contact_id);


--
-- Name: idx_crm_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_type ON public.crm_activities USING btree (type);


--
-- Name: idx_crm_contacts_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_assigned ON public.crm_contacts USING btree (assigned_to);


--
-- Name: idx_crm_contacts_assigned_closer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_assigned_closer ON public.crm_contacts USING btree (assigned_closer);


--
-- Name: idx_crm_contacts_assigned_cold_caller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_assigned_cold_caller ON public.crm_contacts USING btree (assigned_cold_caller);


--
-- Name: idx_crm_contacts_assigned_setter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_assigned_setter ON public.crm_contacts USING btree (assigned_setter);


--
-- Name: idx_crm_contacts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_client ON public.crm_contacts USING btree (client_id);


--
-- Name: idx_crm_contacts_close_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_contacts_close_lead ON public.crm_contacts USING btree (close_lead_id) WHERE (close_lead_id IS NOT NULL);


--
-- Name: idx_crm_contacts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_email ON public.crm_contacts USING btree (email);


--
-- Name: idx_crm_contacts_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_pipeline_stage ON public.crm_contacts USING btree (pipeline_id, stage_key);


--
-- Name: idx_crm_contacts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_status ON public.crm_contacts USING btree (status);


--
-- Name: idx_crm_custom_fields_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_custom_fields_client ON public.crm_custom_fields USING btree (client_id);


--
-- Name: idx_crm_enrollments_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_enrollments_client ON public.crm_sequence_enrollments USING btree (client_id);


--
-- Name: idx_crm_enrollments_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_enrollments_contact ON public.crm_sequence_enrollments USING btree (contact_id);


--
-- Name: idx_crm_enrollments_next_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_enrollments_next_action ON public.crm_sequence_enrollments USING btree (next_action_at) WHERE (status = 'active'::text);


--
-- Name: idx_crm_enrollments_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_enrollments_sequence ON public.crm_sequence_enrollments USING btree (sequence_id);


--
-- Name: idx_crm_files_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_files_client ON public.crm_files USING btree (client_id);


--
-- Name: idx_crm_files_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_files_contact ON public.crm_files USING btree (contact_id);


--
-- Name: idx_crm_pipelines_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_pipelines_client ON public.crm_pipelines USING btree (client_id);


--
-- Name: idx_crm_pipelines_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_pipelines_operator ON public.crm_pipelines USING btree (operator_id);


--
-- Name: idx_crm_sequences_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_sequences_client ON public.crm_sequences USING btree (client_id);


--
-- Name: idx_crm_sequences_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_sequences_pipeline ON public.crm_sequences USING btree (pipeline_id, stage_key);


--
-- Name: idx_crm_smart_views_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_smart_views_client ON public.crm_smart_views USING btree (client_id);


--
-- Name: idx_crm_smart_views_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_smart_views_pipeline ON public.crm_smart_views USING btree (pipeline_id);


--
-- Name: idx_crm_tasks_archive_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_archive_assigned ON public.crm_tasks_archive USING btree (client_id, assigned_to);


--
-- Name: idx_crm_tasks_archive_client_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_archive_client_week ON public.crm_tasks_archive USING btree (client_id, archive_week DESC);


--
-- Name: idx_crm_tasks_archive_sprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_archive_sprint ON public.crm_tasks_archive USING btree (sprint_id) WHERE (sprint_id IS NOT NULL);


--
-- Name: idx_crm_tasks_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_category ON public.crm_tasks USING btree (category);


--
-- Name: idx_crm_tasks_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_client ON public.crm_tasks USING btree (client_id);


--
-- Name: idx_crm_tasks_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_contact ON public.crm_tasks USING btree (contact_id);


--
-- Name: idx_crm_tasks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_due ON public.crm_tasks USING btree (due_date);


--
-- Name: idx_crm_tasks_roadmap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_roadmap ON public.crm_tasks USING btree (roadmap_id);


--
-- Name: idx_crm_tasks_sprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_sprint ON public.crm_tasks USING btree (sprint_id) WHERE (sprint_id IS NOT NULL);


--
-- Name: idx_crm_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_status ON public.crm_tasks USING btree (status);


--
-- Name: idx_demo_signup_attempts_ip_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_signup_attempts_ip_time ON public.demo_signup_attempts USING btree (ip, created_at DESC);


--
-- Name: idx_events_client_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_client_time ON public.events USING btree (client_id, occurred_at DESC);


--
-- Name: idx_events_name_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_name_time ON public.events USING btree (event_name, occurred_at DESC);


--
-- Name: idx_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_session ON public.events USING btree (session_id);


--
-- Name: idx_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_user ON public.events USING btree (user_id, occurred_at DESC);


--
-- Name: idx_events_utm_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_utm_campaign ON public.events USING btree (utm_campaign) WHERE (utm_campaign IS NOT NULL);


--
-- Name: idx_feedback_form_config_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_form_config_active ON public.feedback_form_config USING btree (is_active, version DESC);


--
-- Name: idx_fireflies_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fireflies_client ON public.fireflies_transcripts USING btree (client_id);


--
-- Name: idx_fireflies_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fireflies_contact ON public.fireflies_transcripts USING btree (contact_id);


--
-- Name: idx_fireflies_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fireflies_date ON public.fireflies_transcripts USING btree (date DESC);


--
-- Name: idx_formacion_cursos_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_formacion_cursos_client ON public.formacion_cursos USING btree (client_id);


--
-- Name: idx_formacion_videos_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_formacion_videos_client ON public.formacion_videos USING btree (client_id);


--
-- Name: idx_formacion_videos_curso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_formacion_videos_curso ON public.formacion_videos USING btree (curso_id);


--
-- Name: idx_info_producto_assets_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_info_producto_assets_ip ON public.info_producto_assets USING btree (info_producto_id);


--
-- Name: idx_info_producto_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_info_producto_assets_type ON public.info_producto_assets USING btree (type);


--
-- Name: idx_info_productos_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_info_productos_client ON public.info_productos USING btree (client_id);


--
-- Name: idx_installment_payments_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installment_payments_plan ON public.installment_payments USING btree (plan_id);


--
-- Name: idx_installment_plans_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installment_plans_client ON public.installment_plans USING btree (client_id);


--
-- Name: idx_installment_plans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installment_plans_status ON public.installment_plans USING btree (status);


--
-- Name: idx_invoices_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id, created_at DESC);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status) WHERE (status = ANY (ARRAY['open'::text, 'failed'::text, 'uncollectible'::text]));


--
-- Name: idx_invoices_stripe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_stripe ON public.invoices USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);


--
-- Name: idx_invoices_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_subscription ON public.invoices USING btree (subscription_id);


--
-- Name: idx_ip_anns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_anns_tenant ON public.infoproducto_announcements USING btree (tenant_slug, published, pinned DESC, created_at DESC);


--
-- Name: idx_ip_groups_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_groups_tenant ON public.infoproducto_groups USING btree (tenant_slug, is_public);


--
-- Name: idx_ip_photos_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_photos_tenant ON public.infoproducto_photos USING btree (tenant_slug, created_at DESC);


--
-- Name: idx_ip_posts_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_posts_group ON public.infoproducto_group_posts USING btree (group_id, created_at DESC);


--
-- Name: idx_ip_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_sessions_token ON public.infoproducto_sessions USING btree (token) WHERE (revoked_at IS NULL);


--
-- Name: idx_ip_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_sessions_user ON public.infoproducto_sessions USING btree (user_id);


--
-- Name: idx_ip_steps_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_steps_ip ON public.info_producto_process_steps USING btree (info_producto_id);


--
-- Name: idx_ip_steps_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_steps_phase ON public.info_producto_process_steps USING btree (info_producto_id, phase_key);


--
-- Name: idx_ip_templates_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_templates_client ON public.info_producto_process_templates USING btree (client_id);


--
-- Name: idx_ip_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_users_tenant ON public.infoproducto_users USING btree (tenant_slug);


--
-- Name: idx_legal_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_documents_category ON public.legal_documents USING btree (client_id, category);


--
-- Name: idx_legal_documents_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_documents_client ON public.legal_documents USING btree (client_id);


--
-- Name: idx_legal_documents_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_documents_created ON public.legal_documents USING btree (client_id, created_at DESC);


--
-- Name: idx_li_daily_client_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_daily_client_date ON public.linkedin_daily_reports USING btree (client_id, date DESC);


--
-- Name: idx_li_posts_client_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_posts_client_date ON public.linkedin_posts USING btree (client_id, date DESC);


--
-- Name: idx_logistics_orders_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_orders_client ON public.logistics_orders USING btree (client_id);


--
-- Name: idx_logistics_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_orders_created ON public.logistics_orders USING btree (created_at DESC);


--
-- Name: idx_logistics_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_orders_status ON public.logistics_orders USING btree (status);


--
-- Name: idx_logistics_quotes_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_quotes_client ON public.logistics_quotes USING btree (client_id);


--
-- Name: idx_lph_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lph_category ON public.logistics_pricing_history USING btree (product_category);


--
-- Name: idx_lph_method_dest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lph_method_dest ON public.logistics_pricing_history USING btree (shipping_method, destination_country);


--
-- Name: idx_manychat_config_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manychat_config_client ON public.manychat_config USING btree (client_id);


--
-- Name: idx_mid_gate_submissions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mid_gate_submissions_email ON public.mid_gate_submissions USING btree (tenant_slug, lower(email));


--
-- Name: idx_mid_gate_submissions_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mid_gate_submissions_tenant_created ON public.mid_gate_submissions USING btree (tenant_slug, created_at DESC);


--
-- Name: idx_mid_lesson_grants_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mid_lesson_grants_lesson ON public.mid_lesson_grants USING btree (lesson_id);


--
-- Name: idx_mid_lesson_grants_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mid_lesson_grants_tenant ON public.mid_lesson_grants USING btree (tenant_slug, user_id);


--
-- Name: idx_n8n_config_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n8n_config_client_id ON public.n8n_config USING btree (client_id);


--
-- Name: idx_notif_member_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_member_recent ON public.notifications USING btree (member_id, created_at DESC);


--
-- Name: idx_notif_member_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_member_unread ON public.notifications USING btree (member_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: idx_operations_links_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operations_links_category ON public.operations_links USING btree (client_id, category);


--
-- Name: idx_operations_links_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operations_links_client ON public.operations_links USING btree (client_id, created_at DESC);


--
-- Name: idx_ops_ticket_events_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_ticket_events_ticket ON public.ops_ticket_events USING btree (ticket_id, created_at DESC);


--
-- Name: idx_ops_ticket_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_ticket_events_type ON public.ops_ticket_events USING btree (event_type, created_at DESC);


--
-- Name: idx_ops_ticket_messages_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_ticket_messages_ticket ON public.ops_ticket_messages USING btree (ticket_id, created_at DESC);


--
-- Name: idx_ops_ticket_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_ticket_messages_unread ON public.ops_ticket_messages USING btree (ticket_id) WHERE (read_by_recipient = false);


--
-- Name: idx_ops_tickets_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_assigned ON public.ops_tickets USING btree (assigned_to_email) WHERE (assigned_to_email IS NOT NULL);


--
-- Name: idx_ops_tickets_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_client_id ON public.ops_tickets USING btree (client_id);


--
-- Name: idx_ops_tickets_done_marked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_done_marked ON public.ops_tickets USING btree (done_marked_at) WHERE (done_marked_at IS NOT NULL);


--
-- Name: idx_ops_tickets_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_last_message ON public.ops_tickets USING btree (last_message_at DESC NULLS LAST);


--
-- Name: idx_ops_tickets_opened_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_opened_by ON public.ops_tickets USING btree (opened_by_email);


--
-- Name: idx_ops_tickets_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_priority ON public.ops_tickets USING btree (priority);


--
-- Name: idx_ops_tickets_sla_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_sla_due ON public.ops_tickets USING btree (sla_due_at);


--
-- Name: idx_ops_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_status ON public.ops_tickets USING btree (status);


--
-- Name: idx_ops_tickets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_tickets_type ON public.ops_tickets USING btree (type);


--
-- Name: idx_orbe_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orbe_messages_thread ON public.orbe_messages USING btree (client_id, member_key, created_at);


--
-- Name: idx_payment_fees_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_fees_client_id ON public.payment_fees USING btree (client_id);


--
-- Name: idx_payment_links_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_active ON public.payment_links USING btree (client_id, active);


--
-- Name: idx_payment_links_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_client ON public.payment_links USING btree (client_id);


--
-- Name: idx_payment_links_stripe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_stripe_id ON public.payment_links USING btree (stripe_payment_link_id);


--
-- Name: idx_products_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_client_id ON public.products USING btree (client_id);


--
-- Name: idx_products_stripe_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_stripe_price ON public.products USING btree (stripe_price_id) WHERE (stripe_price_id IS NOT NULL);


--
-- Name: idx_projections_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_client_id ON public.projections USING btree (client_id);


--
-- Name: idx_projections_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_member_id ON public.projections USING btree (member_id);


--
-- Name: idx_projections_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_period ON public.projections USING btree (period);


--
-- Name: idx_projections_period_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_period_type ON public.projections USING btree (period_type);


--
-- Name: idx_projections_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_type ON public.projections USING btree (type);


--
-- Name: idx_recall_calls_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recall_calls_client ON public.recall_calls USING btree (client_id, scheduled_at DESC);


--
-- Name: idx_recall_calls_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recall_calls_contact ON public.recall_calls USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: idx_recall_calls_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recall_calls_member ON public.recall_calls USING btree (member_id, scheduled_at DESC) WHERE (member_id IS NOT NULL);


--
-- Name: idx_recall_calls_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recall_calls_status ON public.recall_calls USING btree (client_id, status);


--
-- Name: idx_reports_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_client_id ON public.reports USING btree (client_id);


--
-- Name: idx_reports_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_date ON public.reports USING btree (date);


--
-- Name: idx_reports_date_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_date_role ON public.reports USING btree (date, role);


--
-- Name: idx_reports_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_name ON public.reports USING btree (name);


--
-- Name: idx_reports_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_role ON public.reports USING btree (role);


--
-- Name: idx_roadmap_objectives_roadmap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roadmap_objectives_roadmap ON public.roadmap_objectives USING btree (roadmap_id);


--
-- Name: idx_roadmaps_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roadmaps_client ON public.roadmaps USING btree (client_id);


--
-- Name: idx_roadmaps_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roadmaps_month ON public.roadmaps USING btree (month);


--
-- Name: idx_sales_attachments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_attachments ON public.sales USING gin (attachments);


--
-- Name: idx_sales_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_client_id ON public.sales USING btree (client_id);


--
-- Name: idx_sales_close_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_close_activity_id ON public.sales USING btree (close_activity_id);


--
-- Name: idx_sales_closer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_closer ON public.sales USING btree (closer);


--
-- Name: idx_sales_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_date ON public.sales USING btree (date);


--
-- Name: idx_sales_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_operator ON public.sales USING btree (operator_id);


--
-- Name: idx_sales_setter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_setter ON public.sales USING btree (setter);


--
-- Name: idx_sales_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_source ON public.sales USING btree (source);


--
-- Name: idx_sales_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_status ON public.sales USING btree (status);


--
-- Name: idx_sales_utm_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_utm_source ON public.sales USING btree (utm_source);


--
-- Name: idx_store_clients_email_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_store_clients_email_client ON public.store_clients USING btree (client_id, email);


--
-- Name: idx_subscriptions_churned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_churned ON public.subscriptions USING btree (churned_at) WHERE (churned_at IS NOT NULL);


--
-- Name: idx_subscriptions_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_client ON public.subscriptions USING btree (client_id);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status) WHERE (status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text]));


--
-- Name: idx_subscriptions_stripe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_stripe ON public.subscriptions USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: idx_superadmins_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superadmins_email ON public.superadmins USING btree (email);


--
-- Name: idx_support_messages_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket_id ON public.support_messages USING btree (ticket_id, created_at DESC);


--
-- Name: idx_support_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_unread ON public.support_messages USING btree (ticket_id) WHERE (read_by_recipient = false);


--
-- Name: idx_support_tickets_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_assigned ON public.support_tickets USING btree (assigned_to_email) WHERE (assigned_to_email IS NOT NULL);


--
-- Name: idx_support_tickets_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_client_id ON public.support_tickets USING btree (client_id);


--
-- Name: idx_support_tickets_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_last_message ON public.support_tickets USING btree (last_message_at DESC NULLS LAST);


--
-- Name: idx_support_tickets_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_priority ON public.support_tickets USING btree (priority);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_task_messages_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_messages_client ON public.task_messages USING btree (client_id);


--
-- Name: idx_task_messages_task_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_messages_task_created ON public.task_messages USING btree (task_id, created_at);


--
-- Name: idx_task_sprints_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_sprints_client ON public.task_sprints USING btree (client_id);


--
-- Name: idx_task_sprints_client_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_sprints_client_status ON public.task_sprints USING btree (client_id, status);


--
-- Name: idx_team_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_active ON public.team USING btree (active);


--
-- Name: idx_team_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_client_id ON public.team USING btree (client_id);


--
-- Name: idx_team_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_email ON public.team USING btree (email);


--
-- Name: idx_team_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_operator ON public.team USING btree (operator_id);


--
-- Name: idx_team_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_role ON public.team USING btree (role);


--
-- Name: idx_tenant_invitations_client_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_invitations_client_status ON public.tenant_invitations USING btree (client_id, status);


--
-- Name: idx_tenant_invitations_one_pending_per_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tenant_invitations_one_pending_per_email ON public.tenant_invitations USING btree (client_id, email) WHERE (status = 'pending'::text);


--
-- Name: idx_tenant_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_invitations_token ON public.tenant_invitations USING btree (token);


--
-- Name: idx_user_onboarding_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_onboarding_client ON public.user_onboarding_answers USING btree (client_id);


--
-- Name: idx_wa_api_accounts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_api_accounts_client ON public.whatsapp_api_accounts USING btree (client_id);


--
-- Name: idx_wa_api_accounts_phone_number_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wa_api_accounts_phone_number_id ON public.whatsapp_api_accounts USING btree (phone_number_id);


--
-- Name: idx_webhook_dlq_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_dlq_pending ON public.webhook_dlq USING btree (created_at DESC) WHERE (resolved = false);


--
-- Name: idx_webhook_dlq_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_dlq_provider ON public.webhook_dlq USING btree (provider, created_at DESC);


--
-- Name: idx_webhook_events_provider_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_provider_time ON public.webhook_events USING btree (provider, processed_at DESC);


--
-- Name: idx_weekly_feedback_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_feedback_client ON public.weekly_feedback_responses USING btree (client_slug, created_at DESC);


--
-- Name: idx_weekly_feedback_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_feedback_created ON public.weekly_feedback_responses USING btree (created_at DESC);


--
-- Name: idx_weekly_feedback_summaries_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_feedback_summaries_created ON public.weekly_feedback_summaries USING btree (created_at DESC);


--
-- Name: idx_weekly_feedback_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_feedback_user ON public.weekly_feedback_responses USING btree (user_email, created_at DESC);


--
-- Name: idx_wf_run_steps_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_run_steps_run ON public.workflow_run_steps USING btree (run_id);


--
-- Name: idx_wf_webhook_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_webhook_key ON public.workflow_webhook_triggers USING btree (webhook_key);


--
-- Name: idx_whatsapp_config_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_config_client ON public.whatsapp_config USING btree (client_id);


--
-- Name: idx_whatsapp_config_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_config_operator ON public.whatsapp_config USING btree (operator_id) WHERE (operator_id IS NOT NULL);


--
-- Name: idx_workflow_delayed_resume; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_delayed_resume ON public.workflow_delayed_steps USING btree (resume_at) WHERE (resumed_at IS NULL);


--
-- Name: idx_workflow_run_steps_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_run_steps_run_id ON public.workflow_run_steps USING btree (run_id, started_at);


--
-- Name: idx_workflow_runs_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_client ON public.workflow_runs USING btree (client_id, created_at DESC);


--
-- Name: idx_workflow_runs_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_client_id ON public.workflow_runs USING btree (client_id, started_at DESC);


--
-- Name: idx_workflow_runs_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_contact ON public.workflow_runs USING btree (contact_id);


--
-- Name: idx_workflow_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_status ON public.workflow_runs USING btree (status) WHERE (status = ANY (ARRAY['running'::text, 'waiting'::text]));


--
-- Name: idx_workflow_runs_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_workflow ON public.workflow_runs USING btree (workflow_id, status);


--
-- Name: idx_workflow_runs_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs USING btree (workflow_id);


--
-- Name: idx_workflows_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_client ON public.workflows USING btree (client_id);


--
-- Name: idx_workflows_client_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_client_trigger ON public.workflows USING btree (client_id, trigger) WHERE enabled;


--
-- Name: infoproducto_about_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infoproducto_about_tenant_idx ON public.infoproducto_about USING btree (tenant_slug, "position");


--
-- Name: infoproducto_users_points_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infoproducto_users_points_idx ON public.infoproducto_users USING btree (tenant_slug, points DESC);


--
-- Name: mid_channels_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_channels_tenant_idx ON public.mid_channels USING btree (tenant_slug, active, "position");


--
-- Name: mid_community_members_community_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_community_members_community_idx ON public.mid_community_members USING btree (community_id);


--
-- Name: mid_community_members_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_community_members_tenant_idx ON public.mid_community_members USING btree (tenant_slug, user_id);


--
-- Name: mid_events_gated_route_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_events_gated_route_idx ON public.mid_events USING btree (gated_route_id);


--
-- Name: mid_events_tenant_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_events_tenant_start_idx ON public.mid_events USING btree (tenant_slug, start_at);


--
-- Name: mid_lesson_progress_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_lesson_progress_lesson_idx ON public.mid_lesson_progress USING btree (lesson_id);


--
-- Name: mid_lesson_progress_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_lesson_progress_tenant_user_idx ON public.mid_lesson_progress USING btree (tenant_slug, user_id);


--
-- Name: mid_messages_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_messages_channel_idx ON public.mid_messages USING btree (channel_id, deleted_at, created_at DESC);


--
-- Name: mid_messages_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_messages_tenant_idx ON public.mid_messages USING btree (tenant_slug, created_at DESC);


--
-- Name: mid_posts_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_posts_tenant_idx ON public.mid_posts USING btree (tenant_slug, deleted_at, created_at DESC);


--
-- Name: mid_posts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_posts_user_idx ON public.mid_posts USING btree (user_id, created_at DESC);


--
-- Name: mid_route_subs_route_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_route_subs_route_idx ON public.mid_route_subscriptions USING btree (route_id);


--
-- Name: mid_route_subs_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_route_subs_tenant_user_idx ON public.mid_route_subscriptions USING btree (tenant_slug, user_id);


--
-- Name: mid_support_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_support_messages_thread_idx ON public.mid_support_messages USING btree (thread_id, created_at);


--
-- Name: mid_support_threads_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mid_support_threads_tenant_idx ON public.mid_support_threads USING btree (tenant_slug, status, last_message_at DESC);


--
-- Name: onboarding_keys_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_keys_state_idx ON public.onboarding_keys USING btree (used_at, revoked_at, expires_at);


--
-- Name: sales_sale_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_sale_type_idx ON public.sales USING btree (client_id, sale_type);


--
-- Name: task_pipelines_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_pipelines_client_idx ON public.task_pipelines USING btree (client_id);


--
-- Name: task_stages_pipeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_stages_pipeline_idx ON public.task_stages USING btree (pipeline_id);


--
-- Name: uq_ip_users_tenant_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ip_users_tenant_email_lower ON public.infoproducto_users USING btree (tenant_slug, lower(email));


--
-- Name: user_integrations_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_integrations_member_idx ON public.user_integrations USING btree (client_id, member_id);


--
-- Name: user_integrations_member_service_acc_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_integrations_member_service_acc_key ON public.user_integrations USING btree (client_id, member_id, service, account_index);


--
-- Name: user_integrations_service_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_integrations_service_idx ON public.user_integrations USING btree (client_id, service, enabled);


--
-- Name: whatsapp_config_client_account_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_config_client_account_uidx ON public.whatsapp_config USING btree (client_id, account_index);


--
-- Name: apex_leads apex_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER apex_leads_updated_at BEFORE UPDATE ON public.apex_leads FOR EACH ROW EXECUTE FUNCTION public.apex_leads_set_updated_at();


--
-- Name: apex_newsletter_posts apex_newsletter_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER apex_newsletter_posts_updated_at BEFORE UPDATE ON public.apex_newsletter_posts FOR EACH ROW EXECUTE FUNCTION public.apex_newsletter_posts_set_updated_at();


--
-- Name: apex_state apex_state_touch_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER apex_state_touch_trg BEFORE UPDATE ON public.apex_state FOR EACH ROW EXECUTE FUNCTION public.apex_state_touch();


--
-- Name: asesoriasuiza_job_offers asj_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER asj_touch BEFORE UPDATE ON public.asesoriasuiza_job_offers FOR EACH ROW EXECUTE FUNCTION public.asesoriasuiza_job_offers_touch();


--
-- Name: booking_hosts booking_hosts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER booking_hosts_updated_at BEFORE UPDATE ON public.booking_hosts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: booking_routing_forms booking_routing_forms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER booking_routing_forms_updated_at BEFORE UPDATE ON public.booking_routing_forms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bookings bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: legal_documents legal_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER legal_documents_updated_at BEFORE UPDATE ON public.legal_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: operations_links operations_links_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operations_links_updated_at BEFORE UPDATE ON public.operations_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: agent_learnings trg_agent_learnings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_learnings_updated_at BEFORE UPDATE ON public.agent_learnings FOR EACH ROW EXECUTE FUNCTION public.update_agent_learnings_timestamp();


--
-- Name: crm_contacts trg_auto_logistics_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_logistics_order AFTER UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.auto_create_logistics_order();


--
-- Name: commission_rules trg_commission_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_commission_rules_updated_at BEFORE UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.commission_rules_set_updated_at();


--
-- Name: invoices trg_invoices_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: logistics_orders trg_log_pricing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_pricing AFTER UPDATE ON public.logistics_orders FOR EACH ROW EXECUTE FUNCTION public.log_pricing_history();


--
-- Name: logistics_orders trg_logistics_order_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_logistics_order_number BEFORE INSERT ON public.logistics_orders FOR EACH ROW WHEN ((new.order_number IS NULL)) EXECUTE FUNCTION public.generate_logistics_order_number();


--
-- Name: logistics_orders trg_logistics_shares; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_logistics_shares BEFORE INSERT OR UPDATE ON public.logistics_orders FOR EACH ROW EXECUTE FUNCTION public.compute_logistics_shares();


--
-- Name: crm_tasks trg_notify_task_assigned; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_task_assigned AFTER INSERT OR UPDATE OF assigned_to ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();


--
-- Name: ops_tickets trg_notify_ticket_assigned; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_ticket_assigned AFTER INSERT OR UPDATE OF assigned_to_email ON public.ops_tickets FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_assigned();


--
-- Name: ops_ticket_messages trg_ops_ticket_messages_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_ticket_messages_touch AFTER INSERT ON public.ops_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.ops_ticket_messages_touch_ticket();


--
-- Name: ops_tickets trg_ops_tickets_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_tickets_audit AFTER INSERT OR UPDATE ON public.ops_tickets FOR EACH ROW EXECUTE FUNCTION public.ops_tickets_audit();


--
-- Name: ops_tickets trg_ops_tickets_done_msg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_tickets_done_msg AFTER UPDATE ON public.ops_tickets FOR EACH ROW EXECUTE FUNCTION public.ops_tickets_done_system_message();


--
-- Name: ops_tickets trg_ops_tickets_sla; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_tickets_sla BEFORE INSERT OR UPDATE ON public.ops_tickets FOR EACH ROW EXECUTE FUNCTION public.ops_tickets_compute_sla();


--
-- Name: ops_tickets trg_ops_tickets_status_ts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_tickets_status_ts BEFORE UPDATE ON public.ops_tickets FOR EACH ROW EXECUTE FUNCTION public.ops_tickets_status_timestamps();


--
-- Name: ops_tickets trg_ops_tickets_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_tickets_touch BEFORE UPDATE ON public.ops_tickets FOR EACH ROW EXECUTE FUNCTION public.ops_tickets_touch_updated_at();


--
-- Name: subscription_plans trg_plans_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: recall_calls trg_recall_calls_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recall_calls_updated_at BEFORE UPDATE ON public.recall_calls FOR EACH ROW EXECUTE FUNCTION public.update_recall_calls_timestamp();


--
-- Name: subscriptions trg_subscriptions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: support_messages trg_support_messages_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_support_messages_touch AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.support_messages_touch_ticket();


--
-- Name: support_tickets trg_support_tickets_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_support_tickets_touch BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch_updated_at();


--
-- Name: crm_tasks trg_sync_task_status_from_stage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_task_status_from_stage BEFORE INSERT OR UPDATE OF stage_id ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.sync_task_status_from_stage();


--
-- Name: tenant_invitations trg_tenant_invitations_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_invitations_touch BEFORE UPDATE ON public.tenant_invitations FOR EACH ROW EXECUTE FUNCTION public.tenant_invitations_touch_updated_at();


--
-- Name: user_integrations trg_user_integrations_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_integrations_updated BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_api_accounts trg_wa_api_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wa_api_accounts_updated_at BEFORE UPDATE ON public.whatsapp_api_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_whatsapp_api_accounts();


--
-- Name: agent_conversations agent_conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_conversations
    ADD CONSTRAINT agent_conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: agent_conversations agent_conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_conversations
    ADD CONSTRAINT agent_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: agent_decisions agent_decisions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_decisions
    ADD CONSTRAINT agent_decisions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: agent_feedback agent_feedback_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback
    ADD CONSTRAINT agent_feedback_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.agent_decisions(id) ON DELETE CASCADE;


--
-- Name: agent_learnings agent_learnings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_learnings
    ADD CONSTRAINT agent_learnings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: agent_messages agent_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.agent_conversations(id) ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: apex_newsletter_sends apex_newsletter_sends_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apex_newsletter_sends
    ADD CONSTRAINT apex_newsletter_sends_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.apex_newsletter_posts(id) ON DELETE CASCADE;


--
-- Name: asesoriasuiza_establecimiento_submissions asesoriasuiza_establecimiento_submissions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_establecimiento_submissions
    ADD CONSTRAINT asesoriasuiza_establecimiento_submissions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: asesoriasuiza_webinar_call_intake asesoriasuiza_webinar_call_intake_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_webinar_call_intake
    ADD CONSTRAINT asesoriasuiza_webinar_call_intake_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: asesoriasuiza_webinar_call_intake asesoriasuiza_webinar_call_intake_signup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_webinar_call_intake
    ADD CONSTRAINT asesoriasuiza_webinar_call_intake_signup_id_fkey FOREIGN KEY (signup_id) REFERENCES public.asesoriasuiza_webinar_signups(id) ON DELETE SET NULL;


--
-- Name: asesoriasuiza_webinar_signups asesoriasuiza_webinar_signups_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asesoriasuiza_webinar_signups
    ADD CONSTRAINT asesoriasuiza_webinar_signups_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: auth_sessions auth_sessions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: auth_sessions auth_sessions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: booking_hosts booking_hosts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_hosts
    ADD CONSTRAINT booking_hosts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: booking_hosts booking_hosts_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_hosts
    ADD CONSTRAINT booking_hosts_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.client_operators(id) ON DELETE SET NULL;


--
-- Name: booking_reminders booking_reminders_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_reminders booking_reminders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_reminders
    ADD CONSTRAINT booking_reminders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: booking_routing_forms booking_routing_forms_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_forms
    ADD CONSTRAINT booking_routing_forms_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: booking_routing_responses booking_routing_responses_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_responses
    ADD CONSTRAINT booking_routing_responses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: booking_routing_responses booking_routing_responses_crm_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_responses
    ADD CONSTRAINT booking_routing_responses_crm_contact_id_fkey FOREIGN KEY (crm_contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: booking_routing_responses booking_routing_responses_routing_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_routing_responses
    ADD CONSTRAINT booking_routing_responses_routing_form_id_fkey FOREIGN KEY (routing_form_id) REFERENCES public.booking_routing_forms(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_crm_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_crm_contact_id_fkey FOREIGN KEY (crm_contact_id) REFERENCES public.crm_contacts(id);


--
-- Name: bulk_send_jobs bulk_send_jobs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_send_jobs
    ADD CONSTRAINT bulk_send_jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: bulk_send_jobs bulk_send_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_send_jobs
    ADD CONSTRAINT bulk_send_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team(id) ON DELETE SET NULL;


--
-- Name: bulk_send_recipients bulk_send_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_send_recipients
    ADD CONSTRAINT bulk_send_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: bulk_send_recipients bulk_send_recipients_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_send_recipients
    ADD CONSTRAINT bulk_send_recipients_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.bulk_send_jobs(id) ON DELETE CASCADE;


--
-- Name: bw_client_deliverables bw_client_deliverables_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_client_deliverables
    ADD CONSTRAINT bw_client_deliverables_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.bw_client_projects(id) ON DELETE CASCADE;


--
-- Name: bw_client_projects bw_client_projects_target_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_client_projects
    ADD CONSTRAINT bw_client_projects_target_client_id_fkey FOREIGN KEY (target_client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: bw_contracts bw_contracts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_contracts
    ADD CONSTRAINT bw_contracts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.bw_client_projects(id) ON DELETE CASCADE;


--
-- Name: bw_onboarding_steps bw_onboarding_steps_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_onboarding_steps
    ADD CONSTRAINT bw_onboarding_steps_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.bw_client_projects(id) ON DELETE CASCADE;


--
-- Name: bw_support_tickets bw_support_tickets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_support_tickets
    ADD CONSTRAINT bw_support_tickets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.bw_client_projects(id) ON DELETE CASCADE;


--
-- Name: bw_ticket_messages bw_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bw_ticket_messages
    ADD CONSTRAINT bw_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.bw_support_tickets(id) ON DELETE CASCADE;


--
-- Name: calendly_auth calendly_auth_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendly_auth
    ADD CONSTRAINT calendly_auth_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: ceo_daily_digests ceo_daily_digests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_daily_digests
    ADD CONSTRAINT ceo_daily_digests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_finance_entries ceo_finance_entries_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_finance_entries
    ADD CONSTRAINT ceo_finance_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_ideas ceo_ideas_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_ideas
    ADD CONSTRAINT ceo_ideas_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_ideas ceo_ideas_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_ideas
    ADD CONSTRAINT ceo_ideas_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.ceo_meetings(id) ON DELETE SET NULL;


--
-- Name: ceo_ideas ceo_ideas_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_ideas
    ADD CONSTRAINT ceo_ideas_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.ceo_projects(id) ON DELETE SET NULL;


--
-- Name: ceo_integrations ceo_integrations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_integrations
    ADD CONSTRAINT ceo_integrations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_meetings ceo_meetings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_meetings
    ADD CONSTRAINT ceo_meetings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_projects ceo_projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_projects
    ADD CONSTRAINT ceo_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_team_notes ceo_team_notes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_team_notes
    ADD CONSTRAINT ceo_team_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: ceo_weekly_digests ceo_weekly_digests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceo_weekly_digests
    ADD CONSTRAINT ceo_weekly_digests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: chat_conversations chat_conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.chat_contacts(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chat_flows(id);


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chatbot_configs chatbot_configs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_configs
    ADD CONSTRAINT chatbot_configs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: chatbot_knowledge chatbot_knowledge_chatbot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_knowledge
    ADD CONSTRAINT chatbot_knowledge_chatbot_id_fkey FOREIGN KEY (chatbot_id) REFERENCES public.chatbot_configs(id) ON DELETE CASCADE;


--
-- Name: chatbot_knowledge chatbot_knowledge_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_knowledge
    ADD CONSTRAINT chatbot_knowledge_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_operators client_operators_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_operators
    ADD CONSTRAINT client_operators_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: close_sync_log close_sync_log_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_sync_log
    ADD CONSTRAINT close_sync_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: commission_payments commission_payments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payments
    ADD CONSTRAINT commission_payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: commission_payments commission_payments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payments
    ADD CONSTRAINT commission_payments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: commission_rules commission_rules_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: comunidad_channels comunidad_channels_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunidad_channels
    ADD CONSTRAINT comunidad_channels_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: comunidad_messages comunidad_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunidad_messages
    ADD CONSTRAINT comunidad_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.comunidad_channels(id) ON DELETE CASCADE;


--
-- Name: comunidad_messages comunidad_messages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunidad_messages
    ADD CONSTRAINT comunidad_messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: console_api_keys console_api_keys_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.console_api_keys
    ADD CONSTRAINT console_api_keys_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_contacts crm_contacts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_contacts crm_contacts_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;


--
-- Name: crm_custom_fields crm_custom_fields_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_custom_fields
    ADD CONSTRAINT crm_custom_fields_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_files crm_files_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_files
    ADD CONSTRAINT crm_files_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_files crm_files_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_files
    ADD CONSTRAINT crm_files_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_pipelines crm_pipelines_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipelines
    ADD CONSTRAINT crm_pipelines_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_pipelines crm_pipelines_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipelines
    ADD CONSTRAINT crm_pipelines_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.client_operators(id) ON DELETE SET NULL;


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequence_enrollments
    ADD CONSTRAINT crm_sequence_enrollments_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.crm_sequences(id) ON DELETE CASCADE;


--
-- Name: crm_sequences crm_sequences_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequences
    ADD CONSTRAINT crm_sequences_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_sequences crm_sequences_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sequences
    ADD CONSTRAINT crm_sequences_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;


--
-- Name: crm_smart_views crm_smart_views_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_smart_views
    ADD CONSTRAINT crm_smart_views_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_smart_views crm_smart_views_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_smart_views
    ADD CONSTRAINT crm_smart_views_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;


--
-- Name: crm_tasks_archive crm_tasks_archive_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks_archive
    ADD CONSTRAINT crm_tasks_archive_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.task_pipelines(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_roadmap_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_roadmap_id_fkey FOREIGN KEY (roadmap_id) REFERENCES public.roadmaps(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_sprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES public.task_sprints(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.task_stages(id) ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.email_lists(id);


--
-- Name: email_campaigns email_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id);


--
-- Name: email_subscribers email_subscribers_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_subscribers
    ADD CONSTRAINT email_subscribers_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.email_lists(id) ON DELETE CASCADE;


--
-- Name: events events_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: fireflies_transcripts fireflies_transcripts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fireflies_transcripts
    ADD CONSTRAINT fireflies_transcripts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: fireflies_transcripts fireflies_transcripts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fireflies_transcripts
    ADD CONSTRAINT fireflies_transcripts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: formacion_cursos formacion_cursos_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formacion_cursos
    ADD CONSTRAINT formacion_cursos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: formacion_videos formacion_videos_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formacion_videos
    ADD CONSTRAINT formacion_videos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: formacion_videos formacion_videos_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formacion_videos
    ADD CONSTRAINT formacion_videos_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.formacion_cursos(id) ON DELETE CASCADE;


--
-- Name: info_producto_assets info_producto_assets_info_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_producto_assets
    ADD CONSTRAINT info_producto_assets_info_producto_id_fkey FOREIGN KEY (info_producto_id) REFERENCES public.info_productos(id) ON DELETE CASCADE;


--
-- Name: info_producto_process_steps info_producto_process_steps_info_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_producto_process_steps
    ADD CONSTRAINT info_producto_process_steps_info_producto_id_fkey FOREIGN KEY (info_producto_id) REFERENCES public.info_productos(id) ON DELETE CASCADE;


--
-- Name: info_producto_process_templates info_producto_process_templates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_producto_process_templates
    ADD CONSTRAINT info_producto_process_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: info_productos info_productos_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.info_productos
    ADD CONSTRAINT info_productos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: infoproducto_announcements infoproducto_announcements_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_announcements
    ADD CONSTRAINT infoproducto_announcements_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: infoproducto_group_members infoproducto_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_members
    ADD CONSTRAINT infoproducto_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.infoproducto_groups(id) ON DELETE CASCADE;


--
-- Name: infoproducto_group_members infoproducto_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_members
    ADD CONSTRAINT infoproducto_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: infoproducto_group_posts infoproducto_group_posts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_posts
    ADD CONSTRAINT infoproducto_group_posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.infoproducto_groups(id) ON DELETE CASCADE;


--
-- Name: infoproducto_group_posts infoproducto_group_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_group_posts
    ADD CONSTRAINT infoproducto_group_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: infoproducto_photos infoproducto_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_photos
    ADD CONSTRAINT infoproducto_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: infoproducto_sessions infoproducto_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infoproducto_sessions
    ADD CONSTRAINT infoproducto_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: installment_payments installment_payments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_payments
    ADD CONSTRAINT installment_payments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.installment_plans(id) ON DELETE CASCADE;


--
-- Name: installment_plans installment_plans_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_plans
    ADD CONSTRAINT installment_plans_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: installment_plans installment_plans_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installment_plans
    ADD CONSTRAINT installment_plans_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id);


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: legal_documents legal_documents_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: linkedin_daily_reports linkedin_daily_reports_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_daily_reports
    ADD CONSTRAINT linkedin_daily_reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: linkedin_posts linkedin_posts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_posts
    ADD CONSTRAINT linkedin_posts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: logistics_orders logistics_orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_orders
    ADD CONSTRAINT logistics_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: logistics_pricing_history logistics_pricing_history_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_pricing_history
    ADD CONSTRAINT logistics_pricing_history_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: logistics_pricing_history logistics_pricing_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_pricing_history
    ADD CONSTRAINT logistics_pricing_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.logistics_orders(id) ON DELETE SET NULL;


--
-- Name: logistics_quotes logistics_quotes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_quotes
    ADD CONSTRAINT logistics_quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: logistics_quotes logistics_quotes_converted_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_quotes
    ADD CONSTRAINT logistics_quotes_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.logistics_orders(id) ON DELETE SET NULL;


--
-- Name: manychat_config manychat_config_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manychat_config
    ADD CONSTRAINT manychat_config_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: manychat_config manychat_config_setter_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manychat_config
    ADD CONSTRAINT manychat_config_setter_pipeline_id_fkey FOREIGN KEY (setter_pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;


--
-- Name: mid_community_members mid_community_members_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_community_members
    ADD CONSTRAINT mid_community_members_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.mid_communities(id) ON DELETE CASCADE;


--
-- Name: mid_community_members mid_community_members_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_community_members
    ADD CONSTRAINT mid_community_members_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: mid_community_members mid_community_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_community_members
    ADD CONSTRAINT mid_community_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_events mid_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_events
    ADD CONSTRAINT mid_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: mid_events mid_events_gated_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_events
    ADD CONSTRAINT mid_events_gated_route_id_fkey FOREIGN KEY (gated_route_id) REFERENCES public.training_routes(id) ON DELETE SET NULL;


--
-- Name: mid_events mid_events_recording_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_events
    ADD CONSTRAINT mid_events_recording_lesson_id_fkey FOREIGN KEY (recording_lesson_id) REFERENCES public.training_lessons(id) ON DELETE SET NULL;


--
-- Name: mid_gate_submissions mid_gate_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_gate_submissions
    ADD CONSTRAINT mid_gate_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: mid_lesson_grants mid_lesson_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_grants
    ADD CONSTRAINT mid_lesson_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.infoproducto_users(id) ON DELETE SET NULL;


--
-- Name: mid_lesson_grants mid_lesson_grants_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_grants
    ADD CONSTRAINT mid_lesson_grants_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.training_lessons(id) ON DELETE CASCADE;


--
-- Name: mid_lesson_grants mid_lesson_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_grants
    ADD CONSTRAINT mid_lesson_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_lesson_progress mid_lesson_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_progress
    ADD CONSTRAINT mid_lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.training_lessons(id) ON DELETE CASCADE;


--
-- Name: mid_lesson_progress mid_lesson_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_lesson_progress
    ADD CONSTRAINT mid_lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_messages mid_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_messages
    ADD CONSTRAINT mid_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.mid_channels(id) ON DELETE CASCADE;


--
-- Name: mid_messages mid_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_messages
    ADD CONSTRAINT mid_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_posts mid_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_posts
    ADD CONSTRAINT mid_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_route_subscriptions mid_route_subscriptions_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_route_subscriptions
    ADD CONSTRAINT mid_route_subscriptions_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.training_routes(id) ON DELETE CASCADE;


--
-- Name: mid_route_subscriptions mid_route_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_route_subscriptions
    ADD CONSTRAINT mid_route_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_support_messages mid_support_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_support_messages
    ADD CONSTRAINT mid_support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: mid_support_messages mid_support_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_support_messages
    ADD CONSTRAINT mid_support_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.mid_support_threads(id) ON DELETE CASCADE;


--
-- Name: mid_support_threads mid_support_threads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mid_support_threads
    ADD CONSTRAINT mid_support_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.infoproducto_users(id) ON DELETE CASCADE;


--
-- Name: n8n_config n8n_config_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_config
    ADD CONSTRAINT n8n_config_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: notifications notifications_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: onboarding_keys onboarding_keys_used_by_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_keys
    ADD CONSTRAINT onboarding_keys_used_by_client_id_fkey FOREIGN KEY (used_by_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: operations_links operations_links_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_links
    ADD CONSTRAINT operations_links_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: ops_ticket_events ops_ticket_events_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_events
    ADD CONSTRAINT ops_ticket_events_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.ops_tickets(id) ON DELETE CASCADE;


--
-- Name: ops_ticket_messages ops_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_messages
    ADD CONSTRAINT ops_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.ops_tickets(id) ON DELETE CASCADE;


--
-- Name: ops_tickets ops_tickets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_tickets
    ADD CONSTRAINT ops_tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: payment_fees payment_fees_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_fees
    ADD CONSTRAINT payment_fees_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: payment_links payment_links_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: products products_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: projections projections_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projections
    ADD CONSTRAINT projections_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: recall_calls recall_calls_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_calls
    ADD CONSTRAINT recall_calls_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: recall_calls recall_calls_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_calls
    ADD CONSTRAINT recall_calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: recall_calls recall_calls_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_calls
    ADD CONSTRAINT recall_calls_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team(id) ON DELETE SET NULL;


--
-- Name: reports reports_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: roadmap_objectives roadmap_objectives_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_objectives
    ADD CONSTRAINT roadmap_objectives_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: roadmap_objectives roadmap_objectives_roadmap_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_objectives
    ADD CONSTRAINT roadmap_objectives_roadmap_id_fkey FOREIGN KEY (roadmap_id) REFERENCES public.roadmaps(id) ON DELETE CASCADE;


--
-- Name: roadmaps roadmaps_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmaps
    ADD CONSTRAINT roadmaps_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: sales sales_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: sales sales_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.client_operators(id) ON DELETE SET NULL;


--
-- Name: store_alerts store_alerts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_alerts
    ADD CONSTRAINT store_alerts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: store_alerts store_alerts_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_alerts
    ADD CONSTRAINT store_alerts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_clients store_clients_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_clients
    ADD CONSTRAINT store_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: store_clients store_clients_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_clients
    ADD CONSTRAINT store_clients_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;


--
-- Name: store_daily_tracking store_daily_tracking_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_daily_tracking
    ADD CONSTRAINT store_daily_tracking_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_history store_history_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_history
    ADD CONSTRAINT store_history_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_steps store_steps_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_steps
    ADD CONSTRAINT store_steps_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_ticket_messages store_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_ticket_messages
    ADD CONSTRAINT store_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.store_tickets(id) ON DELETE CASCADE;


--
-- Name: store_tickets store_tickets_assigned_gestor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_tickets
    ADD CONSTRAINT store_tickets_assigned_gestor_id_fkey FOREIGN KEY (assigned_gestor_id) REFERENCES public.team(id);


--
-- Name: store_tickets store_tickets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_tickets
    ADD CONSTRAINT store_tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: store_tickets store_tickets_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_tickets
    ADD CONSTRAINT store_tickets_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: stores stores_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: stores stores_gestor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.team(id);


--
-- Name: subscriptions subscriptions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: subscriptions subscriptions_upgrade_from_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_upgrade_from_plan_id_fkey FOREIGN KEY (upgrade_from_plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: superadmin_commissions superadmin_commissions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_commissions
    ADD CONSTRAINT superadmin_commissions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: task_messages task_messages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: task_messages task_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.crm_tasks(id) ON DELETE CASCADE;


--
-- Name: task_pipelines task_pipelines_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pipelines
    ADD CONSTRAINT task_pipelines_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: task_sprints task_sprints_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_sprints
    ADD CONSTRAINT task_sprints_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: task_stages task_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_stages
    ADD CONSTRAINT task_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.task_pipelines(id) ON DELETE CASCADE;


--
-- Name: team team_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: team team_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.client_operators(id) ON DELETE SET NULL;


--
-- Name: tenant_invitations tenant_invitations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: user_integrations user_integrations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: user_integrations user_integrations_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: user_onboarding_answers user_onboarding_answers_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_answers
    ADD CONSTRAINT user_onboarding_answers_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: user_onboarding_answers user_onboarding_answers_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_answers
    ADD CONSTRAINT user_onboarding_answers_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: weekly_feedback_responses weekly_feedback_responses_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_feedback_responses
    ADD CONSTRAINT weekly_feedback_responses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: whatsapp_api_accounts whatsapp_api_accounts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_api_accounts
    ADD CONSTRAINT whatsapp_api_accounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: whatsapp_config whatsapp_config_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.client_operators(id) ON DELETE SET NULL;


--
-- Name: whatsapp_config whatsapp_config_setter_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_setter_pipeline_id_fkey FOREIGN KEY (setter_pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;


--
-- Name: workflow_delayed_steps workflow_delayed_steps_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_delayed_steps
    ADD CONSTRAINT workflow_delayed_steps_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: workflow_delayed_steps workflow_delayed_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_delayed_steps
    ADD CONSTRAINT workflow_delayed_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;


--
-- Name: workflow_delayed_steps workflow_delayed_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_delayed_steps
    ADD CONSTRAINT workflow_delayed_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflow_run_steps workflow_run_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run_steps
    ADD CONSTRAINT workflow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;


--
-- Name: workflow_runs workflow_runs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: workflow_runs workflow_runs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: bw_contracts Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.bw_contracts USING (true) WITH CHECK (true);


--
-- Name: chat_broadcasts Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.chat_broadcasts USING (true) WITH CHECK (true);


--
-- Name: chat_contacts Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.chat_contacts USING (true) WITH CHECK (true);


--
-- Name: chat_conversations Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.chat_conversations USING (true) WITH CHECK (true);


--
-- Name: chat_flows Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.chat_flows USING (true) WITH CHECK (true);


--
-- Name: chat_messages Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.chat_messages USING (true) WITH CHECK (true);


--
-- Name: email_campaigns Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.email_campaigns USING (true) WITH CHECK (true);


--
-- Name: email_config Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.email_config USING (true) WITH CHECK (true);


--
-- Name: email_lists Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.email_lists USING (true) WITH CHECK (true);


--
-- Name: email_subscribers Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.email_subscribers USING (true) WITH CHECK (true);


--
-- Name: email_templates Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.email_templates USING (true) WITH CHECK (true);


--
-- Name: agent_conversations Allow all agent_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all agent_conversations" ON public.agent_conversations USING (true) WITH CHECK (true);


--
-- Name: agent_messages Allow all agent_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all agent_messages" ON public.agent_messages USING (true) WITH CHECK (true);


--
-- Name: booking_hosts Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.booking_hosts USING (true) WITH CHECK (true);


--
-- Name: booking_routing_forms Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.booking_routing_forms USING (true) WITH CHECK (true);


--
-- Name: bookings Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.bookings USING (true) WITH CHECK (true);


--
-- Name: ceo_daily_digests Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_daily_digests USING (true) WITH CHECK (true);


--
-- Name: ceo_finance_entries Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_finance_entries USING (true) WITH CHECK (true);


--
-- Name: ceo_ideas Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_ideas USING (true) WITH CHECK (true);


--
-- Name: ceo_integrations Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_integrations USING (true) WITH CHECK (true);


--
-- Name: ceo_meetings Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_meetings USING (true) WITH CHECK (true);


--
-- Name: ceo_projects Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_projects USING (true) WITH CHECK (true);


--
-- Name: ceo_team_notes Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_team_notes USING (true) WITH CHECK (true);


--
-- Name: ceo_weekly_digests Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.ceo_weekly_digests USING (true) WITH CHECK (true);


--
-- Name: legal_documents Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.legal_documents USING (true) WITH CHECK (true);


--
-- Name: operations_links Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.operations_links USING (true) WITH CHECK (true);


--
-- Name: recall_calls Allow all for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for anon" ON public.recall_calls USING (true) WITH CHECK (true);


--
-- Name: agent_runs Service role full access on agent_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on agent_runs" ON public.agent_runs USING (true) WITH CHECK (true);


--
-- Name: clients Service role full access on clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on clients" ON public.clients USING (true) WITH CHECK (true);


--
-- Name: comunidad_channels Service role full access on comunidad_channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on comunidad_channels" ON public.comunidad_channels USING (true) WITH CHECK (true);


--
-- Name: comunidad_messages Service role full access on comunidad_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on comunidad_messages" ON public.comunidad_messages USING (true) WITH CHECK (true);


--
-- Name: copies_guiones Service role full access on copies_guiones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on copies_guiones" ON public.copies_guiones USING (true) WITH CHECK (true);


--
-- Name: crm_activities Service role full access on crm_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_activities" ON public.crm_activities USING (true) WITH CHECK (true);


--
-- Name: crm_contacts Service role full access on crm_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_contacts" ON public.crm_contacts USING (true) WITH CHECK (true);


--
-- Name: crm_custom_fields Service role full access on crm_custom_fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_custom_fields" ON public.crm_custom_fields USING (true) WITH CHECK (true);


--
-- Name: crm_files Service role full access on crm_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_files" ON public.crm_files USING (true) WITH CHECK (true);


--
-- Name: crm_pipelines Service role full access on crm_pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_pipelines" ON public.crm_pipelines USING (true) WITH CHECK (true);


--
-- Name: crm_smart_views Service role full access on crm_smart_views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_smart_views" ON public.crm_smart_views USING (true) WITH CHECK (true);


--
-- Name: crm_tasks Service role full access on crm_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on crm_tasks" ON public.crm_tasks USING (true) WITH CHECK (true);


--
-- Name: formacion_cursos Service role full access on formacion_cursos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on formacion_cursos" ON public.formacion_cursos USING (true) WITH CHECK (true);


--
-- Name: formacion_videos Service role full access on formacion_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on formacion_videos" ON public.formacion_videos USING (true) WITH CHECK (true);


--
-- Name: linkedin_daily_reports Service role full access on linkedin_daily_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on linkedin_daily_reports" ON public.linkedin_daily_reports USING (true) WITH CHECK (true);


--
-- Name: linkedin_posts Service role full access on linkedin_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on linkedin_posts" ON public.linkedin_posts USING (true) WITH CHECK (true);


--
-- Name: n8n_config Service role full access on n8n_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on n8n_config" ON public.n8n_config USING (true) WITH CHECK (true);


--
-- Name: ops_ticket_events Service role full access on ops_ticket_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on ops_ticket_events" ON public.ops_ticket_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: ops_ticket_messages Service role full access on ops_ticket_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on ops_ticket_messages" ON public.ops_ticket_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: ops_ticket_pipeline Service role full access on ops_ticket_pipeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on ops_ticket_pipeline" ON public.ops_ticket_pipeline TO service_role USING (true) WITH CHECK (true);


--
-- Name: ops_tickets Service role full access on ops_tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on ops_tickets" ON public.ops_tickets TO service_role USING (true) WITH CHECK (true);


--
-- Name: payment_fees Service role full access on payment_fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on payment_fees" ON public.payment_fees USING (true) WITH CHECK (true);


--
-- Name: products Service role full access on products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on products" ON public.products USING (true) WITH CHECK (true);


--
-- Name: projections Service role full access on projections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on projections" ON public.projections USING (true) WITH CHECK (true);


--
-- Name: reports Service role full access on reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on reports" ON public.reports USING (true) WITH CHECK (true);


--
-- Name: roadmap_objectives Service role full access on roadmap_objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on roadmap_objectives" ON public.roadmap_objectives USING (true) WITH CHECK (true);


--
-- Name: roadmaps Service role full access on roadmaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on roadmaps" ON public.roadmaps USING (true) WITH CHECK (true);


--
-- Name: sales Service role full access on sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on sales" ON public.sales USING (true) WITH CHECK (true);


--
-- Name: superadmin_commissions Service role full access on superadmin_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on superadmin_commissions" ON public.superadmin_commissions USING (true) WITH CHECK (true);


--
-- Name: superadmins Service role full access on superadmins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on superadmins" ON public.superadmins USING (true) WITH CHECK (true);


--
-- Name: support_messages Service role full access on support_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on support_messages" ON public.support_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: support_tickets Service role full access on support_tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on support_tickets" ON public.support_tickets TO service_role USING (true) WITH CHECK (true);


--
-- Name: task_messages Service role full access on task_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on task_messages" ON public.task_messages USING (true) WITH CHECK (true);


--
-- Name: team Service role full access on team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on team" ON public.team USING (true) WITH CHECK (true);


--
-- Name: tenant_invitations Service role full access on tenant_invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on tenant_invitations" ON public.tenant_invitations TO service_role USING (true) WITH CHECK (true);


--
-- Name: workflow_delayed_steps Service role full access on workflow_delayed_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on workflow_delayed_steps" ON public.workflow_delayed_steps USING (true) WITH CHECK (true);


--
-- Name: workflow_run_steps Service role full access on workflow_run_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on workflow_run_steps" ON public.workflow_run_steps USING (true) WITH CHECK (true);


--
-- Name: workflow_runs Service role full access on workflow_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on workflow_runs" ON public.workflow_runs USING (true) WITH CHECK (true);


--
-- Name: workflow_webhook_triggers Service role full access on workflow_webhook_triggers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on workflow_webhook_triggers" ON public.workflow_webhook_triggers USING (true) WITH CHECK (true);


--
-- Name: agent_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_learnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_learnings ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_client_deliverables anon full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon full access" ON public.bw_client_deliverables USING (true) WITH CHECK (true);


--
-- Name: bw_client_projects anon full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon full access" ON public.bw_client_projects USING (true) WITH CHECK (true);


--
-- Name: bw_onboarding_steps anon full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon full access" ON public.bw_onboarding_steps USING (true) WITH CHECK (true);


--
-- Name: bw_support_tickets anon full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon full access" ON public.bw_support_tickets USING (true) WITH CHECK (true);


--
-- Name: bw_ticket_messages anon full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon full access" ON public.bw_ticket_messages USING (true) WITH CHECK (true);


--
-- Name: user_integrations anon_deny; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_deny ON public.user_integrations TO anon USING (false) WITH CHECK (false);


--
-- Name: notifications anon_deny_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_deny_notifications ON public.notifications TO anon USING (false) WITH CHECK (false);


--
-- Name: crm_contacts anon_insert_crm_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_insert_crm_contacts ON public.crm_contacts FOR INSERT TO anon WITH CHECK (true);


--
-- Name: sales anon_insert_sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_insert_sales ON public.sales FOR INSERT TO anon WITH CHECK (true);


--
-- Name: crm_contacts anon_select_crm_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_crm_contacts ON public.crm_contacts FOR SELECT TO anon USING (true);


--
-- Name: email_config anon_select_email_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_email_config ON public.email_config FOR SELECT TO anon USING (true);


--
-- Name: legal_documents anon_select_legal_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_legal_documents ON public.legal_documents FOR SELECT TO anon USING (true);


--
-- Name: manychat_config anon_select_manychat_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_manychat_config ON public.manychat_config FOR SELECT TO anon USING (true);


--
-- Name: sales anon_select_sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_sales ON public.sales FOR SELECT TO anon USING (true);


--
-- Name: team anon_select_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_team ON public.team FOR SELECT TO anon USING (true);


--
-- Name: whatsapp_config anon_select_whatsapp_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_select_whatsapp_config ON public.whatsapp_config FOR SELECT TO anon USING (true);


--
-- Name: audit_logs anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.audit_logs TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_daily_digests anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_daily_digests TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_finance_entries anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_finance_entries TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_ideas anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_ideas TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_integrations anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_integrations TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_meetings anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_meetings TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_projects anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_projects TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_team_notes anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_team_notes TO anon USING (true) WITH CHECK (true);


--
-- Name: ceo_weekly_digests anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.ceo_weekly_digests TO anon USING (true) WITH CHECK (true);


--
-- Name: crm_activities anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.crm_activities TO anon USING (true) WITH CHECK (true);


--
-- Name: crm_contacts anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.crm_contacts TO anon USING (true) WITH CHECK (true);


--
-- Name: crm_pipelines anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.crm_pipelines TO anon USING (true) WITH CHECK (true);


--
-- Name: events anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.events TO anon USING (true) WITH CHECK (true);


--
-- Name: invoices anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.invoices TO anon USING (true) WITH CHECK (true);


--
-- Name: n8n_config anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.n8n_config TO anon USING (true) WITH CHECK (true);


--
-- Name: payment_fees anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.payment_fees TO anon USING (true) WITH CHECK (true);


--
-- Name: products anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.products TO anon USING (true) WITH CHECK (true);


--
-- Name: projections anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.projections TO anon USING (true) WITH CHECK (true);


--
-- Name: reports anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.reports TO anon USING (true) WITH CHECK (true);


--
-- Name: sales anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.sales TO anon USING (true) WITH CHECK (true);


--
-- Name: subscriptions anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.subscriptions TO anon USING (true) WITH CHECK (true);


--
-- Name: superadmin_commissions anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.superadmin_commissions TO anon USING (true) WITH CHECK (true);


--
-- Name: team anon_temp_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_temp_all ON public.team TO anon USING (true) WITH CHECK (true);


--
-- Name: crm_contacts anon_update_crm_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_update_crm_contacts ON public.crm_contacts FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: sales anon_update_sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_update_sales ON public.sales FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: apex_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apex_state ENABLE ROW LEVEL SECURITY;

--
-- Name: apex_state apex_state_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apex_state_delete ON public.apex_state FOR DELETE USING (true);


--
-- Name: apex_state apex_state_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apex_state_insert ON public.apex_state FOR INSERT WITH CHECK (true);


--
-- Name: apex_state apex_state_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apex_state_select ON public.apex_state FOR SELECT USING (true);


--
-- Name: apex_state apex_state_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apex_state_update ON public.apex_state FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_hosts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_hosts ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_routing_forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_routing_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_client_deliverables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bw_client_deliverables ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_client_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bw_client_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bw_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_onboarding_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bw_onboarding_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bw_support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: bw_ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bw_ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_daily_digests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_daily_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_finance_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_finance_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_ideas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_ideas ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_team_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_team_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: ceo_weekly_digests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ceo_weekly_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_configs chatbot_configs_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_configs_all ON public.chatbot_configs USING (true) WITH CHECK (true);


--
-- Name: chatbot_knowledge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_knowledge ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_knowledge chatbot_knowledge_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_knowledge_all ON public.chatbot_knowledge USING (true) WITH CHECK (true);


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: comunidad_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comunidad_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: comunidad_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comunidad_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: console_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.console_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: console_api_keys console_api_keys_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY console_api_keys_all ON public.console_api_keys USING (true) WITH CHECK (true);


--
-- Name: copies_guiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.copies_guiones ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_files ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sequence_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sequence_enrollments crm_sequence_enrollments_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_sequence_enrollments_all ON public.crm_sequence_enrollments USING (true) WITH CHECK (true);


--
-- Name: crm_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sequences crm_sequences_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_sequences_all ON public.crm_sequences USING (true) WITH CHECK (true);


--
-- Name: crm_smart_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_smart_views ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;

--
-- Name: email_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: email_subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_form_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_form_config ENABLE ROW LEVEL SECURITY;

--
-- Name: formacion_cursos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formacion_cursos ENABLE ROW LEVEL SECURITY;

--
-- Name: formacion_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formacion_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_config ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_group_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_group_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.infoproducto_users ENABLE ROW LEVEL SECURITY;

--
-- Name: installment_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: installment_payments installment_payments_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY installment_payments_all ON public.installment_payments USING (true) WITH CHECK (true);


--
-- Name: installment_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: installment_plans installment_plans_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY installment_plans_all ON public.installment_plans USING (true) WITH CHECK (true);


--
-- Name: integration_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_services ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: infoproducto_announcements ip_ann_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ip_ann_public_read ON public.infoproducto_announcements FOR SELECT USING ((published = true));


--
-- Name: infoproducto_config ip_config_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ip_config_public_read ON public.infoproducto_config FOR SELECT USING (true);


--
-- Name: infoproducto_groups ip_groups_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ip_groups_public_read ON public.infoproducto_groups FOR SELECT USING ((is_public = true));


--
-- Name: infoproducto_photos ip_photos_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ip_photos_public_read ON public.infoproducto_photos FOR SELECT USING (true);


--
-- Name: legal_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: linkedin_daily_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.linkedin_daily_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: linkedin_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.linkedin_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: logistics_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logistics_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: logistics_orders logistics_orders_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logistics_orders_all ON public.logistics_orders USING (true) WITH CHECK (true);


--
-- Name: logistics_pricing_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logistics_pricing_history ENABLE ROW LEVEL SECURITY;

--
-- Name: logistics_pricing_history logistics_pricing_history_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logistics_pricing_history_all ON public.logistics_pricing_history USING (true) WITH CHECK (true);


--
-- Name: logistics_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logistics_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: logistics_quotes logistics_quotes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logistics_quotes_all ON public.logistics_quotes USING (true) WITH CHECK (true);


--
-- Name: manychat_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manychat_config ENABLE ROW LEVEL SECURITY;

--
-- Name: n8n_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.n8n_config ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_links ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_ticket_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_ticket_events ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_ticket_pipeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_ticket_pipeline ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: projections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projections ENABLE ROW LEVEL SECURITY;

--
-- Name: recall_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: roadmap_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roadmap_objectives ENABLE ROW LEVEL SECURITY;

--
-- Name: roadmaps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts service_all_crm_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_crm_contacts ON public.crm_contacts TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_config service_all_email_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_email_config ON public.email_config TO service_role USING (true) WITH CHECK (true);


--
-- Name: legal_documents service_all_legal_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_legal_documents ON public.legal_documents TO service_role USING (true) WITH CHECK (true);


--
-- Name: manychat_config service_all_manychat_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_manychat_config ON public.manychat_config TO service_role USING (true) WITH CHECK (true);


--
-- Name: notifications service_all_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_notifications ON public.notifications TO service_role USING (true) WITH CHECK (true);


--
-- Name: sales service_all_sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_sales ON public.sales TO service_role USING (true) WITH CHECK (true);


--
-- Name: team service_all_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_team ON public.team TO service_role USING (true) WITH CHECK (true);


--
-- Name: whatsapp_config service_all_whatsapp_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_whatsapp_config ON public.whatsapp_config TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_decisions service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.agent_decisions USING (true) WITH CHECK (true);


--
-- Name: agent_feedback service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.agent_feedback USING (true) WITH CHECK (true);


--
-- Name: agent_learnings service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.agent_learnings USING (true) WITH CHECK (true);


--
-- Name: feedback_form_config service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.feedback_form_config USING (true) WITH CHECK (true);


--
-- Name: manychat_config service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.manychat_config USING (true) WITH CHECK (true);


--
-- Name: weekly_feedback_responses service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.weekly_feedback_responses USING (true) WITH CHECK (true);


--
-- Name: weekly_feedback_summaries service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.weekly_feedback_summaries USING (true) WITH CHECK (true);


--
-- Name: workflows service_role all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role all" ON public.workflows USING (true) WITH CHECK (true);


--
-- Name: integration_services services_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY services_read ON public.integration_services FOR SELECT TO anon, authenticated USING ((active = true));


--
-- Name: integration_services services_srv; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY services_srv ON public.integration_services TO service_role USING (true) WITH CHECK (true);


--
-- Name: audit_logs srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.audit_logs TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_daily_digests srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_daily_digests TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_finance_entries srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_finance_entries TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_ideas srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_ideas TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_integrations srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_integrations TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_meetings srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_meetings TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_projects srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_projects TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_team_notes srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_team_notes TO service_role USING (true) WITH CHECK (true);


--
-- Name: ceo_weekly_digests srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.ceo_weekly_digests TO service_role USING (true) WITH CHECK (true);


--
-- Name: crm_activities srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.crm_activities TO service_role USING (true) WITH CHECK (true);


--
-- Name: crm_contacts srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.crm_contacts TO service_role USING (true) WITH CHECK (true);


--
-- Name: crm_pipelines srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.crm_pipelines TO service_role USING (true) WITH CHECK (true);


--
-- Name: events srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.events TO service_role USING (true) WITH CHECK (true);


--
-- Name: invoices srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.invoices TO service_role USING (true) WITH CHECK (true);


--
-- Name: n8n_config srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.n8n_config TO service_role USING (true) WITH CHECK (true);


--
-- Name: payment_fees srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.payment_fees TO service_role USING (true) WITH CHECK (true);


--
-- Name: products srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.products TO service_role USING (true) WITH CHECK (true);


--
-- Name: projections srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.projections TO service_role USING (true) WITH CHECK (true);


--
-- Name: reports srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.reports TO service_role USING (true) WITH CHECK (true);


--
-- Name: sales srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.sales TO service_role USING (true) WITH CHECK (true);


--
-- Name: subscriptions srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: superadmin_commissions srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.superadmin_commissions TO service_role USING (true) WITH CHECK (true);


--
-- Name: team srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.team TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_integrations srv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_all ON public.user_integrations TO service_role USING (true) WITH CHECK (true);


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: superadmin_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superadmin_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: superadmins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: task_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: task_pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: task_pipelines task_pipelines_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_pipelines_all ON public.task_pipelines USING (true) WITH CHECK (true);


--
-- Name: task_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: task_stages task_stages_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_stages_all ON public.task_stages USING (true) WITH CHECK (true);


--
-- Name: team; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_api_accounts wa_api_accounts_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wa_api_accounts_service_all ON public.whatsapp_api_accounts TO service_role USING (true) WITH CHECK (true);


--
-- Name: weekly_feedback_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_feedback_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_feedback_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_feedback_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_api_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_api_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_delayed_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_delayed_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_run_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_webhook_triggers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_webhook_triggers ENABLE ROW LEVEL SECURITY;

--
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



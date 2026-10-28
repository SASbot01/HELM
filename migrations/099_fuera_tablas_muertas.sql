-- HELM — fuera la basura de la base.
--
-- La base arrastraba 213 tablas de productos anteriores (apex, ERP, MID,
-- logística, tickets, suscripciones…). Estas 148 cumplen las tres cosas a la
-- vez (comprobado el 2026-10-12):
--   · ningún fichero de api/, src/ ni scripts/ las nombra;
--   · están vacías (demo_signup_attempts tenía 1 fila de una demo vieja);
--   · nada vivo depende de ellas: las vistas que caen con ellas tampoco las usa
--     nadie, y de las tablas vivas solo se pierden claves foráneas hacia
--     tablas vacías (crm_tasks, crm_pipelines, sales, team, invoices).
--
-- Con ellas se van:
--   · los dos triggers viejos de crm_tasks: uno escribía en `notifications`
--     (HELM usa helm_notificaciones) con un enlace a /task-management, que ya
--     no existe; el otro leía etapas de `task_stages`, vacía;
--   · las funciones que solo servían a esas tablas.
--
-- Antes de aplicarla: copia de la base (scripts/backup-db.sh o pg_dump). Para
-- recuperar algo, está en esa copia.

begin;

drop trigger if exists trg_notify_task_assigned on crm_tasks;
drop trigger if exists trg_sync_task_status_from_stage on crm_tasks;
drop function if exists notify_task_assigned() cascade;
drop function if exists sync_task_status_from_stage() cascade;

drop view if exists client_config_summary, events_funnel_30d, mrr_by_client, ops_tickets_inbox,
  sales_with_net_cash, signups_funnel_30d, support_tickets_inbox, user_integrations_enriched cascade;

drop table if exists
  public.agent_conversations,
  public.agent_decisions,
  public.agent_feedback,
  public.agent_learnings,
  public.agent_messages,
  public.agent_runs,
  public.apex_admin_api_audit,
  public.apex_leads,
  public.apex_newsletter_posts,
  public.apex_newsletter_sends,
  public.apex_newsletter_subscribers,
  public.apex_state,
  public.asesoriasuiza_establecimiento_submissions,
  public.asesoriasuiza_job_offers,
  public.asesoriasuiza_webinar_call_intake,
  public.asesoriasuiza_webinar_signups,
  public.auth_sessions,
  public.booking_hosts,
  public.booking_reminders,
  public.booking_routing_forms,
  public.booking_routing_responses,
  public.bookings,
  public.brain_decisions,
  public.bulk_send_jobs,
  public.bulk_send_recipients,
  public.bw_client_deliverables,
  public.bw_client_projects,
  public.bw_contracts,
  public.bw_onboarding_steps,
  public.bw_support_tickets,
  public.bw_ticket_messages,
  public.calendly_auth,
  public.ceo_daily_digests,
  public.ceo_ideas,
  public.ceo_integrations,
  public.ceo_meetings,
  public.ceo_projects,
  public.ceo_team_notes,
  public.ceo_weekly_digests,
  public.chat_broadcasts,
  public.chat_contacts,
  public.chat_conversations,
  public.chat_flows,
  public.chat_messages,
  public.chatbot_configs,
  public.chatbot_knowledge,
  public.client_operators,
  public.close_sync_log,
  public.commission_payments,
  public.commission_rules,
  public.console_api_keys,
  public.copies_guiones,
  public.crm_custom_fields,
  public.crm_files,
  public.crm_messages,
  public.crm_sequence_enrollments,
  public.crm_sequences,
  public.crm_smart_views,
  public.crm_tasks_archive,
  public.email_campaigns,
  public.email_config,
  public.email_lists,
  public.email_sequence_contacts,
  public.email_sequences,
  public.email_subscribers,
  public.email_templates,
  public.erp_accounting,
  public.erp_companies,
  public.erp_contacts,
  public.erp_employees,
  public.erp_invoices,
  public.erp_production_orders,
  public.erp_products,
  public.erp_stock_moves,
  public.erp_users,
  public.feedback_form_config,
  public.fireflies_transcripts,
  public.info_producto_assets,
  public.info_producto_process_steps,
  public.info_producto_process_templates,
  public.info_productos,
  public.installment_payments,
  public.installment_plans,
  public.integration_services,
  public.legal_documents,
  public.linkedin_daily_reports,
  public.linkedin_posts,
  public.logistics_orders,
  public.logistics_pricing_history,
  public.logistics_pricing_stats,
  public.logistics_quotes,
  public.manychat_config,
  public.marketplace_applications,
  public.marketplace_jobs,
  public.n8n_config,
  public.notifications,
  public.onboarding_config,
  public.onboarding_keys,
  public.operations_links,
  public.ops_ticket_events,
  public.ops_ticket_messages,
  public.ops_ticket_pipeline,
  public.ops_tickets,
  public.orbe_messages,
  public.payment_fees,
  public.payment_links,
  public.portal_otp_codes,
  public.projections,
  public.recall_calls,
  public.roadmap_objectives,
  public.roadmaps,
  public.scrap_agent_queue,
  public.signups,
  public.store_alerts,
  public.store_clients,
  public.store_daily_tracking,
  public.store_history,
  public.store_steps,
  public.store_ticket_messages,
  public.store_tickets,
  public.stores,
  public.subscription_plans,
  public.subscriptions,
  public.superadmin_commissions,
  public.support_messages,
  public.support_tickets,
  public.system_events,
  public.task_messages,
  public.task_pipelines,
  public.task_sprints,
  public.task_stages,
  public.team_leadership,
  public.team_members,
  public.tenant_invitations,
  public.user_onboarding_answers,
  public.webhook_config,
  public.webhook_dlq,
  public.webhook_events,
  public.weekly_feedback_responses,
  public.weekly_feedback_summaries,
  public.whatsapp_api_accounts,
  public.whatsapp_config,
  public.workflow_delayed_steps,
  public.workflow_run_steps,
  public.workflow_runs,
  public.workflow_webhook_triggers,
  public.workflows
  , public.demo_signup_attempts
cascade;

drop function if exists public.apex_leads_set_updated_at() cascade;
drop function if exists public.apex_newsletter_posts_set_updated_at() cascade;
drop function if exists public.apex_state_touch() cascade;
drop function if exists public.asesoriasuiza_job_offers_touch() cascade;
drop function if exists public.auto_create_logistics_order() cascade;
drop function if exists public.commission_rules_set_updated_at() cascade;
drop function if exists public.compute_logistics_shares() cascade;
drop function if exists public.generate_logistics_order_number() cascade;
drop function if exists public.log_pricing_history() cascade;
drop function if exists public.notify_ticket_assigned() cascade;
drop function if exists public.ops_pipeline_get() cascade;
drop function if exists public.ops_pipeline_sla_hours(p_priority text) cascade;
drop function if exists public.ops_ticket_messages_touch_ticket() cascade;
drop function if exists public.ops_tickets_audit() cascade;
drop function if exists public.ops_tickets_compute_sla() cascade;
drop function if exists public.ops_tickets_done_system_message() cascade;
drop function if exists public.ops_tickets_status_timestamps() cascade;
drop function if exists public.ops_tickets_touch_updated_at() cascade;
drop function if exists public.set_updated_at_whatsapp_api_accounts() cascade;
drop function if exists public.support_messages_touch_ticket() cascade;
drop function if exists public.support_tickets_touch_updated_at() cascade;
drop function if exists public.tenant_invitations_touch_updated_at() cascade;
drop function if exists public.update_agent_learnings_timestamp() cascade;
drop function if exists public.update_recall_calls_timestamp() cascade;

commit;

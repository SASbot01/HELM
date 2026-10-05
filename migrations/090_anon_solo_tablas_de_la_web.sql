-- HELM — la clave pública deja de ver las tablas que la web no usa.
--
-- La web lee y escribe la base desde el navegador con la clave pública
-- (`anon`), y esa clave tenía permiso sobre las 206 tablas del esquema: las
-- 29 que la web usa de verdad y otras 177 que no nombra en ningún sitio
-- (sesiones, códigos de un solo uso, registros de auditoría, tablas de
-- productos antiguos…). Aquí se le quita el permiso sobre esas 177. El
-- servidor (api/, worker) entra con `service_role` y no nota nada.
--
-- La lista sale de buscar el nombre de cada tabla en src/: si no aparece, el
-- navegador no puede estar usándola. Las 29 que sí usa siguen abiertas hasta
-- que el acceso desde el navegador pase por reglas por perfil (ver
-- docs/auditoria/TAREAS.md).
--
-- Para deshacerlo en una tabla:
--   grant all on public.<tabla> to anon, authenticated;
--
-- Se puede ejecutar varias veces.
begin;

revoke all on public."agent_conversations" from anon, authenticated;
revoke all on public."agent_decisions" from anon, authenticated;
revoke all on public."agent_drive_perfiles" from anon, authenticated;
revoke all on public."agent_drive_videos" from anon, authenticated;
revoke all on public."agent_ejecuciones" from anon, authenticated;
revoke all on public."agent_feedback" from anon, authenticated;
revoke all on public."agent_identities" from anon, authenticated;
revoke all on public."agent_identity_clients" from anon, authenticated;
revoke all on public."agent_jobs" from anon, authenticated;
revoke all on public."agent_learnings" from anon, authenticated;
revoke all on public."agent_mcp_tokens" from anon, authenticated;
revoke all on public."agent_memory" from anon, authenticated;
revoke all on public."agent_messages" from anon, authenticated;
revoke all on public."agent_perfiles" from anon, authenticated;
revoke all on public."agent_reels" from anon, authenticated;
revoke all on public."agent_runs" from anon, authenticated;
revoke all on public."agent_tareas" from anon, authenticated;
revoke all on public."apex_admin_api_audit" from anon, authenticated;
revoke all on public."apex_leads" from anon, authenticated;
revoke all on public."apex_newsletter_posts" from anon, authenticated;
revoke all on public."apex_newsletter_sends" from anon, authenticated;
revoke all on public."apex_newsletter_subscribers" from anon, authenticated;
revoke all on public."apex_state" from anon, authenticated;
revoke all on public."asesoriasuiza_establecimiento_submissions" from anon, authenticated;
revoke all on public."asesoriasuiza_job_offers" from anon, authenticated;
revoke all on public."asesoriasuiza_webinar_call_intake" from anon, authenticated;
revoke all on public."asesoriasuiza_webinar_signups" from anon, authenticated;
revoke all on public."audit_logs" from anon, authenticated;
revoke all on public."auth_sessions" from anon, authenticated;
revoke all on public."booking_hosts" from anon, authenticated;
revoke all on public."booking_reminders" from anon, authenticated;
revoke all on public."booking_routing_forms" from anon, authenticated;
revoke all on public."booking_routing_responses" from anon, authenticated;
revoke all on public."bookings" from anon, authenticated;
revoke all on public."brain_decisions" from anon, authenticated;
revoke all on public."bulk_send_jobs" from anon, authenticated;
revoke all on public."bulk_send_recipients" from anon, authenticated;
revoke all on public."bw_client_deliverables" from anon, authenticated;
revoke all on public."bw_client_projects" from anon, authenticated;
revoke all on public."bw_contracts" from anon, authenticated;
revoke all on public."bw_onboarding_steps" from anon, authenticated;
revoke all on public."bw_support_tickets" from anon, authenticated;
revoke all on public."bw_ticket_messages" from anon, authenticated;
revoke all on public."calendly_auth" from anon, authenticated;
revoke all on public."ceo_daily_digests" from anon, authenticated;
revoke all on public."ceo_ideas" from anon, authenticated;
revoke all on public."ceo_integrations" from anon, authenticated;
revoke all on public."ceo_meetings" from anon, authenticated;
revoke all on public."ceo_projects" from anon, authenticated;
revoke all on public."ceo_team_notes" from anon, authenticated;
revoke all on public."ceo_weekly_digests" from anon, authenticated;
revoke all on public."chat_broadcasts" from anon, authenticated;
revoke all on public."chat_contacts" from anon, authenticated;
revoke all on public."chat_conversations" from anon, authenticated;
revoke all on public."chat_flows" from anon, authenticated;
revoke all on public."chat_messages" from anon, authenticated;
revoke all on public."chatbot_configs" from anon, authenticated;
revoke all on public."chatbot_knowledge" from anon, authenticated;
revoke all on public."client_operators" from anon, authenticated;
revoke all on public."close_sync_log" from anon, authenticated;
revoke all on public."commission_payments" from anon, authenticated;
revoke all on public."commission_rules" from anon, authenticated;
revoke all on public."console_api_keys" from anon, authenticated;
revoke all on public."copies_guiones" from anon, authenticated;
revoke all on public."crm_custom_fields" from anon, authenticated;
revoke all on public."crm_files" from anon, authenticated;
revoke all on public."crm_messages" from anon, authenticated;
revoke all on public."crm_sequence_enrollments" from anon, authenticated;
revoke all on public."crm_sequences" from anon, authenticated;
revoke all on public."crm_smart_views" from anon, authenticated;
revoke all on public."crm_tasks_archive" from anon, authenticated;
revoke all on public."demo_signup_attempts" from anon, authenticated;
revoke all on public."email_campaigns" from anon, authenticated;
revoke all on public."email_config" from anon, authenticated;
revoke all on public."email_lists" from anon, authenticated;
revoke all on public."email_sequence_contacts" from anon, authenticated;
revoke all on public."email_sequences" from anon, authenticated;
revoke all on public."email_subscribers" from anon, authenticated;
revoke all on public."email_templates" from anon, authenticated;
revoke all on public."erp_accounting" from anon, authenticated;
revoke all on public."erp_companies" from anon, authenticated;
revoke all on public."erp_contacts" from anon, authenticated;
revoke all on public."erp_employees" from anon, authenticated;
revoke all on public."erp_invoices" from anon, authenticated;
revoke all on public."erp_production_orders" from anon, authenticated;
revoke all on public."erp_products" from anon, authenticated;
revoke all on public."erp_stock_moves" from anon, authenticated;
revoke all on public."erp_users" from anon, authenticated;
revoke all on public."events" from anon, authenticated;
revoke all on public."feedback_form_config" from anon, authenticated;
revoke all on public."fireflies_transcripts" from anon, authenticated;
revoke all on public."helm_agente_base" from anon, authenticated;
revoke all on public."helm_agente_ideas" from anon, authenticated;
revoke all on public."helm_biblia" from anon, authenticated;
revoke all on public."helm_chat_messages" from anon, authenticated;
revoke all on public."helm_content_calendar" from anon, authenticated;
revoke all on public."helm_dia" from anon, authenticated;
revoke all on public."helm_edicion_clientes" from anon, authenticated;
revoke all on public."helm_edicion_cobros" from anon, authenticated;
revoke all on public."helm_edicion_editores" from anon, authenticated;
revoke all on public."helm_edicion_pedidos" from anon, authenticated;
revoke all on public."helm_fiscal_documentos" from anon, authenticated;
revoke all on public."helm_notificaciones" from anon, authenticated;
revoke all on public."helm_prospect_searches" from anon, authenticated;
revoke all on public."helm_prospects" from anon, authenticated;
revoke all on public."info_producto_assets" from anon, authenticated;
revoke all on public."info_producto_process_steps" from anon, authenticated;
revoke all on public."info_producto_process_templates" from anon, authenticated;
revoke all on public."info_productos" from anon, authenticated;
revoke all on public."installment_payments" from anon, authenticated;
revoke all on public."installment_plans" from anon, authenticated;
revoke all on public."integration_services" from anon, authenticated;
revoke all on public."invoices" from anon, authenticated;
revoke all on public."legal_documents" from anon, authenticated;
revoke all on public."linkedin_daily_reports" from anon, authenticated;
revoke all on public."linkedin_posts" from anon, authenticated;
revoke all on public."logistics_orders" from anon, authenticated;
revoke all on public."logistics_pricing_history" from anon, authenticated;
revoke all on public."logistics_pricing_stats" from anon, authenticated;
revoke all on public."logistics_quotes" from anon, authenticated;
revoke all on public."manychat_config" from anon, authenticated;
revoke all on public."marketplace_applications" from anon, authenticated;
revoke all on public."marketplace_jobs" from anon, authenticated;
revoke all on public."n8n_config" from anon, authenticated;
revoke all on public."notifications" from anon, authenticated;
revoke all on public."onboarding_config" from anon, authenticated;
revoke all on public."onboarding_keys" from anon, authenticated;
revoke all on public."operations_links" from anon, authenticated;
revoke all on public."ops_ticket_events" from anon, authenticated;
revoke all on public."ops_ticket_messages" from anon, authenticated;
revoke all on public."ops_ticket_pipeline" from anon, authenticated;
revoke all on public."ops_tickets" from anon, authenticated;
revoke all on public."orbe_messages" from anon, authenticated;
revoke all on public."payment_fees" from anon, authenticated;
revoke all on public."payment_links" from anon, authenticated;
revoke all on public."portal_otp_codes" from anon, authenticated;
revoke all on public."projections" from anon, authenticated;
revoke all on public."recall_calls" from anon, authenticated;
revoke all on public."roadmap_objectives" from anon, authenticated;
revoke all on public."roadmaps" from anon, authenticated;
revoke all on public."scrap_agent_queue" from anon, authenticated;
revoke all on public."signups" from anon, authenticated;
revoke all on public."store_alerts" from anon, authenticated;
revoke all on public."store_clients" from anon, authenticated;
revoke all on public."store_daily_tracking" from anon, authenticated;
revoke all on public."store_history" from anon, authenticated;
revoke all on public."store_steps" from anon, authenticated;
revoke all on public."store_ticket_messages" from anon, authenticated;
revoke all on public."store_tickets" from anon, authenticated;
revoke all on public."stores" from anon, authenticated;
revoke all on public."subscription_plans" from anon, authenticated;
revoke all on public."subscriptions" from anon, authenticated;
revoke all on public."superadmin_commissions" from anon, authenticated;
revoke all on public."support_messages" from anon, authenticated;
revoke all on public."support_tickets" from anon, authenticated;
revoke all on public."system_events" from anon, authenticated;
revoke all on public."task_messages" from anon, authenticated;
revoke all on public."task_pipelines" from anon, authenticated;
revoke all on public."task_sprints" from anon, authenticated;
revoke all on public."task_stages" from anon, authenticated;
revoke all on public."team_leadership" from anon, authenticated;
revoke all on public."team_members" from anon, authenticated;
revoke all on public."tenant_invitations" from anon, authenticated;
revoke all on public."user_integrations" from anon, authenticated;
revoke all on public."user_onboarding_answers" from anon, authenticated;
revoke all on public."webhook_config" from anon, authenticated;
revoke all on public."webhook_dlq" from anon, authenticated;
revoke all on public."webhook_events" from anon, authenticated;
revoke all on public."weekly_feedback_responses" from anon, authenticated;
revoke all on public."weekly_feedback_summaries" from anon, authenticated;
revoke all on public."whatsapp_api_accounts" from anon, authenticated;
revoke all on public."whatsapp_config" from anon, authenticated;
revoke all on public."workflow_delayed_steps" from anon, authenticated;
revoke all on public."workflow_run_steps" from anon, authenticated;
revoke all on public."workflow_runs" from anon, authenticated;
revoke all on public."workflow_webhook_triggers" from anon, authenticated;
revoke all on public."workflows" from anon, authenticated;

commit;

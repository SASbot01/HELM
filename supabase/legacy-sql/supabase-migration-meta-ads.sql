-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add 'meta_ads' to ceo_integrations.service CHECK constraint.
--
-- The marketing section (MarketingDashboard / MetaCampaigns / MetaCreatives)
-- stores the Meta Graph API credentials as a row in ceo_integrations with
-- service='meta_ads' and config={ accessToken, adAccountId }. The original
-- CHECK only allowed fireflies, google_calendar, google_drive, so any attempt
-- to save Meta creds was rejected by Postgres. This migration widens the
-- allowed set.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ceo_integrations
  DROP CONSTRAINT IF EXISTS ceo_integrations_service_check;

ALTER TABLE ceo_integrations
  ADD CONSTRAINT ceo_integrations_service_check
  CHECK (service IN ('fireflies', 'google_calendar', 'google_drive', 'meta_ads'));

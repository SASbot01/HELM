-- ============================================
-- Add WhatsApp Cloud API (Meta official) support fields to whatsapp_config.
-- The existing QR path keeps working; this lets a client opt into the Cloud
-- API as an alternate connection method per account slot.
-- ============================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_method text NOT NULL DEFAULT 'qr'
    CHECK (connection_method IN ('qr', 'cloud')),
  ADD COLUMN IF NOT EXISTS cloud_phone_number_id text,
  ADD COLUMN IF NOT EXISTS cloud_access_token text,
  ADD COLUMN IF NOT EXISTS cloud_waba_id text;

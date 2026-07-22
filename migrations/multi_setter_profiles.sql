-- Multi-setter profiles migration
-- Setter profiles are stored as JSON in whatsapp_config.setter_docs
-- Format: {"profiles": [{"name": "...", "pipeline_id": "...", "enabled": true, "system_message": "...", "docs": "...", "delay_minutes": 3}]}
-- When setter_docs contains valid JSON with a "profiles" key, the WhatsApp connector
-- uses multi-setter mode: each profile responds only to contacts in its assigned pipeline.
-- When setter_docs is plain text (legacy), single-setter mode is used.

-- No schema changes needed — uses existing setter_docs text column.
-- Pipeline "Ventas Luka" created in Lukas/Portillo account for Luka's contacts.
-- Pipeline "Ventas Portillo" handles Portillo's contacts.

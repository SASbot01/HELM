-- 087_mid_cover_position.sql
-- Posición vertical del banner del Infoproducto (recorte manual).
--
-- background-size: cover recorta la imagen. cover_position guarda el
-- "background-position" Y como porcentaje (0 = top de la imagen visible,
-- 100 = bottom). Permite que cada tenant ajuste el encuadre sin pedirnos
-- cambiar CSS hardcoded.

ALTER TABLE infoproducto_config
  ADD COLUMN IF NOT EXISTS cover_position INTEGER NOT NULL DEFAULT 50;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'infoproducto_config_cover_position_chk'
  ) THEN
    ALTER TABLE infoproducto_config
      ADD CONSTRAINT infoproducto_config_cover_position_chk
      CHECK (cover_position >= 0 AND cover_position <= 100);
  END IF;
END $$;

COMMENT ON COLUMN infoproducto_config.cover_position IS
  'Posición vertical del crop del banner (0–100). 0=top visible, 50=center, 100=bottom. Editable desde MidHome → admin → "Recortar".';

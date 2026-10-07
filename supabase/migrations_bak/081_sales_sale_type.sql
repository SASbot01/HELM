-- 081 · sales.sale_type — diferenciar Venta vs Reserva vs Depósito
-- Pedido por Steven (FBA Academy / Pablo el closer): el equipo no podía
-- registrar reservas/depósitos. Hoy todo entraba como "venta", lo que
-- distorsiona las métricas que mira el CEO (Emiliano) cuando hay volumen.
--
-- Diseño:
--   - Columna TEXT con CHECK constraint para 3 valores válidos.
--   - Default 'venta' para no romper inserts existentes ni el flow normal.
--   - Backfill: las filas existentes quedan como 'venta'.
--   - Las métricas de cash/revenue del SalesDashboard excluirán reservas/depósitos
--     en código (más simple que vistas materializadas; queryable en frontend).

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'venta';

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_sale_type_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_sale_type_check
  CHECK (sale_type IN ('venta', 'reserva', 'deposito'));

CREATE INDEX IF NOT EXISTS sales_sale_type_idx ON sales(client_id, sale_type);

COMMENT ON COLUMN sales.sale_type IS
  'Tipo de operación: venta (cobro firme), reserva (compromiso sin cobro completo), deposito (señal/parcial). Reservas y depósitos NO cuentan como venta cerrada en métricas del dashboard.';

-- Payment links de Stripe — URLs reutilizables que el cliente abre y paga.
-- Se crean desde el dashboard (/api/stripe/payment-links POST) y Stripe las
-- enlaza a un price concreto. Cuando alguien paga, el webhook /api/webhook/stripe
-- registra la sale en `sales` con metadata que referencia el link.

CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  stripe_payment_link_id TEXT NOT NULL,         -- plink_xxx
  stripe_url TEXT NOT NULL,                     -- https://buy.stripe.com/xxx
  stripe_price_id TEXT,                         -- price_xxx
  product_name TEXT NOT NULL,
  concept TEXT DEFAULT '',                      -- descripción humana del pago
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  active BOOLEAN NOT NULL DEFAULT true,
  uses_count INTEGER NOT NULL DEFAULT 0,        -- se incrementa desde webhook
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_links_client ON payment_links(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_stripe_id ON payment_links(stripe_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_active ON payment_links(client_id, active);

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rappi_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peya_commission numeric NOT NULL DEFAULT 0;

ALTER TABLE public.orders ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS idx_orders_channel ON public.orders (establishment_id, channel, created_at DESC);
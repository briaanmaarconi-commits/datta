
ALTER TABLE public.products
  ADD COLUMN cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN tax_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN promo_price numeric DEFAULT NULL,
  ADD COLUMN promo_active boolean NOT NULL DEFAULT false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.products;

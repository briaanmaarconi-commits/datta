
-- Add stock tracking mode to products
ALTER TABLE public.products
  ADD COLUMN stock_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN direct_stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN direct_min_stock numeric NOT NULL DEFAULT 0;

-- Add constraint for valid stock modes
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_mode_check
  CHECK (stock_mode IN ('none', 'direct', 'recipe'));

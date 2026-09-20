ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS purchase_quantity numeric,
  ADD COLUMN IF NOT EXISTS purchase_unit text;
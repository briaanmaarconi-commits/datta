
-- 1. Add tip_mode to establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS tip_mode text NOT NULL DEFAULT 'individual'
  CHECK (tip_mode IN ('pool', 'individual'));

-- 2. Add tip-related fields to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_payment_method text,
  ADD COLUMN IF NOT EXISTS tip_waiter_id uuid,
  ADD COLUMN IF NOT EXISTS tip_mode text,
  ADD COLUMN IF NOT EXISTS tip_settled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tip_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS tip_settlement_tx_id uuid;

-- 3. Helper function: ensure "Propinas" income category exists (separate from "Ventas")
CREATE OR REPLACE FUNCTION public.ensure_tips_income_category(_establishment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Propinas' AND type = 'income'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Propinas', 'income')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$function$;

-- 4. Helper function: ensure "Pago de propinas" expense category
CREATE OR REPLACE FUNCTION public.ensure_tips_payout_category(_establishment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Pago de propinas' AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Pago de propinas', 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$function$;

-- Index to speed up tip settlement queries
CREATE INDEX IF NOT EXISTS idx_invoices_tip_settlement
  ON public.invoices(establishment_id, tip_settled, tip_payment_method)
  WHERE tip_amount > 0;

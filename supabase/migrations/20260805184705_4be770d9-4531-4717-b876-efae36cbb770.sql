ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS stock_simple_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS unit text;

ALTER TABLE public.purchase_invoice_items
  ALTER COLUMN ingredient_id DROP NOT NULL;

UPDATE public.establishments SET stock_simple_mode = true WHERE name ILIKE '%bodegon 65%' OR name ILIKE '%bodegón 65%';

CREATE OR REPLACE FUNCTION public.ensure_raw_material_expense_category(_establishment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Costo de mercadería' AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Costo de mercadería', 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_ingredient_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.ingredient_id IS NOT NULL THEN
      PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.ingredient_id IS NOT NULL THEN
      PERFORM public.recalculate_ingredient_cost(NEW.ingredient_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.ingredient_id IS NOT NULL AND NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id THEN
      PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _est_auto boolean;
  _simple boolean;
  _cat_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = OLD.finance_transaction_id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT auto_purchase_to_expense, stock_simple_mode
    INTO _est_auto, _simple
  FROM public.establishments WHERE id = NEW.establishment_id;

  IF NEW.auto_expense AND (COALESCE(_simple, false) OR COALESCE(_est_auto, true)) THEN
    IF COALESCE(_simple, false) THEN
      _cat_id := public.ensure_raw_material_expense_category(NEW.establishment_id);
    ELSE
      _cat_id := public.ensure_supplies_expense_category(NEW.establishment_id);
    END IF;

    IF NEW.finance_transaction_id IS NULL THEN
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (NEW.establishment_id, _cat_id, 'expense', NEW.total,
              'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, ''),
              NEW.invoice_date, NEW.created_by)
      RETURNING id INTO NEW.finance_transaction_id;
    ELSE
      UPDATE public.finance_transactions
        SET amount = NEW.total,
            description = 'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, ''),
            date = NEW.invoice_date,
            category_id = _cat_id
        WHERE id = NEW.finance_transaction_id;
    END IF;
  ELSE
    IF NEW.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = NEW.finance_transaction_id;
      NEW.finance_transaction_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
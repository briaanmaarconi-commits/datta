ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS affects_cash boolean NOT NULL DEFAULT true;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.trg_sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _est_auto boolean;
  _simple boolean;
  _cat_id uuid;
  _pm_label text;
  _desc text;
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

  _pm_label := CASE COALESCE(NEW.payment_method, 'cash')
    WHEN 'cash' THEN 'Efectivo'
    WHEN 'transfer' THEN 'Transferencia'
    WHEN 'card' THEN 'Tarjeta'
    WHEN 'check' THEN 'Cheque'
    WHEN 'account' THEN 'Cuenta corriente'
    ELSE 'Otro'
  END;

  _desc := 'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, '') || ' — ' || _pm_label;

  IF NEW.auto_expense AND (COALESCE(_simple, false) OR COALESCE(_est_auto, true)) THEN
    IF COALESCE(_simple, false) THEN
      _cat_id := public.ensure_raw_material_expense_category(NEW.establishment_id);
    ELSE
      _cat_id := public.ensure_supplies_expense_category(NEW.establishment_id);
    END IF;

    IF NEW.finance_transaction_id IS NULL THEN
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by, affects_cash, notes)
      VALUES (NEW.establishment_id, _cat_id, 'expense', NEW.total, _desc, NEW.invoice_date, NEW.created_by, false, NEW.notes)
      RETURNING id INTO NEW.finance_transaction_id;
    ELSE
      UPDATE public.finance_transactions
        SET amount = NEW.total,
            description = _desc,
            date = NEW.invoice_date,
            category_id = _cat_id,
            affects_cash = false,
            notes = NEW.notes
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
$$;

UPDATE public.finance_transactions ft
SET affects_cash = false
FROM public.purchase_invoices pi
WHERE pi.finance_transaction_id = ft.id AND ft.affects_cash = true;
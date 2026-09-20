-- Trigger sobre establishments: al cambiar auto_purchase_to_expense, sincronizar las compras existentes
CREATE OR REPLACE FUNCTION public.trg_sync_existing_purchases_on_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cat_id uuid;
  _purchase record;
  _new_tx_id uuid;
BEGIN
  IF NEW.auto_purchase_to_expense = OLD.auto_purchase_to_expense THEN
    RETURN NEW;
  END IF;

  IF NEW.auto_purchase_to_expense = false THEN
    -- Desactivado: borrar TODAS las finance_transactions vinculadas a compras de este establecimiento
    DELETE FROM public.finance_transactions
     WHERE id IN (
       SELECT finance_transaction_id FROM public.purchase_invoices
        WHERE establishment_id = NEW.id AND finance_transaction_id IS NOT NULL
     );
    UPDATE public.purchase_invoices
       SET finance_transaction_id = NULL
     WHERE establishment_id = NEW.id;
  ELSE
    -- Reactivado: recrear finance_transactions para compras con auto_expense=true que no tengan
    _cat_id := public.ensure_supplies_expense_category(NEW.id);
    FOR _purchase IN
      SELECT * FROM public.purchase_invoices
       WHERE establishment_id = NEW.id
         AND auto_expense = true
         AND finance_transaction_id IS NULL
    LOOP
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (NEW.id, _cat_id, 'expense', _purchase.total,
              'Compra: ' || _purchase.supplier || COALESCE(' #' || _purchase.invoice_number, ''),
              _purchase.invoice_date, _purchase.created_by)
      RETURNING id INTO _new_tx_id;

      UPDATE public.purchase_invoices SET finance_transaction_id = _new_tx_id WHERE id = _purchase.id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_establishments_sync_purchases ON public.establishments;
CREATE TRIGGER trg_establishments_sync_purchases
AFTER UPDATE OF auto_purchase_to_expense ON public.establishments
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_existing_purchases_on_toggle();

-- Trigger para sincronizar compras de ingredientes con caja (salidas)
DROP TRIGGER IF EXISTS trg_purchase_invoices_sync_expense ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_sync_expense
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_purchase_to_expense();

-- Trigger para recalcular costo del ingrediente (promedio ponderado) al cargar items
DROP TRIGGER IF EXISTS trg_purchase_items_recalc_cost ON public.purchase_invoice_items;
CREATE TRIGGER trg_purchase_items_recalc_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_ingredient_on_purchase();

-- Trigger para snapshot de costo al crear order_items
DROP TRIGGER IF EXISTS trg_order_items_cost_snapshot ON public.order_items;
CREATE TRIGGER trg_order_items_cost_snapshot
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_order_item_cost_snapshot();

-- Backfill: para compras existentes con auto_expense=true sin finance_transaction_id, generar la transacción
DO $$
DECLARE
  rec RECORD;
  _cat_id uuid;
  _new_tx uuid;
  _est_auto boolean;
BEGIN
  FOR rec IN
    SELECT pi.* FROM public.purchase_invoices pi
    WHERE pi.auto_expense = true AND pi.finance_transaction_id IS NULL
  LOOP
    SELECT auto_purchase_to_expense INTO _est_auto FROM public.establishments WHERE id = rec.establishment_id;
    IF COALESCE(_est_auto, true) THEN
      _cat_id := public.ensure_supplies_expense_category(rec.establishment_id);
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (rec.establishment_id, _cat_id, 'expense', rec.total,
              'Compra: ' || rec.supplier || COALESCE(' #' || rec.invoice_number, ''),
              rec.invoice_date, rec.created_by)
      RETURNING id INTO _new_tx;
      UPDATE public.purchase_invoices SET finance_transaction_id = _new_tx WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- 1. Settings en establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS auto_purchase_to_expense boolean NOT NULL DEFAULT true;

-- 2. Modo de costo en ingredientes (manual o promedio ponderado)
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS cost_mode text NOT NULL DEFAULT 'weighted_avg' CHECK (cost_mode IN ('manual', 'weighted_avg'));

-- 3. Modo de costo en productos (manual o calculado por receta)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_mode text NOT NULL DEFAULT 'manual' CHECK (cost_mode IN ('manual', 'recipe'));

-- 4. Snapshot de costo en order_items (para reportes históricos)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cost_snapshot numeric NOT NULL DEFAULT 0;

-- 5. Vincular compras con gastos automáticos
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS auto_expense boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS finance_transaction_id uuid;

-- 6. Función: recalcular costo del ingrediente como promedio ponderado de todas las compras
CREATE OR REPLACE FUNCTION public.recalculate_ingredient_cost(_ingredient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mode text;
  _total_qty numeric;
  _total_cost numeric;
  _new_cost numeric;
BEGIN
  SELECT cost_mode INTO _mode FROM public.ingredients WHERE id = _ingredient_id;
  IF _mode <> 'weighted_avg' THEN RETURN; END IF;

  -- Sumar cantidades y montos de todas las compras del ingrediente (en unidad base ya convertida)
  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(quantity * unit_price), 0)
    INTO _total_qty, _total_cost
  FROM public.purchase_invoice_items
  WHERE ingredient_id = _ingredient_id;

  IF _total_qty > 0 THEN
    _new_cost := _total_cost / _total_qty;
    UPDATE public.ingredients SET cost_per_unit = _new_cost, updated_at = now() WHERE id = _ingredient_id;
  END IF;
END;
$$;

-- 7. Trigger: cuando se inserta/actualiza/elimina un item de compra, recalcular costo del ingrediente
CREATE OR REPLACE FUNCTION public.trg_recalc_ingredient_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_ingredient_cost(NEW.ingredient_id);
    IF TG_OP = 'UPDATE' AND NEW.ingredient_id <> OLD.ingredient_id THEN
      PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recalc_ingredient_cost_trigger ON public.purchase_invoice_items;
CREATE TRIGGER recalc_ingredient_cost_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_ingredient_on_purchase();

-- 8. Función: obtener costo calculado de un producto en base a su receta
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(pr.quantity * i.cost_per_unit), 0)
  FROM public.product_recipes pr
  JOIN public.ingredients i ON i.id = pr.ingredient_id
  WHERE pr.product_id = _product_id;
$$;

-- 9. Función: obtener costo efectivo (manual o por receta según modo)
CREATE OR REPLACE FUNCTION public.get_product_effective_cost(_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.cost_mode = 'recipe' THEN public.get_product_recipe_cost(_product_id)
    ELSE p.cost
  END
  FROM public.products p
  WHERE p.id = _product_id;
$$;

-- 10. Trigger en order_items: guardar snapshot de costo al insertar
CREATE OR REPLACE FUNCTION public.trg_set_order_item_cost_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_snapshot IS NULL OR NEW.cost_snapshot = 0 THEN
    NEW.cost_snapshot := public.get_product_effective_cost(NEW.product_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_item_cost_snapshot_trigger ON public.order_items;
CREATE TRIGGER set_order_item_cost_snapshot_trigger
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_set_order_item_cost_snapshot();

-- 11. Asegurar categoría de gastos "Compras de insumos" por establecimiento
CREATE OR REPLACE FUNCTION public.ensure_supplies_expense_category(_establishment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Compras de insumos' AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Compras de insumos', 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$$;

-- 12. Trigger: cuando se inserta/actualiza/elimina una purchase_invoice, sincronizar gasto
CREATE OR REPLACE FUNCTION public.trg_sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _est_auto boolean;
  _cat_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = OLD.finance_transaction_id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT auto_purchase_to_expense INTO _est_auto FROM public.establishments WHERE id = NEW.establishment_id;

  IF NEW.auto_expense AND COALESCE(_est_auto, true) THEN
    _cat_id := public.ensure_supplies_expense_category(NEW.establishment_id);

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
    -- Si se desactivó auto_expense pero había una transacción, eliminarla
    IF NEW.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = NEW.finance_transaction_id;
      NEW.finance_transaction_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_purchase_to_expense_trigger ON public.purchase_invoices;
CREATE TRIGGER sync_purchase_to_expense_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_purchase_to_expense();
ALTER TABLE public.stock_movements ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);

CREATE OR REPLACE FUNCTION public.apply_purchase_stock(_invoice_id uuid, _lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _est uuid;
  _line jsonb;
  _pid uuid;
  _qty numeric;
  _unit_price numeric;
  _name text;
  _cat uuid;
  _cur_stock numeric;
  _cur_cost numeric;
  _new_cost numeric;
  _applied int := 0;
  _created int := 0;
BEGIN
  SELECT establishment_id INTO _est FROM public.purchase_invoices WHERE id = _invoice_id;
  IF _est IS NULL THEN
    RAISE EXCEPTION 'Compra inexistente';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR public.get_user_establishment(auth.uid()) = _est
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR _line IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb))
  LOOP
    _qty := COALESCE((_line->>'quantity')::numeric, 0);
    _unit_price := COALESCE((_line->>'unit_price')::numeric, 0);
    _name := btrim(COALESCE(_line->>'item_name', ''));
    _pid := NULLIF(_line->>'product_id', '')::uuid;

    CONTINUE WHEN _qty <= 0;

    IF _pid IS NULL THEN
      CONTINUE WHEN COALESCE(_line->>'create_product', 'false') <> 'true' OR _name = '';

      SELECT id INTO _cat FROM public.categories
       WHERE establishment_id = _est AND lower(name) = 'sin categoría' LIMIT 1;
      IF _cat IS NULL THEN
        INSERT INTO public.categories (establishment_id, name, sort_order, is_active)
        VALUES (_est, 'Sin categoría', 999, true)
        RETURNING id INTO _cat;
      END IF;

      INSERT INTO public.products (establishment_id, category_id, name, price, cost, is_available, stock_mode, direct_stock, cost_mode)
      VALUES (_est, _cat, _name, 0, _unit_price, false, 'direct', 0, 'manual')
      RETURNING id INTO _pid;
      _created := _created + 1;
    END IF;

    SELECT COALESCE(direct_stock, 0), COALESCE(cost, 0)
      INTO _cur_stock, _cur_cost
    FROM public.products WHERE id = _pid AND establishment_id = _est;

    CONTINUE WHEN NOT FOUND;

    IF (_cur_stock + _qty) > 0 THEN
      _new_cost := ((GREATEST(_cur_stock, 0) * _cur_cost) + (_qty * _unit_price)) / (GREATEST(_cur_stock, 0) + _qty);
    ELSE
      _new_cost := _unit_price;
    END IF;

    UPDATE public.products
       SET direct_stock = COALESCE(direct_stock, 0) + _qty,
           cost = ROUND(_new_cost, 2),
           stock_mode = CASE WHEN stock_mode = 'recipe' THEN stock_mode ELSE 'direct' END,
           cost_mode = CASE WHEN cost_mode = 'recipe' THEN cost_mode ELSE 'manual' END
     WHERE id = _pid;

    INSERT INTO public.stock_movements (establishment_id, product_id, ingredient_id, type, quantity, reason, reference_id, created_by)
    VALUES (_est, _pid, NULL, 'entry', _qty, 'Compra de mercadería', _invoice_id::text, auth.uid());

    _applied := _applied + 1;
  END LOOP;

  RETURN jsonb_build_object('applied', _applied, 'created', _created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_purchase_stock(uuid, jsonb) TO authenticated;
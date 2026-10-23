-- Tercer modo de stock: "Bebidas y tragos" (pensado para bares, p. ej. El Cuartel 10).
--   * Bebidas por unidad (latas, cervezas, vinos): productos con stock directo, cada venta descuenta 1.
--   * Botellas para tragos (fernet, gin, gaseosa de 1,5 L): ingredientes en ml con el tamaño de la botella.
--   * Tragos: productos con receta en onzas (1 oz = 30 ml) de cada botella; al venderse se descuentan los ml.
-- El inventario se arranca con un recuento físico y después se suma con compras.

DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.establishments'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%inventory_mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.establishments DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_inventory_mode_check CHECK (inventory_mode IN ('simple', 'advanced', 'drinks'));

-- Tamaño de la botella en ml: si tiene valor, el ingrediente es una "botella para tragos".
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS bottle_ml numeric CHECK (bottle_ml IS NULL OR bottle_ml > 0);

-- Descuento por ventas al cerrar el pedido: las recetas (tragos) también se descuentan en modo bebidas.
CREATE OR REPLACE FUNCTION public.apply_order_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _advanced boolean;
  _label text;
  _r record;
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_id = NEW.id::text AND type = 'sale') THEN
      RETURN NULL; -- ya descontado
    END IF;
    SELECT inventory_mode IN ('advanced', 'drinks') INTO _advanced FROM public.establishments WHERE id = NEW.establishment_id;
    _label := CASE
      WHEN NEW.channel = 'delivery' THEN 'Venta delivery'
      WHEN NEW.table_id IS NOT NULL THEN 'Venta mesa ' || coalesce((SELECT t.number::text FROM public.tables t WHERE t.id = NEW.table_id), '-')
      ELSE 'Venta'
    END;

    -- Productos por unidad o porción (en todos los modos).
    FOR _r IN
      SELECT oi.product_id, sum(oi.quantity)::numeric AS q
        FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
       WHERE oi.order_id = NEW.id AND p.stock_mode = 'direct'
       GROUP BY oi.product_id
    LOOP
      UPDATE public.products SET direct_stock = direct_stock - _r.q WHERE id = _r.product_id;
      INSERT INTO public.stock_movements (establishment_id, product_id, type, quantity, reason, reference_id)
      VALUES (NEW.establishment_id, _r.product_id, 'sale', -_r.q, _label, NEW.id::text);
    END LOOP;

    -- Platos o tragos por receta (modo avanzado y modo bebidas): ingrediente x cantidad, corregido por rendimiento.
    IF coalesce(_advanced, false) THEN
      FOR _r IN
        SELECT pr.ingredient_id,
               sum(oi.quantity * pr.quantity * 100 / coalesce(nullif(i.yield_pct, 0), 100))::numeric AS q
          FROM public.order_items oi
          JOIN public.products p ON p.id = oi.product_id AND p.stock_mode = 'recipe'
          JOIN public.product_recipes pr ON pr.product_id = p.id
          JOIN public.ingredients i ON i.id = pr.ingredient_id
         WHERE oi.order_id = NEW.id
         GROUP BY pr.ingredient_id
      LOOP
        UPDATE public.ingredients SET current_stock = current_stock - _r.q WHERE id = _r.ingredient_id;
        INSERT INTO public.stock_movements (establishment_id, ingredient_id, type, quantity, reason, reference_id)
        VALUES (NEW.establishment_id, _r.ingredient_id, 'sale', -_r.q, _label, NEW.id::text);
      END LOOP;
    END IF;

  ELSIF OLD.status = 'closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
    FOR _r IN SELECT * FROM public.stock_movements WHERE reference_id = NEW.id::text AND type = 'sale' LOOP
      IF _r.product_id IS NOT NULL THEN
        UPDATE public.products SET direct_stock = direct_stock + abs(_r.quantity) WHERE id = _r.product_id;
      ELSIF _r.ingredient_id IS NOT NULL THEN
        UPDATE public.ingredients SET current_stock = current_stock + abs(_r.quantity) WHERE id = _r.ingredient_id;
      END IF;
    END LOOP;
    DELETE FROM public.stock_movements WHERE reference_id = NEW.id::text AND type = 'sale';
  END IF;
  RETURN NULL;
END $$;

-- Recuento físico (también la carga inicial): deja el stock en lo contado y registra la diferencia.
-- _lines: [{ "kind": "product" | "bottle", "id": uuid, "counted": unidades o botellas (admite 2.5) }]
CREATE OR REPLACE FUNCTION public.register_drinks_count(_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _l jsonb; _est uuid; _prev numeric; _new numeric; _ml numeric; _n int := 0;
BEGIN
  FOR _l IN SELECT * FROM jsonb_array_elements(coalesce(_lines, '[]'::jsonb)) LOOP
    IF (_l->>'counted') IS NULL OR (_l->>'counted')::numeric < 0 THEN
      RAISE EXCEPTION 'La cantidad contada no puede ser negativa' USING ERRCODE = '22023';
    END IF;
    _est := NULL;
    IF _l->>'kind' = 'product' THEN
      SELECT establishment_id, direct_stock INTO _est, _prev FROM public.products WHERE id = (_l->>'id')::uuid;
      _new := (_l->>'counted')::numeric;
    ELSIF _l->>'kind' = 'bottle' THEN
      SELECT establishment_id, current_stock, bottle_ml INTO _est, _prev, _ml FROM public.ingredients WHERE id = (_l->>'id')::uuid;
      _new := round((_l->>'counted')::numeric * coalesce(_ml, 1), 2);
    ELSE
      RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023';
    END IF;
    IF _est IS NULL OR NOT public.can_manage_stock(_est) THEN
      RAISE EXCEPTION 'No tenés permiso para cargar stock en este local' USING ERRCODE = '42501';
    END IF;
    IF _new = coalesce(_prev, 0) THEN CONTINUE; END IF;
    IF _l->>'kind' = 'product' THEN
      UPDATE public.products SET direct_stock = _new, stock_mode = 'direct' WHERE id = (_l->>'id')::uuid;
      INSERT INTO public.stock_movements (establishment_id, product_id, type, quantity, reason, created_by)
      VALUES (_est, (_l->>'id')::uuid, 'adjustment', _new - coalesce(_prev, 0), 'Recuento físico', auth.uid());
    ELSE
      UPDATE public.ingredients SET current_stock = _new, updated_at = now() WHERE id = (_l->>'id')::uuid;
      INSERT INTO public.stock_movements (establishment_id, ingredient_id, type, quantity, reason, created_by)
      VALUES (_est, (_l->>'id')::uuid, 'adjustment', _new - coalesce(_prev, 0), 'Recuento físico', auth.uid());
    END IF;
    _n := _n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'changed', _n);
END $$;

-- Compra de bebidas: queda como compra (y gasto, como las demás compras) y suma el stock.
-- _lines: [{ "kind": "product" | "bottle", "id": uuid, "quantity": unidades o botellas, "unit_price": precio por unidad o botella }]
CREATE OR REPLACE FUNCTION public.register_drinks_purchase(
  _est uuid, _supplier text, _date date, _payment_method text, _notes text, _lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _l jsonb; _inv uuid; _total numeric := 0; _q numeric; _price numeric; _name text; _ml numeric; _owner uuid;
BEGIN
  IF NOT public.can_manage_stock(_est) THEN
    RAISE EXCEPTION 'No tenés permiso para cargar compras en este local' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_supplier), '') IS NULL THEN RAISE EXCEPTION 'Ingresá el proveedor' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(coalesce(_lines, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Agregá al menos una bebida' USING ERRCODE = '22023'; END IF;

  SELECT coalesce(sum((l->>'quantity')::numeric * coalesce((l->>'unit_price')::numeric, 0)), 0) INTO _total
    FROM jsonb_array_elements(_lines) l;

  INSERT INTO public.purchase_invoices (establishment_id, supplier, invoice_date, total, notes, payment_method, auto_expense, created_by)
  VALUES (_est, btrim(_supplier), coalesce(_date, current_date), round(_total, 2), nullif(btrim(_notes), ''), _payment_method, true, auth.uid())
  RETURNING id INTO _inv;

  FOR _l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _q := (_l->>'quantity')::numeric;
    _price := coalesce((_l->>'unit_price')::numeric, 0);
    IF _q IS NULL OR _q <= 0 THEN RAISE EXCEPTION 'La cantidad tiene que ser mayor a cero' USING ERRCODE = '22023'; END IF;
    _owner := NULL;
    IF _l->>'kind' = 'product' THEN
      SELECT name, establishment_id INTO _name, _owner FROM public.products WHERE id = (_l->>'id')::uuid;
      IF _owner IS DISTINCT FROM _est THEN RAISE EXCEPTION 'Producto inválido' USING ERRCODE = '22023'; END IF;
      INSERT INTO public.purchase_invoice_items (invoice_id, ingredient_id, item_name, unit, quantity, unit_price)
      VALUES (_inv, NULL, _name, 'unidad', _q, _price);
      UPDATE public.products SET direct_stock = direct_stock + _q, stock_mode = 'direct',
             cost = CASE WHEN _price > 0 THEN _price ELSE cost END
       WHERE id = (_l->>'id')::uuid;
      INSERT INTO public.stock_movements (establishment_id, product_id, type, quantity, reason, reference_id, created_by)
      VALUES (_est, (_l->>'id')::uuid, 'entry', _q, 'Compra a ' || btrim(_supplier), _inv::text, auth.uid());
    ELSIF _l->>'kind' = 'bottle' THEN
      SELECT name, establishment_id, bottle_ml INTO _name, _owner, _ml FROM public.ingredients WHERE id = (_l->>'id')::uuid;
      IF _owner IS DISTINCT FROM _est OR _ml IS NULL THEN RAISE EXCEPTION 'Botella inválida' USING ERRCODE = '22023'; END IF;
      -- El ítem de compra va en ml (unidad del ingrediente) para que el costo por ml se calcule solo.
      INSERT INTO public.purchase_invoice_items (invoice_id, ingredient_id, item_name, unit, quantity, unit_price)
      VALUES (_inv, (_l->>'id')::uuid, _name, 'ml', _q * _ml, _price / _ml);
      UPDATE public.ingredients SET current_stock = current_stock + _q * _ml,
             cost_per_unit = CASE WHEN _price > 0 AND cost_mode <> 'weighted_avg' THEN _price / _ml ELSE cost_per_unit END,
             updated_at = now()
       WHERE id = (_l->>'id')::uuid;
      INSERT INTO public.stock_movements (establishment_id, ingredient_id, type, quantity, reason, reference_id, created_by)
      VALUES (_est, (_l->>'id')::uuid, 'entry', _q * _ml, 'Compra a ' || btrim(_supplier), _inv::text, auth.uid());
    ELSE
      RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'id', _inv, 'total', round(_total, 2));
END $$;

REVOKE ALL ON FUNCTION public.register_drinks_count(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_drinks_purchase(uuid, text, date, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_drinks_count(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_drinks_purchase(uuid, text, date, text, text, jsonb) TO authenticated;

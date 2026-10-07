-- Gestión de stock en dos modos, elegidos por cada local:
--   simple   = por porciones o unidades (cada venta descuenta 1 del producto).
--   advanced = por ingredientes (cada venta descuenta lo que lleva la receta), más productos
--              que se cuentan por unidad o porción (bebidas, postres, empanadas).
-- El descuento por ventas lo hace la base al cerrar (cobrar) el pedido, sea mesa, delivery o caja.

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS inventory_mode text CHECK (inventory_mode IN ('simple', 'advanced'));

-- Locales existentes: se respeta lo que venían usando; si no usaban nada, eligen al entrar.
UPDATE public.establishments e SET inventory_mode = CASE
    WHEN e.stock_simple_mode THEN 'simple'
    WHEN EXISTS (SELECT 1 FROM public.products p WHERE p.establishment_id = e.id AND p.stock_mode = 'recipe')
      OR EXISTS (SELECT 1 FROM public.ingredients i WHERE i.establishment_id = e.id) THEN 'advanced'
    WHEN EXISTS (SELECT 1 FROM public.products p WHERE p.establishment_id = e.id AND p.stock_mode = 'direct') THEN 'simple'
  END
 WHERE e.inventory_mode IS NULL;

-- Rendimiento opcional del ingrediente (1 kg de carne cruda rinde 80% limpio => se descuenta más).
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS yield_pct numeric CHECK (yield_pct IS NULL OR (yield_pct > 0 AND yield_pct <= 100));

-- Mermas: motivo normalizado y plata perdida.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS waste_reason text CHECK (waste_reason IS NULL OR waste_reason IN ('expired', 'burned', 'broken', 'staff', 'other')),
  ADD COLUMN IF NOT EXISTS value numeric;
CREATE INDEX IF NOT EXISTS stock_movements_ref_idx ON public.stock_movements (reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_est_type_idx ON public.stock_movements (establishment_id, type, created_at DESC);

-- Descuento por ventas al cerrar el pedido (y devolución si un pedido cerrado se reabre o anula).
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
    SELECT inventory_mode = 'advanced' INTO _advanced FROM public.establishments WHERE id = NEW.establishment_id;
    _label := CASE
      WHEN NEW.channel = 'delivery' THEN 'Venta delivery'
      WHEN NEW.table_id IS NOT NULL THEN 'Venta mesa ' || coalesce((SELECT t.number::text FROM public.tables t WHERE t.id = NEW.table_id), '-')
      ELSE 'Venta'
    END;

    -- Productos por unidad o porción (en los dos modos).
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

    -- Platos por receta (solo en modo avanzado): ingrediente x cantidad, corregido por rendimiento.
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
DROP TRIGGER IF EXISTS apply_order_stock ON public.orders;
CREATE TRIGGER apply_order_stock AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.apply_order_stock();

-- La función vieja (por comprobante) queda sin efecto: el descuento ya lo hizo el cierre del pedido.
CREATE OR REPLACE FUNCTION public.apply_sale_stock(_invoice_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok', true, 'skipped', true, 'reason', 'el stock se descuenta al cerrar el pedido')
$$;

-- Quién puede mover stock: admin o cajero del local (o el superadmin).
CREATE OR REPLACE FUNCTION public.can_manage_stock(_est uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin(auth.uid()) OR public.is_establishment_manager(auth.uid(), _est)
$$;

-- Registrar una merma: descuenta el stock y guarda cuánta plata se perdió.
CREATE OR REPLACE FUNCTION public.register_waste(_kind text, _item_id uuid, _quantity numeric, _reason text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _est uuid; _unit_cost numeric; _value numeric; _label text; _mov uuid;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'La cantidad tiene que ser mayor a cero' USING ERRCODE = '22023'; END IF;
  IF _reason NOT IN ('expired', 'burned', 'broken', 'staff', 'other') THEN RAISE EXCEPTION 'Motivo inválido' USING ERRCODE = '22023'; END IF;
  _label := CASE _reason WHEN 'expired' THEN 'Vencido' WHEN 'burned' THEN 'Se quemó o se cayó' WHEN 'broken' THEN 'Rotura'
                         WHEN 'staff' THEN 'Consumo del personal' ELSE 'Otro' END
            || CASE WHEN nullif(btrim(_note), '') IS NOT NULL THEN ': ' || btrim(_note) ELSE '' END;

  IF _kind = 'ingredient' THEN
    SELECT establishment_id, cost_per_unit INTO _est, _unit_cost FROM public.ingredients WHERE id = _item_id;
  ELSIF _kind = 'product' THEN
    SELECT establishment_id, cost INTO _est, _unit_cost FROM public.products WHERE id = _item_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023';
  END IF;
  IF _est IS NULL OR NOT public.can_manage_stock(_est) THEN
    RAISE EXCEPTION 'No tenés permiso para registrar mermas en este local' USING ERRCODE = '42501';
  END IF;

  _value := round(coalesce(_unit_cost, 0) * _quantity, 2);
  IF _kind = 'ingredient' THEN
    UPDATE public.ingredients SET current_stock = current_stock - _quantity WHERE id = _item_id;
    INSERT INTO public.stock_movements (establishment_id, ingredient_id, type, quantity, reason, waste_reason, value, created_by)
    VALUES (_est, _item_id, 'waste', -_quantity, _label, _reason, _value, auth.uid()) RETURNING id INTO _mov;
  ELSE
    UPDATE public.products SET direct_stock = direct_stock - _quantity WHERE id = _item_id;
    INSERT INTO public.stock_movements (establishment_id, product_id, type, quantity, reason, waste_reason, value, created_by)
    VALUES (_est, _item_id, 'waste', -_quantity, _label, _reason, _value, auth.uid()) RETURNING id INTO _mov;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', _mov, 'value', _value);
END $$;

-- Sumar unidades o porciones a un producto (llegó mercadería, se porcionó carne, etc.).
CREATE OR REPLACE FUNCTION public.add_product_stock(_product_id uuid, _quantity numeric, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _est uuid; _stock numeric;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'La cantidad tiene que ser mayor a cero' USING ERRCODE = '22023'; END IF;
  SELECT establishment_id INTO _est FROM public.products WHERE id = _product_id;
  IF _est IS NULL OR NOT public.can_manage_stock(_est) THEN
    RAISE EXCEPTION 'No tenés permiso para cargar stock en este local' USING ERRCODE = '42501';
  END IF;
  UPDATE public.products SET direct_stock = direct_stock + _quantity, stock_mode = 'direct'
   WHERE id = _product_id RETURNING direct_stock INTO _stock;
  INSERT INTO public.stock_movements (establishment_id, product_id, type, quantity, reason, created_by)
  VALUES (_est, _product_id, 'entry', _quantity, coalesce(nullif(btrim(_note), ''), 'Ingreso de stock'), auth.uid());
  RETURN jsonb_build_object('ok', true, 'stock', _stock);
END $$;

REVOKE ALL ON FUNCTION public.register_waste(text, uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_product_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_waste(text, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_product_stock(uuid, numeric, text) TO authenticated;

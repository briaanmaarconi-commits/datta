CREATE OR REPLACE FUNCTION public.apply_sale_stock(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv record;
  _est uuid;
  _rec record;
  _count int := 0;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF _inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  END IF;

  _est := public.get_user_establishment(auth.uid());
  IF _est IS NULL OR (_est <> _inv.establishment_id AND NOT public.is_superadmin(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotencia: si ya se descontó para este comprobante, no repetir
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = _invoice_id::text AND type = 'sale'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  FOR _rec IN
    SELECT oi.product_id, SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = ANY(_inv.order_ids)
      AND p.stock_mode = 'direct'
      AND p.establishment_id = _inv.establishment_id
    GROUP BY oi.product_id
  LOOP
    UPDATE public.products
      SET direct_stock = direct_stock - _rec.qty
      WHERE id = _rec.product_id;

    INSERT INTO public.stock_movements
      (establishment_id, product_id, type, quantity, reason, reference_id, created_by)
    VALUES
      (_inv.establishment_id, _rec.product_id, 'sale', _rec.qty,
       'Venta mesa ' || COALESCE(_inv.table_number::text, '-'), _invoice_id::text, auth.uid());

    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'products', _count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_sale_stock(uuid) TO authenticated;
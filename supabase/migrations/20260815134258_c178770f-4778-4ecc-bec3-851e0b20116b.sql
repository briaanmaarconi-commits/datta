CREATE OR REPLACE FUNCTION public.trg_audit_order_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _establishment_id uuid;
  _table_number integer;
  _product_name text;
BEGIN
  SELECT o.establishment_id, t.number
    INTO _establishment_id, _table_number
  FROM public.orders o
  LEFT JOIN public.tables t ON t.id = o.table_id
  WHERE o.id = OLD.order_id;

  IF _establishment_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT p.name INTO _product_name FROM public.products p WHERE p.id = OLD.product_id;

  INSERT INTO public.audit_logs (user_id, establishment_id, action, table_name, record_id, details)
  VALUES (
    auth.uid(),
    _establishment_id,
    'item_deleted',
    'order_items',
    OLD.id::text,
    jsonb_build_object(
      'product', COALESCE(_product_name, 'desconocido'),
      'product_id', OLD.product_id,
      'qty', OLD.quantity,
      'unit_price', OLD.unit_price,
      'order_id', OLD.order_id,
      'table_number', _table_number,
      'item_status', OLD.status,
      'notes', OLD.notes
    )
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_order_item_delete ON public.order_items;
CREATE TRIGGER audit_order_item_delete
AFTER DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_order_item_delete();
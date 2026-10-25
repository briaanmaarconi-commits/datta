-- Un pedido se cobra una sola vez.
-- Un doble toque en "Cobrar" lanzaba dos cobros completos casi al mismo tiempo: dos comprobantes
-- y dos ingresos del mismo pedido (Bodegón 65: 30/09, 17/10 y 24/10 mesa 8 $58.000). El efectivo
-- esperado del turno sumaba el cobro dos veces.
-- La base rechaza ahora un comprobante cuyo pedido ya tiene otro (error 23505). El bloqueo por
-- pedido hace que dos cobros simultáneos se esperen: el segundo ve el comprobante del primero.
-- No toca los duplicados viejos; solo controla los comprobantes nuevos. Idempotente.

CREATE OR REPLACE FUNCTION public.invoices_one_per_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_id uuid;
  _existing integer;
BEGIN
  IF NEW.order_ids IS NULL OR cardinality(NEW.order_ids) = 0 THEN
    RETURN NEW;
  END IF;

  -- Orden fijo para que dos cobros de la misma mesa no se traben entre sí.
  FOR _order_id IN SELECT DISTINCT unnest(NEW.order_ids) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('invoice_order:' || _order_id::text, 0));
  END LOOP;

  SELECT i.invoice_number INTO _existing
  FROM public.invoices i
  WHERE i.establishment_id = NEW.establishment_id
    AND i.order_ids && NEW.order_ids
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Esta mesa ya fue cobrada (comprobante %)', _existing
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_one_per_order ON public.invoices;
CREATE TRIGGER invoices_one_per_order
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_one_per_order();

CREATE INDEX IF NOT EXISTS idx_invoices_order_ids ON public.invoices USING gin (order_ids);

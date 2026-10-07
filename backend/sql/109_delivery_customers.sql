-- Delivery propio (pedidos por teléfono): ficha de clientes del local, con dirección y consentimiento
-- para promociones por WhatsApp. Cada pedido queda enlazado al cliente.

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  phone text NOT NULL CHECK (char_length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 6 AND 20),
  -- solo dígitos: para encontrar al cliente aunque escriban el teléfono con espacios o guiones
  phone_digits text GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
  street_address text,
  dwelling_type text NOT NULL DEFAULT 'house' CHECK (dwelling_type IN ('house', 'apartment')),
  floor text,
  apartment text,
  address_notes text,
  -- Consentimiento expreso para recibir promociones (Ley 25.326): nunca se marca por defecto.
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  whatsapp_opt_in_at timestamptz,
  orders_count integer NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, phone_digits)
);
CREATE INDEX IF NOT EXISTS customers_est_name_idx ON public.customers (establishment_id, full_name);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders (customer_id) WHERE customer_id IS NOT NULL;

-- Fecha del consentimiento y updated_at los pone el servidor.
CREATE OR REPLACE FUNCTION public.customers_before_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  NEW.phone := btrim(NEW.phone);
  IF NEW.dwelling_type = 'house' THEN
    NEW.floor := NULL;
    NEW.apartment := NULL;
  END IF;
  IF NEW.whatsapp_opt_in AND (TG_OP = 'INSERT' OR NOT OLD.whatsapp_opt_in) THEN
    NEW.whatsapp_opt_in_at := now();
  ELSIF NOT NEW.whatsapp_opt_in THEN
    NEW.whatsapp_opt_in_at := NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND current_setting('datta.customer_stats', true) = 'on' THEN
    NULL; -- actualización interna de totales al cerrar un pedido
  ELSIF TG_OP = 'UPDATE' THEN
    -- los totales solo los mueve el cierre de pedidos
    NEW.orders_count := OLD.orders_count;
    NEW.total_spent := OLD.total_spent;
    NEW.last_order_at := OLD.last_order_at;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.orders_count := 0;
    NEW.total_spent := 0;
    NEW.last_order_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customers_before_write ON public.customers;
CREATE TRIGGER customers_before_write BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_before_write();

-- Al cerrar (cobrar) un pedido de un cliente se actualiza su historial. Un pedido cerrado que se
-- reabre o anula descuenta lo sumado.
CREATE OR REPLACE FUNCTION public.orders_customer_stats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('datta.customer_stats', 'on', true);
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    UPDATE public.customers
       SET orders_count = orders_count + 1, total_spent = total_spent + coalesce(NEW.total, 0), last_order_at = now()
     WHERE id = NEW.customer_id;
  ELSIF OLD.status = 'closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
    UPDATE public.customers
       SET orders_count = greatest(orders_count - 1, 0), total_spent = greatest(total_spent - coalesce(OLD.total, 0), 0)
     WHERE id = NEW.customer_id;
  END IF;
  PERFORM set_config('datta.customer_stats', 'off', true);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS orders_customer_stats ON public.orders;
CREATE TRIGGER orders_customer_stats AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_customer_stats();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customers FROM anon;
DROP POLICY IF EXISTS "Superadmin full access customers" ON public.customers;
CREATE POLICY "Superadmin full access customers" ON public.customers
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Managers manage own customers" ON public.customers;
CREATE POLICY "Managers manage own customers" ON public.customers
  FOR ALL TO authenticated
  USING (public.is_establishment_manager(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_manager(auth.uid(), establishment_id));

DROP TRIGGER IF EXISTS notify_change_customers ON public.customers;
CREATE TRIGGER notify_change_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_change();

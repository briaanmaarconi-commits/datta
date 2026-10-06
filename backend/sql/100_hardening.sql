-- Endurecimiento sobre el esquema heredado de Supabase.
-- Corrige fugas entre establecimientos y huecos detectados en la auditoría y agrega
-- lo necesario para el backend propio (sesiones, notificaciones en tiempo real).

-- 1) El rol anon queda sin acceso: la carta pública/QR pasa por /api/public/*
--    (que valida mesa↔establecimiento y corre con privilegios acotados en el backend).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- 2) Policies "públicas" que también aplicaban a usuarios autenticados de OTROS
--    establecimientos (leían costos/stock de productos ajenos, creaban pedidos en
--    cualquier local, etc.). El personal sigue accediendo por sus policies por establecimiento.
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Public can view available products" ON public.products;
DROP POLICY IF EXISTS "Public can view tables" ON public.tables;
DROP POLICY IF EXISTS "Public can view sectors" ON public.sectors;
DROP POLICY IF EXISTS "Public can view active combos" ON public.menu_combos;
DROP POLICY IF EXISTS "Public can view items of active combos" ON public.menu_combo_items;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can create waiter calls" ON public.waiter_calls;
DROP POLICY IF EXISTS "Anyone can insert product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Anyone can insert waiter reviews" ON public.waiter_reviews;
DROP POLICY IF EXISTS "Anyone can view product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Anyone can view waiter reviews" ON public.waiter_reviews;
DROP POLICY IF EXISTS "Public can view active establishment basic info" ON public.establishments;

DROP POLICY IF EXISTS "Staff can view establishment product reviews" ON public.product_reviews;
CREATE POLICY "Staff can view establishment product reviews" ON public.product_reviews
  FOR SELECT TO authenticated
  USING (establishment_id = public.get_user_establishment(auth.uid()));
DROP POLICY IF EXISTS "Staff can view establishment waiter reviews" ON public.waiter_reviews;
CREATE POLICY "Staff can view establishment waiter reviews" ON public.waiter_reviews
  FOR SELECT TO authenticated
  USING (establishment_id = public.get_user_establishment(auth.uid()));

-- 3) Triggers duplicados (cada uno se ejecutaba dos veces con la misma función).
DROP TRIGGER IF EXISTS trg_order_items_cost_snapshot ON public.order_items;
DROP TRIGGER IF EXISTS trg_purchase_items_recalc_cost ON public.purchase_invoice_items;
DROP TRIGGER IF EXISTS trg_purchase_invoices_sync_expense ON public.purchase_invoices;

-- 4) Un admin/cajero de un local no puede cambiar plan, precio acordado ni estado del servicio
--    de su propio establecimiento (antes el UPDATE no tenía restricción de columnas).
CREATE OR REPLACE FUNCTION public.guard_establishment_sensitive_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.agreed_price IS DISTINCT FROM OLD.agreed_price
     OR NEW.service_status IS DISTINCT FROM OLD.service_status
     OR NEW.service_start_date IS DISTINCT FROM OLD.service_start_date
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'No tenés permiso para modificar plan, precio o estado del servicio' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_establishment_sensitive_columns ON public.establishments;
CREATE TRIGGER guard_establishment_sensitive_columns
  BEFORE UPDATE ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.guard_establishment_sensitive_columns();

-- 5) Claves AFIP: nadie las lee ni escribe desde el cliente; solo el backend (service_role).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='afip_certificates' LOOP
    EXECUTE format('DROP POLICY %I ON public.afip_certificates', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.afip_certificates FROM authenticated;

-- 6) Sesiones del backend (cookie opaca; se guarda solo el hash del token).
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_agent text,
  ip text
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions(user_id);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sessions FROM authenticated, anon;
GRANT ALL ON public.sessions TO service_role;

-- 7) Tiempo real: cada cambio se publica por LISTEN/NOTIFY y el backend lo reparte por SSE.
CREATE OR REPLACE FUNCTION public.notify_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; est uuid; payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  -- IF/ELSIF (no CASE): plpgsql resuelve los campos de r al planificar toda la expresión.
  IF TG_TABLE_NAME = 'order_items' THEN
    SELECT o.establishment_id INTO est FROM public.orders o WHERE o.id = r.order_id;
  ELSIF TG_TABLE_NAME = 'product_recipes' THEN
    SELECT p.establishment_id INTO est FROM public.products p WHERE p.id = r.product_id;
  ELSE
    est := r.establishment_id;
  END IF;
  payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'id', r.id, 'est', est);
  IF TG_TABLE_NAME = 'waiter_calls' AND TG_OP = 'INSERT' THEN
    payload := payload || jsonb_build_object('new', to_jsonb(NEW));
  END IF;
  PERFORM pg_notify('datta_changes', payload::text);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tables','orders','order_items','products','waiter_calls','shift_controls',
                           'invoices','fiscal_invoices','reservations','ai_insights','ingredients','product_recipes']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS notify_change_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER notify_change_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.notify_change()', t);
  END LOOP;
END $$;

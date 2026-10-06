-- Suscripciones: estado del servicio por cliente, cobro automático (Mercado Pago), historial y ajustes.
-- service_status: trial | active | past_due | suspended | cancelled (texto, ya existía con active/suspended/cancelled).
-- Un cliente con next_due_date NULL no tiene facturación configurada: el barrido diario no lo toca
-- (así los clientes actuales no se suspenden por sorpresa hasta que el superadmin los configure).

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS trial_ends_at date,
  ADD COLUMN IF NOT EXISTS next_due_date date,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id text,
  ADD COLUMN IF NOT EXISTS mp_payer_email text,
  ADD COLUMN IF NOT EXISTS mp_init_point text,
  ADD COLUMN IF NOT EXISTS mp_status text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS establishments_mp_preapproval_key
  ON public.establishments (mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

-- Un admin/cajero de un local no puede tocar su propia facturación (solo superadmin o el backend).
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
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.next_due_date IS DISTINCT FROM OLD.next_due_date
     OR NEW.mp_preapproval_id IS DISTINCT FROM OLD.mp_preapproval_id
     OR NEW.mp_payer_email IS DISTINCT FROM OLD.mp_payer_email
     OR NEW.mp_init_point IS DISTINCT FROM OLD.mp_init_point
     OR NEW.mp_status IS DISTINCT FROM OLD.mp_status
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'No tenés permiso para modificar plan, precio, estado del servicio o facturación' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Pagos: ahora pueden venir de Mercado Pago (varios reintentos por mes); el único por período solo rige para los manuales.
ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS mp_status text;
ALTER TABLE public.client_payments DROP CONSTRAINT IF EXISTS client_payments_establishment_id_period_month_period_year_key;
CREATE UNIQUE INDEX IF NOT EXISTS client_payments_manual_period_key
  ON public.client_payments (establishment_id, period_month, period_year) WHERE source = 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS client_payments_mp_payment_key
  ON public.client_payments (mp_payment_id) WHERE mp_payment_id IS NOT NULL;

-- Cada cobro queda reflejado en Caja Datta, enlazado al pago (evita duplicados).
ALTER TABLE public.datta_transactions
  ADD COLUMN IF NOT EXISTS client_payment_id uuid UNIQUE REFERENCES public.client_payments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_est_idx ON public.subscription_events (establishment_id, created_at DESC);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmin full access subscription_events" ON public.subscription_events;
CREATE POLICY "Superadmin full access subscription_events" ON public.subscription_events
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmin full access app_settings" ON public.app_settings;
CREATE POLICY "Superadmin full access app_settings" ON public.app_settings
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
INSERT INTO public.app_settings (key, value) VALUES ('billing_grace_days', '25'::jsonb), ('plan_price', '0'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Plan único: "Datta" (el precio lo define el dueño). Los clientes actuales conservan su agreed_price.
UPDATE public.client_plans SET name = 'Datta', description = 'Plan único de Datta', price = 0 WHERE name = 'Básico';
UPDATE public.client_plans SET is_active = false WHERE name IN ('Avanzado', 'Premium');

INSERT INTO public.datta_finance_categories (name, type)
SELECT 'Suscripciones', 'income'
WHERE NOT EXISTS (SELECT 1 FROM public.datta_finance_categories WHERE name = 'Suscripciones');

-- Un local suspendido/cancelado/inactivo deja de ser visible para la carta pública (QR) de los clientes.
CREATE OR REPLACE FUNCTION public.establishment_serviceable(_est uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.establishments e
     WHERE e.id = _est AND e.is_active AND e.service_status NOT IN ('suspended', 'cancelled')
  )
$$;
REVOKE ALL ON FUNCTION public.establishment_serviceable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.establishment_serviceable(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "anon reads active categories" ON public.categories;
CREATE POLICY "anon reads active categories" ON public.categories FOR SELECT TO anon
  USING (is_active AND public.establishment_serviceable(establishment_id));
DROP POLICY IF EXISTS "anon reads available products" ON public.products;
CREATE POLICY "anon reads available products" ON public.products FOR SELECT TO anon
  USING (is_available AND public.establishment_serviceable(establishment_id));
DROP POLICY IF EXISTS "anon reads tables" ON public.tables;
CREATE POLICY "anon reads tables" ON public.tables FOR SELECT TO anon
  USING (public.establishment_serviceable(establishment_id));
DROP POLICY IF EXISTS "anon reads active combos" ON public.menu_combos;
CREATE POLICY "anon reads active combos" ON public.menu_combos FOR SELECT TO anon
  USING (is_active AND public.establishment_serviceable(establishment_id));
DROP POLICY IF EXISTS "anon reads items of active combos" ON public.menu_combo_items;
CREATE POLICY "anon reads items of active combos" ON public.menu_combo_items FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.menu_combos mc WHERE mc.id = combo_id AND mc.is_active AND public.establishment_serviceable(mc.establishment_id)));
DROP POLICY IF EXISTS "anon reads product reviews" ON public.product_reviews;
CREATE POLICY "anon reads product reviews" ON public.product_reviews FOR SELECT TO anon
  USING (public.establishment_serviceable(establishment_id));
DROP POLICY IF EXISTS "anon reads active establishments" ON public.establishments;
CREATE POLICY "anon reads active establishments" ON public.establishments FOR SELECT TO anon
  USING (public.establishment_serviceable(id));


-- Table: client_plans (available subscription plans)
CREATE TABLE public.client_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text,
  features text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access client_plans"
  ON public.client_plans FOR ALL
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Authenticated can view active plans"
  ON public.client_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Extend establishments with SaaS fields
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.client_plans(id),
  ADD COLUMN IF NOT EXISTS agreed_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS service_start_date date,
  ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'active';

-- Table: datta_finance_categories
CREATE TABLE public.datta_finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.datta_finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access datta_finance_categories"
  ON public.datta_finance_categories FOR ALL
  USING (is_superadmin(auth.uid()));

-- Table: datta_transactions (Datta company finances)
CREATE TABLE public.datta_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  category_id uuid NOT NULL REFERENCES public.datta_finance_categories(id),
  establishment_id uuid REFERENCES public.establishments(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.datta_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access datta_transactions"
  ON public.datta_transactions FOR ALL
  USING (is_superadmin(auth.uid()));

-- Insert default finance categories for Datta
INSERT INTO public.datta_finance_categories (name, type) VALUES
  ('Suscripciones', 'income'),
  ('Servicios adicionales', 'income'),
  ('Salarios', 'expense'),
  ('Infraestructura', 'expense'),
  ('Marketing', 'expense'),
  ('Otros ingresos', 'income'),
  ('Otros gastos', 'expense');

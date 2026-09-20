
-- Expense/income categories per establishment
CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage finance_categories" ON public.finance_categories
  FOR ALL USING (has_role(auth.uid(), 'admin') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access finance_categories" ON public.finance_categories
  FOR ALL USING (is_superadmin(auth.uid()));

-- Finance transactions (income / expenses)
CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.finance_categories(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL DEFAULT 0,
  description text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage finance_transactions" ON public.finance_transactions
  FOR ALL USING (has_role(auth.uid(), 'admin') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access finance_transactions" ON public.finance_transactions
  FOR ALL USING (is_superadmin(auth.uid()));

-- Shift controls (mark shifts as reviewed/controlled)
CREATE TABLE public.shift_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  is_controlled boolean NOT NULL DEFAULT false,
  controlled_by uuid REFERENCES public.profiles(id),
  controlled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(establishment_id, shift_date)
);

ALTER TABLE public.shift_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage shift_controls" ON public.shift_controls
  FOR ALL USING (has_role(auth.uid(), 'admin') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access shift_controls" ON public.shift_controls
  FOR ALL USING (is_superadmin(auth.uid()));

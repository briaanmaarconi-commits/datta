CREATE TABLE public.courtesy_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courtesy_accounts TO authenticated;
GRANT ALL ON public.courtesy_accounts TO service_role;
ALTER TABLE public.courtesy_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courtesy_accounts_select" ON public.courtesy_accounts FOR SELECT TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_accounts_insert" ON public.courtesy_accounts FOR INSERT TO authenticated
WITH CHECK (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_accounts_update" ON public.courtesy_accounts FOR UPDATE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_accounts_delete" ON public.courtesy_accounts FOR DELETE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE TRIGGER update_courtesy_accounts_updated_at BEFORE UPDATE ON public.courtesy_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_floor_plans_updated_at();

CREATE TABLE public.courtesy_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.courtesy_accounts(id) ON DELETE SET NULL,
  table_number integer,
  order_ids uuid[] NOT NULL DEFAULT '{}',
  courtesy_type text NOT NULL DEFAULT 'invitation',
  sale_amount numeric NOT NULL DEFAULT 0,
  cost_amount numeric NOT NULL DEFAULT 0,
  notes text,
  finance_transaction_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courtesy_charges TO authenticated;
GRANT ALL ON public.courtesy_charges TO service_role;
ALTER TABLE public.courtesy_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courtesy_charges_select" ON public.courtesy_charges FOR SELECT TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_charges_insert" ON public.courtesy_charges FOR INSERT TO authenticated
WITH CHECK (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_charges_update" ON public.courtesy_charges FOR UPDATE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_charges_delete" ON public.courtesy_charges FOR DELETE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE INDEX idx_courtesy_charges_est_date ON public.courtesy_charges(establishment_id, created_at DESC);

INSERT INTO public.courtesy_accounts (establishment_id, name)
SELECT e.id, n.name FROM public.establishments e
CROSS JOIN (VALUES ('Maria Luz'), ('Pablo'), ('El Ruso')) AS n(name);
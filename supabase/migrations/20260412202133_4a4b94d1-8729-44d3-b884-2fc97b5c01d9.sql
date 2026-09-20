
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id),
  invoice_number serial,
  table_number integer NOT NULL,
  order_ids uuid[] NOT NULL,
  items jsonb NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  change_amount numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Cashier can insert invoices for their establishment
CREATE POLICY "Cashier can insert invoices"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can view invoices for their establishment
CREATE POLICY "Cashier can view invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Admin can manage invoices for their establishment
CREATE POLICY "Admin can manage invoices"
ON public.invoices FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Superadmin full access
CREATE POLICY "Superadmin full access invoices"
ON public.invoices FOR ALL
USING (is_superadmin(auth.uid()));

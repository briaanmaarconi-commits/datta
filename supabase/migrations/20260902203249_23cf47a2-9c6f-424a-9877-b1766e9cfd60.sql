CREATE TABLE public.fiscal_invoice_covered_invoices (
  id uuid primary key default gen_random_uuid(),
  fiscal_invoice_id uuid not null references public.fiscal_invoices(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fiscal_invoice_id, invoice_id)
);

CREATE INDEX idx_ficov_invoice ON public.fiscal_invoice_covered_invoices(invoice_id);
CREATE INDEX idx_ficov_estab ON public.fiscal_invoice_covered_invoices(establishment_id);

GRANT SELECT, INSERT, DELETE ON public.fiscal_invoice_covered_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoice_covered_invoices TO service_role;

ALTER TABLE public.fiscal_invoice_covered_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ficov select same establishment"
ON public.fiscal_invoice_covered_invoices FOR SELECT TO authenticated
USING (is_superadmin(auth.uid()) OR establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "ficov insert same establishment"
ON public.fiscal_invoice_covered_invoices FOR INSERT TO authenticated
WITH CHECK (is_superadmin(auth.uid()) OR establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "ficov delete admins"
ON public.fiscal_invoice_covered_invoices FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
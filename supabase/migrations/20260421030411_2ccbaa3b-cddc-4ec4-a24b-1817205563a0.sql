
-- Add fiscal columns to establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS cuit text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS domicilio_comercial text,
  ADD COLUMN IF NOT EXISTS iibb text,
  ADD COLUMN IF NOT EXISTS inicio_actividades date,
  ADD COLUMN IF NOT EXISTS condicion_iva text DEFAULT 'monotributo',
  ADD COLUMN IF NOT EXISTS punto_venta_afip integer,
  ADD COLUMN IF NOT EXISTS afip_environment text DEFAULT 'testing';

-- Table for AFIP digital certificates
CREATE TABLE public.afip_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  certificate_pem text NOT NULL,
  private_key_pem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at date,
  UNIQUE(establishment_id)
);

ALTER TABLE public.afip_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage afip_certificates"
  ON public.afip_certificates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access afip_certificates"
  ON public.afip_certificates FOR ALL
  USING (is_superadmin(auth.uid()));

-- Table for fiscal invoices (facturas and credit notes)
CREATE TABLE public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id),
  invoice_ids uuid[],
  tipo_cbte integer NOT NULL,
  punto_venta integer NOT NULL,
  cbte_numero bigint,
  cae text,
  cae_vto date,
  total numeric NOT NULL DEFAULT 0,
  neto_gravado numeric,
  iva_amount numeric,
  items_detail jsonb,
  payment_method text,
  receptor_cuit text,
  receptor_razon_social text,
  receptor_condicion_iva text DEFAULT 'consumidor_final',
  status text NOT NULL DEFAULT 'pending',
  afip_response jsonb,
  is_credit_note boolean NOT NULL DEFAULT false,
  related_fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id),
  credit_note_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cashier can insert fiscal_invoices"
  ON public.fiscal_invoices FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can view fiscal_invoices"
  ON public.fiscal_invoices FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Admin can manage fiscal_invoices"
  ON public.fiscal_invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access fiscal_invoices"
  ON public.fiscal_invoices FOR ALL
  USING (is_superadmin(auth.uid()));

-- Index for quick lookups
CREATE INDEX idx_fiscal_invoices_establishment ON public.fiscal_invoices(establishment_id);
CREATE INDEX idx_fiscal_invoices_invoice_id ON public.fiscal_invoices(invoice_id);
CREATE INDEX idx_fiscal_invoices_status ON public.fiscal_invoices(establishment_id, status);

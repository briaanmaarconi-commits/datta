-- Facturas que Datta emite a sus clientes por la suscripción (ARCA/AFIP, WSFEv1) y la sección
-- "Suscripción" de cada local (admin y cajero ven su plan, vencimiento, pagos y facturas).

-- Datos fiscales de Datta como emisor (una sola fila). La clave privada va cifrada con SECRETS_KEY.
-- Nadie la lee desde el navegador: solo el backend (service_role).
CREATE TABLE IF NOT EXISTS public.datta_fiscal_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cuit text,
  razon_social text,
  condicion_iva text NOT NULL DEFAULT 'monotributo' CHECK (condicion_iva IN ('monotributo', 'responsable_inscripto', 'exento')),
  punto_venta integer CHECK (punto_venta BETWEEN 1 AND 99998),
  environment text NOT NULL DEFAULT 'testing' CHECK (environment IN ('testing', 'production')),
  domicilio text,
  iibb text,
  inicio_actividades date,
  auto_issue boolean NOT NULL DEFAULT false,
  certificate_pem text,
  private_key_pem text,
  certificate_expires_at date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.datta_fiscal_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.datta_fiscal_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.datta_fiscal_settings FROM anon, authenticated;
GRANT ALL ON public.datta_fiscal_settings TO service_role;

-- Ticket de acceso de ARCA (WSAA) de Datta, separado del de los locales.
CREATE TABLE IF NOT EXISTS public.datta_afip_tokens (
  service text NOT NULL,
  environment text NOT NULL,
  token text NOT NULL,
  sign text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (service, environment)
);
ALTER TABLE public.datta_afip_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.datta_afip_tokens FROM anon, authenticated;
GRANT ALL ON public.datta_afip_tokens TO service_role;

-- Comprobantes emitidos. Solo los escribe el backend; el local lee los suyos.
CREATE TABLE IF NOT EXISTS public.datta_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  client_payment_id uuid REFERENCES public.client_payments(id) ON DELETE SET NULL,
  environment text NOT NULL CHECK (environment IN ('testing', 'production')),
  tipo_cbte integer NOT NULL,
  punto_venta integer NOT NULL,
  cbte_numero bigint NOT NULL,
  cae text NOT NULL,
  cae_vto date,
  issue_date date NOT NULL,
  period_from date,
  period_to date,
  description text NOT NULL,
  total numeric(14,2) NOT NULL,
  neto_gravado numeric(14,2) NOT NULL,
  iva_amount numeric(14,2) NOT NULL DEFAULT 0,
  emisor jsonb NOT NULL,
  receptor jsonb NOT NULL,
  afip_response jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, punto_venta, tipo_cbte, cbte_numero)
);
-- Un pago se factura una sola vez por ambiente (homologación y producción son independientes).
CREATE UNIQUE INDEX IF NOT EXISTS datta_invoices_payment_env_key
  ON public.datta_invoices (client_payment_id, environment) WHERE client_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS datta_invoices_est_idx ON public.datta_invoices (establishment_id, issue_date DESC);

ALTER TABLE public.datta_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.datta_invoices FROM anon, authenticated;
GRANT SELECT ON public.datta_invoices TO authenticated;
GRANT ALL ON public.datta_invoices TO service_role;
DROP POLICY IF EXISTS "Superadmin reads datta_invoices" ON public.datta_invoices;
CREATE POLICY "Superadmin reads datta_invoices" ON public.datta_invoices
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Managers read own datta_invoices" ON public.datta_invoices;
CREATE POLICY "Managers read own datta_invoices" ON public.datta_invoices
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));

-- El local (admin y cajero) ve el historial de sus pagos a Datta (solo lectura).
DROP POLICY IF EXISTS "Managers read own client_payments" ON public.client_payments;
CREATE POLICY "Managers read own client_payments" ON public.client_payments
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));

DROP TRIGGER IF EXISTS notify_change_datta_invoices ON public.datta_invoices;
CREATE TRIGGER notify_change_datta_invoices AFTER INSERT OR UPDATE OR DELETE ON public.datta_invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_change();

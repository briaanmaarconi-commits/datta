-- Cuentas corrientes de empresas (vales). Fase 1: empresas, vales, cobros y permisos. Idempotente.
-- Un vale es consumo a cobrar a una empresa (no es una cortesía): se registra al cerrar la mesa,
-- se verifica contra el papel, se factura (por vale o por el total) y se cobra con cualquier medio.

CREATE TABLE IF NOT EXISTS public.company_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  cuit text CHECK (cuit IS NULL OR cuit ~ '^\d{11}$'),
  razon_social text CHECK (razon_social IS NULL OR char_length(razon_social) <= 200),
  condicion_iva text,
  contact text CHECK (contact IS NULL OR char_length(contact) <= 300),
  -- Día de corte mensual definido por la dueña; NULL = fin de mes.
  cutoff_day integer CHECK (cutoff_day IS NULL OR cutoff_day BETWEEN 1 AND 28),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, establishment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS company_accounts_name_key
  ON public.company_accounts (establishment_id, lower(btrim(name)));

-- Cobros de la empresa (total o parcial, cualquier medio de pago).
CREATE TABLE IF NOT EXISTS public.company_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'check', 'other')),
  paid_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  finance_transaction_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, establishment_id),
  FOREIGN KEY (account_id, establishment_id) REFERENCES public.company_accounts (id, establishment_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.company_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  voucher_number text NOT NULL CHECK (char_length(btrim(voucher_number)) BETWEEN 1 AND 40),
  diners integer NOT NULL DEFAULT 1 CHECK (diners BETWEEN 1 AND 500),
  signed_by text CHECK (signed_by IS NULL OR char_length(signed_by) <= 120),
  table_number integer,
  order_ids uuid[] NOT NULL DEFAULT '{}',
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  -- Ciclo: verificado contra el papel → facturado (referencia al comprobante) → cobrado (cobro aplicado).
  verified_at timestamptz,
  verified_by uuid,
  billed_at timestamptz,
  billing_ref text,
  settlement_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, establishment_id) REFERENCES public.company_accounts (id, establishment_id) ON DELETE RESTRICT,
  FOREIGN KEY (settlement_id, establishment_id) REFERENCES public.company_settlements (id, establishment_id) ON DELETE SET NULL (settlement_id)
);
-- Un número de vale no se repite dentro de la misma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS company_vouchers_number_key
  ON public.company_vouchers (account_id, lower(btrim(voucher_number)));
CREATE INDEX IF NOT EXISTS company_vouchers_account_idx ON public.company_vouchers (account_id, consumed_at DESC);
CREATE INDEX IF NOT EXISTS company_vouchers_open_idx ON public.company_vouchers (establishment_id) WHERE settlement_id IS NULL;

-- El autor y la hora los fija el servidor, no el cliente.
CREATE OR REPLACE FUNCTION public.company_set_created_by() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS company_accounts_created_by ON public.company_accounts;
CREATE TRIGGER company_accounts_created_by BEFORE INSERT ON public.company_accounts
  FOR EACH ROW EXECUTE FUNCTION public.company_set_created_by();
DROP TRIGGER IF EXISTS company_vouchers_created_by ON public.company_vouchers;
CREATE TRIGGER company_vouchers_created_by BEFORE INSERT ON public.company_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.company_set_created_by();
DROP TRIGGER IF EXISTS company_settlements_created_by ON public.company_settlements;
CREATE TRIGGER company_settlements_created_by BEFORE INSERT ON public.company_settlements
  FOR EACH ROW EXECUTE FUNCTION public.company_set_created_by();

-- Un administrador del local (no la caja).
CREATE OR REPLACE FUNCTION public.is_establishment_admin(_user_id uuid, _est uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND establishment_id = _est AND role = 'admin'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_establishment_admin(uuid, uuid) TO authenticated;

ALTER TABLE public.company_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_accounts, public.company_vouchers, public.company_settlements FROM anon;

-- Superadmin: todo.
DROP POLICY IF EXISTS "Superadmin full access company_accounts" ON public.company_accounts;
CREATE POLICY "Superadmin full access company_accounts" ON public.company_accounts
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Superadmin full access company_vouchers" ON public.company_vouchers;
CREATE POLICY "Superadmin full access company_vouchers" ON public.company_vouchers
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Superadmin full access company_settlements" ON public.company_settlements;
CREATE POLICY "Superadmin full access company_settlements" ON public.company_settlements
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Admin y caja del local: leen todo y registran vales (la caja los carga al cerrar la mesa).
DROP POLICY IF EXISTS "Managers read company_accounts" ON public.company_accounts;
CREATE POLICY "Managers read company_accounts" ON public.company_accounts
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Managers read company_vouchers" ON public.company_vouchers;
CREATE POLICY "Managers read company_vouchers" ON public.company_vouchers
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Managers insert company_vouchers" ON public.company_vouchers;
CREATE POLICY "Managers insert company_vouchers" ON public.company_vouchers
  FOR INSERT TO authenticated WITH CHECK (
    public.is_establishment_manager(auth.uid(), establishment_id)
    AND verified_at IS NULL AND billed_at IS NULL AND settlement_id IS NULL   -- siempre nace pendiente
  );
DROP POLICY IF EXISTS "Managers read company_settlements" ON public.company_settlements;
CREATE POLICY "Managers read company_settlements" ON public.company_settlements
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));

-- Solo el administrador gestiona empresas, verifica, corrige, factura y cobra.
DROP POLICY IF EXISTS "Admin manage company_accounts" ON public.company_accounts;
CREATE POLICY "Admin manage company_accounts" ON public.company_accounts
  FOR ALL TO authenticated
  USING (public.is_establishment_admin(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_admin(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Admin manage company_vouchers" ON public.company_vouchers;
CREATE POLICY "Admin manage company_vouchers" ON public.company_vouchers
  FOR ALL TO authenticated
  USING (public.is_establishment_admin(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_admin(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Admin manage company_settlements" ON public.company_settlements;
CREATE POLICY "Admin manage company_settlements" ON public.company_settlements
  FOR ALL TO authenticated
  USING (public.is_establishment_admin(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_admin(auth.uid(), establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_accounts, public.company_vouchers, public.company_settlements TO authenticated;

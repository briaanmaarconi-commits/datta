-- Movimientos de caja borrados: el cajero puede borrar, pero queda una copia que solo ve el dueño
-- (Historial → Movimientos borrados) con el día y horario del borrado, quién lo hizo y el monto.

CREATE TABLE IF NOT EXISTS public.deleted_finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  original_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  date date,
  description text,
  category_name text,
  affects_cash boolean,
  created_by uuid,
  created_at timestamptz,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  original jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS deleted_finance_transactions_est_idx ON public.deleted_finance_transactions (establishment_id, deleted_at DESC);

CREATE OR REPLACE FUNCTION public.log_deleted_finance_transaction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Si se está borrando el local entero, no hay a quién guardarle la copia.
  IF NOT EXISTS (SELECT 1 FROM public.establishments WHERE id = OLD.establishment_id) THEN
    RETURN OLD;
  END IF;
  INSERT INTO public.deleted_finance_transactions
    (establishment_id, original_id, type, amount, date, description, category_name, affects_cash, created_by, created_at, deleted_by, original)
  VALUES
    (OLD.establishment_id, OLD.id, OLD.type, OLD.amount, OLD.date, OLD.description,
     (SELECT name FROM public.finance_categories WHERE id = OLD.category_id), OLD.affects_cash,
     OLD.created_by, OLD.created_at, auth.uid(), to_jsonb(OLD));
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS log_deleted_finance_transaction ON public.finance_transactions;
CREATE TRIGGER log_deleted_finance_transaction AFTER DELETE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_deleted_finance_transaction();

-- Solo lectura, y solo para el dueño (admin) del local o el superadmin. Nadie la modifica desde la app.
ALTER TABLE public.deleted_finance_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_finance_transactions FROM anon, authenticated;
GRANT SELECT ON public.deleted_finance_transactions TO authenticated;
GRANT ALL ON public.deleted_finance_transactions TO service_role;
DROP POLICY IF EXISTS "Owner reads deleted movements" ON public.deleted_finance_transactions;
CREATE POLICY "Owner reads deleted movements" ON public.deleted_finance_transactions
  FOR SELECT TO authenticated USING (
    public.is_superadmin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role = 'admin' AND ur.establishment_id = deleted_finance_transactions.establishment_id)
  );

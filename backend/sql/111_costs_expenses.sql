-- Costos y gastos: cada categoría de egreso sabe si es costo de mercadería, gasto fijo o gasto variable,
-- y los gastos fijos que se repiten (alquiler, sueldos...) quedan agendados para confirmarse cada mes.

ALTER TABLE public.finance_categories
  ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('cogs', 'fixed', 'variable'));

CREATE OR REPLACE FUNCTION public.guess_expense_kind(_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _name ~* 'propina|cortes[ií]a|consumo (del )?personal|invitaci' THEN NULL
    WHEN _name ~* 'mercader|materia prima|insumo|bebida|descartable|packaging|envase' THEN 'cogs'
    WHEN _name ~* 'alquiler|sueldo|salario|cargas sociales|luz|electric|gas|agua|internet|tel[eé]fono|impuesto|contador|seguro|expensa|abl|monotributo|ingresos brutos|sistema' THEN 'fixed'
    ELSE 'variable'
  END
$$;

UPDATE public.finance_categories SET kind = public.guess_expense_kind(name)
 WHERE type = 'expense' AND kind IS NULL;

-- Categorías por defecto (las mismas para todos los locales), con su tipo.
CREATE OR REPLACE FUNCTION public.seed_default_finance_categories(_establishment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cats text[][] := ARRAY[
    ['Costo de mercadería', 'cogs'], ['Bebidas', 'cogs'], ['Descartables y packaging', 'cogs'],
    ['Alquiler', 'fixed'], ['Sueldos', 'fixed'], ['Cargas sociales', 'fixed'], ['Luz', 'fixed'], ['Gas', 'fixed'],
    ['Agua', 'fixed'], ['Internet y teléfono', 'fixed'], ['Impuestos', 'fixed'], ['Contador', 'fixed'], ['Seguros', 'fixed'],
    ['Comisiones de apps y tarjetas', 'variable'], ['Delivery', 'variable'], ['Publicidad', 'variable'],
    ['Mantenimiento y arreglos', 'variable'], ['Otros', 'variable']
  ];
  _i int;
BEGIN
  FOR _i IN 1 .. array_length(_cats, 1) LOOP
    INSERT INTO public.finance_categories (establishment_id, name, type, kind)
    SELECT _establishment_id, _cats[_i][1], 'expense', _cats[_i][2]
     WHERE NOT EXISTS (
       SELECT 1 FROM public.finance_categories
        WHERE establishment_id = _establishment_id AND lower(name) = lower(_cats[_i][1]) AND type = 'expense'
     );
  END LOOP;
  INSERT INTO public.finance_categories (establishment_id, name, type)
  SELECT _establishment_id, 'Otros ingresos', 'income'
   WHERE NOT EXISTS (SELECT 1 FROM public.finance_categories WHERE establishment_id = _establishment_id AND lower(name) = 'otros ingresos' AND type = 'income');
END $$;
GRANT EXECUTE ON FUNCTION public.seed_default_finance_categories(uuid) TO authenticated;

-- Categoría nueva creada a mano: se clasifica sola por el nombre si no viene el tipo.
CREATE OR REPLACE FUNCTION public.finance_category_default_kind() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type = 'expense' AND NEW.kind IS NULL THEN NEW.kind := public.guess_expense_kind(NEW.name); END IF;
  IF NEW.type <> 'expense' THEN NEW.kind := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_category_default_kind ON public.finance_categories;
CREATE TRIGGER finance_category_default_kind BEFORE INSERT ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.finance_category_default_kind();

-- Gastos que se repiten todos los meses.
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.finance_categories(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  day_of_month integer NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  starts_on date NOT NULL DEFAULT date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_expenses_est_idx ON public.recurring_expenses (establishment_id) WHERE is_active;

-- Meses en que un gasto fijo no correspondió (se tocó "este mes no").
CREATE TABLE IF NOT EXISTS public.recurring_expense_skips (
  recurring_expense_id uuid NOT NULL REFERENCES public.recurring_expenses(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recurring_expense_id, period)
);

-- Un gasto fijo se confirma una sola vez por mes.
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid REFERENCES public.recurring_expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period text CHECK (period IS NULL OR period ~ '^\d{4}-\d{2}$');
CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_recurring_period_key
  ON public.finance_transactions (recurring_expense_id, period) WHERE recurring_expense_id IS NOT NULL;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_skips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_expenses, public.recurring_expense_skips FROM anon;
DROP POLICY IF EXISTS "Superadmin full access recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Superadmin full access recurring_expenses" ON public.recurring_expenses
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Managers manage own recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Managers manage own recurring_expenses" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING (public.is_establishment_manager(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_manager(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Superadmin full access recurring_expense_skips" ON public.recurring_expense_skips;
CREATE POLICY "Superadmin full access recurring_expense_skips" ON public.recurring_expense_skips
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Managers manage own recurring_expense_skips" ON public.recurring_expense_skips;
CREATE POLICY "Managers manage own recurring_expense_skips" ON public.recurring_expense_skips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recurring_expenses r WHERE r.id = recurring_expense_id AND public.is_establishment_manager(auth.uid(), r.establishment_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recurring_expenses r WHERE r.id = recurring_expense_id AND public.is_establishment_manager(auth.uid(), r.establishment_id)));

/**
 * Gastos fijos pendientes de confirmar: los del mes pasado sin confirmar y los de este mes cuyo día
 * de pago ya llegó. Lo usan la pantalla de Costos y gastos, las alertas y el recordatorio mensual.
 */
CREATE OR REPLACE FUNCTION public.pending_recurring_expenses(_establishment_id uuid)
RETURNS TABLE (recurring_expense_id uuid, name text, category_id uuid, category_name text, amount numeric, day_of_month integer, period text, overdue boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_superadmin(auth.uid()) OR public.is_establishment_manager(auth.uid(), _establishment_id)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH periods AS (
    SELECT to_char(_today - interval '1 month', 'YYYY-MM') AS p, true AS past
    UNION ALL SELECT to_char(_today, 'YYYY-MM'), false
  )
  SELECT r.id, r.name, r.category_id, c.name, r.amount, r.day_of_month, pe.p, pe.past
    FROM public.recurring_expenses r
    JOIN public.finance_categories c ON c.id = r.category_id
    CROSS JOIN periods pe
   WHERE r.establishment_id = _establishment_id AND r.is_active
     AND to_date(pe.p || '-01', 'YYYY-MM-DD') >= date_trunc('month', r.starts_on)::date
     AND (pe.past OR r.day_of_month <= extract(day FROM _today))
     AND NOT EXISTS (SELECT 1 FROM public.finance_transactions t WHERE t.recurring_expense_id = r.id AND t.period = pe.p)
     AND NOT EXISTS (SELECT 1 FROM public.recurring_expense_skips s WHERE s.recurring_expense_id = r.id AND s.period = pe.p)
   ORDER BY pe.p, r.day_of_month, r.name;
END $$;
REVOKE ALL ON FUNCTION public.pending_recurring_expenses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_recurring_expenses(uuid) TO authenticated, service_role;

DROP TRIGGER IF EXISTS notify_change_recurring_expenses ON public.recurring_expenses;
CREATE TRIGGER notify_change_recurring_expenses AFTER INSERT OR UPDATE OR DELETE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_change();

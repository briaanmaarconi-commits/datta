
CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_est_name_type_unique
  ON public.finance_categories (establishment_id, lower(name), type);

CREATE OR REPLACE FUNCTION public.seed_default_finance_categories(_establishment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expense_cats text[] := ARRAY[
    'Costo de mercadería',
    'Sueldos',
    'Alquiler',
    'Luz',
    'Gas',
    'Agua',
    'Internet',
    'Impuestos',
    'Mantenimiento',
    'Marketing',
    'Mermas',
    'Otros'
  ];
  _income_cats text[] := ARRAY[
    'Otros ingresos'
  ];
  _name text;
BEGIN
  FOREACH _name IN ARRAY _expense_cats LOOP
    INSERT INTO public.finance_categories (establishment_id, name, type)
    SELECT _establishment_id, _name, 'expense'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.finance_categories
       WHERE establishment_id = _establishment_id
         AND lower(name) = lower(_name)
         AND type = 'expense'
    );
  END LOOP;

  FOREACH _name IN ARRAY _income_cats LOOP
    INSERT INTO public.finance_categories (establishment_id, name, type)
    SELECT _establishment_id, _name, 'income'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.finance_categories
       WHERE establishment_id = _establishment_id
         AND lower(name) = lower(_name)
         AND type = 'income'
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_finance_categories(uuid) TO authenticated;

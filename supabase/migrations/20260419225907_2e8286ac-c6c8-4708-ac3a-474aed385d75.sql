-- 1. Agregar nuevo valor al enum stock_movement_type
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'consumption';

-- 2. Agregar columnas para subtipo de consumo y vínculo a finance_transactions
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS consumption_type text,
  ADD COLUMN IF NOT EXISTS finance_transaction_id uuid;

-- 3. Función para asegurar que existan las categorías de gasto para consumos internos
CREATE OR REPLACE FUNCTION public.ensure_consumption_expense_category(_establishment_id uuid, _consumption_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cat_name text;
  _cat_id uuid;
BEGIN
  _cat_name := CASE _consumption_type
    WHEN 'invitation' THEN 'Invitaciones / Cortesías'
    WHEN 'staff_meal' THEN 'Comida de personal'
    WHEN 'internal' THEN 'Consumo interno'
    ELSE 'Consumos internos'
  END;

  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = _cat_name AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, _cat_name, 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$$;
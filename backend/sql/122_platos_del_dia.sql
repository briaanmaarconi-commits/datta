-- Platos del día cargados por el personal (mozos incluidos) desde la pantalla de pedidos.
-- Cada plato del día es un producto normal dentro de una categoría especial "Plato del día"
-- por local, así cocina, comandas, costos, stock y reportes siguen funcionando igual.
-- Idempotente y aditiva.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_daily_special_category boolean NOT NULL DEFAULT false;

-- Una sola categoría especial por local.
CREATE UNIQUE INDEX IF NOT EXISTS categories_one_daily_special_per_establishment
  ON public.categories (establishment_id) WHERE is_daily_special_category;

-- ¿La categoría es la de platos del día del local? (SECURITY DEFINER para usarla en policies).
CREATE OR REPLACE FUNCTION public.is_daily_special_category(_category_id uuid, _establishment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories
     WHERE id = _category_id AND establishment_id = _establishment_id AND is_daily_special_category
  )
$$;

-- Devuelve (y crea si falta) la categoría "Plato del día" del local del usuario.
CREATE OR REPLACE FUNCTION public.ensure_daily_special_category()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _est uuid := public.get_user_establishment(auth.uid());
  _id uuid;
BEGIN
  IF _est IS NULL THEN
    RAISE EXCEPTION 'Usuario sin local' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _id FROM public.categories
   WHERE establishment_id = _est AND is_daily_special_category;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  INSERT INTO public.categories (establishment_id, name, sort_order, is_active, prep_area, is_daily_special_category)
  VALUES (
    _est, 'Plato del día',
    COALESCE((SELECT MIN(sort_order) FROM public.categories WHERE establishment_id = _est), 0) - 1,
    true, 'principal', true
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN -- otra moza la creó al mismo tiempo
    SELECT id INTO _id FROM public.categories
     WHERE establishment_id = _est AND is_daily_special_category;
  END IF;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_daily_special_category() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_daily_special_category() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_daily_special_category(uuid, uuid) TO authenticated;

-- Mozos: pueden crear y modificar productos SOLO dentro de la categoría de platos del día de su local.
DROP POLICY IF EXISTS "Waiter manages daily specials insert" ON public.products;
CREATE POLICY "Waiter manages daily specials insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'waiter')
    AND establishment_id = public.get_user_establishment(auth.uid())
    AND public.is_daily_special_category(category_id, establishment_id)
  );

DROP POLICY IF EXISTS "Waiter manages daily specials update" ON public.products;
CREATE POLICY "Waiter manages daily specials update" ON public.products
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'waiter')
    AND establishment_id = public.get_user_establishment(auth.uid())
    AND public.is_daily_special_category(category_id, establishment_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'waiter')
    AND establishment_id = public.get_user_establishment(auth.uid())
    AND public.is_daily_special_category(category_id, establishment_id)
  );

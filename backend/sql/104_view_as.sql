-- "Ver como": un superadmin puede mirar u operar la cocina, caja o mozo de cualquier local.
-- El backend fija app.acting_establishment (solo en transacciones de un superadmin con contexto "ver como" validado)
-- y get_user_establishment() lo devuelve únicamente cuando quien consulta ES superadmin y es el usuario del request.
-- Para cualquier otro usuario, o sin contexto, el resultado es exactamente el de antes.
CREATE OR REPLACE FUNCTION public.get_user_establishment(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE WHEN a ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN a::uuid END
        FROM (SELECT nullif(current_setting('app.acting_establishment', true), '') AS a) g
       WHERE a IS NOT NULL
         AND _user_id = auth.uid()
         AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin')
    ),
    (
      SELECT establishment_id FROM public.user_roles
       WHERE user_id = _user_id AND establishment_id IS NOT NULL
       LIMIT 1
    )
  )
$$;

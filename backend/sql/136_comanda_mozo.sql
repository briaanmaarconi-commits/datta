-- Mozo en la comanda (pedido de Restaurant Olavarría, para todos los locales).
-- order_items.created_by: quién cargó cada ítem. Se completa solo con el usuario logueado, así un agregado de otro
-- mozo sale con su nombre. Pedidos por QR quedan vacíos (no hay usuario).
-- La cocina necesita leer el nombre del personal de su local para imprimirlo (antes solo admin y caja podían).
-- Idempotente.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

-- ¿_user trabaja en el local _est? SECURITY DEFINER porque la cocina no puede leer los roles de los demás.
CREATE OR REPLACE FUNCTION public.is_establishment_staff(_user uuid, _est uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user AND establishment_id = _est)
$$;

DROP POLICY IF EXISTS "Kitchen can view staff profiles" ON public.profiles;
CREATE POLICY "Kitchen can view staff profiles" ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(),'kitchen') AND public.is_establishment_staff(profiles.id, get_user_establishment(auth.uid())));

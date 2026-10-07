-- Arreglo: mozos y cocina no podían leer los sectores de su propio local (pantalla del mozo en blanco).
-- 100_hardening quitó la política pública "Public can view sectors" y los únicos permisos que quedaban eran de
-- administración (admin y caja). El personal del local necesita LEER los sectores: la lista de mesas del mozo se
-- agrupa por sector, el plano depende del sector y el ticket de cocina muestra el sector de la mesa.
-- Solo lectura y solo del propio local; la carta pública (anon) no cambia.
DROP POLICY IF EXISTS "Staff can view sectors" ON public.sectors;
CREATE POLICY "Staff can view sectors" ON public.sectors
  FOR SELECT TO authenticated
  USING (establishment_id = public.get_user_establishment(auth.uid()));

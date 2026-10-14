-- Comandas por sector de preparación. Idempotente y aditiva: un local sin estaciones configuradas
-- sigue imprimiendo la comanda completa como siempre.

-- Sector de preparación de cada categoría (NULL = sin asignar → sale por "principal").
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS prep_area text;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_prep_area_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_prep_area_check CHECK (prep_area IS NULL OR prep_area IN ('entrada', 'principal', 'postre', 'bebida'));

-- Una impresora (por nombre en Windows) por sector y por local.
CREATE TABLE IF NOT EXISTS public.print_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  prep_area text NOT NULL CHECK (prep_area IN ('entrada', 'principal', 'postre', 'bebida')),
  printer_name text NOT NULL CHECK (char_length(btrim(printer_name)) BETWEEN 1 AND 200),
  paper_width integer NOT NULL DEFAULT 80 CHECK (paper_width IN (58, 80)),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, prep_area)
);

ALTER TABLE public.print_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.print_stations FROM anon;

DROP POLICY IF EXISTS "Superadmin full access print_stations" ON public.print_stations;
CREATE POLICY "Superadmin full access print_stations" ON public.print_stations
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Administran: admin y caja de su local.
DROP POLICY IF EXISTS "Managers manage own print_stations" ON public.print_stations;
CREATE POLICY "Managers manage own print_stations" ON public.print_stations
  FOR ALL TO authenticated
  USING (public.is_establishment_manager(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_manager(auth.uid(), establishment_id));

-- La PC de cocina (y cualquier rol del local) solo lee el mapeo para repartir las comandas.
DROP POLICY IF EXISTS "Staff read own print_stations" ON public.print_stations;
CREATE POLICY "Staff read own print_stations" ON public.print_stations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid() AND ur.establishment_id = print_stations.establishment_id
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_stations TO authenticated;

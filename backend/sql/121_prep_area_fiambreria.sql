-- Sector "Fiambrería" (entradas frías) para comandas por sector. Idempotente y aditiva.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_prep_area_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_prep_area_check
  CHECK (prep_area IS NULL OR prep_area IN ('entrada', 'fiambreria', 'principal', 'postre', 'bebida'));

ALTER TABLE public.print_stations DROP CONSTRAINT IF EXISTS print_stations_prep_area_check;
ALTER TABLE public.print_stations
  ADD CONSTRAINT print_stations_prep_area_check
  CHECK (prep_area IN ('entrada', 'fiambreria', 'principal', 'postre', 'bebida'));

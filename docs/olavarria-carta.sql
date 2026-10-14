-- Carga de carta: RESTAURANT OLAVARRIA (generado 2026-10-14). Idempotente.
BEGIN;
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Bebidas sin alcohol', 0
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Bebidas sin alcohol');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Cervezas', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Cervezas');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Aperitivos', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Aperitivos');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Entradas frías', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Entradas frías');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Entradas calientes', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Entradas calientes');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Platos principales', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Platos principales');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Guarniciones', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Guarniciones');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Pescados', 7
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Pescados');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Omelettes y tortillas', 8
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Omelettes y tortillas');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Ensaladas', 9
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Ensaladas');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Pastas', 10
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Pastas');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Salsas', 11
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Salsas');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Platos especiales', 12
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Platos especiales');
INSERT INTO public.categories (establishment_id, name, sort_order)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Postres', 13
  WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Postres');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Gaseosas 500cc', NULL, 3500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Gaseosas 500cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Gaseosas 1250cc', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Gaseosas 1250cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agua Saborizada Levité 500cc', NULL, 3500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agua Saborizada Levité 500cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agua Saborizada Levité 1250cc', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agua Saborizada Levité 1250cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agua saborizada mineral We 500cc', NULL, 3500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agua saborizada mineral We 500cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agua saborizada mineral We 1250cc', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agua saborizada mineral We 1250cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agua mineral Villavicencio 500cc', NULL, 3500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agua mineral Villavicencio 500cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agua mineral Villavicencio 1250cc', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agua mineral Villavicencio 1250cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Soda 500cc', NULL, 3500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Bebidas sin alcohol'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Soda 500cc');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Quilmes Lata', NULL, 4000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Quilmes Lata');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Quilmes Botella', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Quilmes Botella');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Bock / Stout Lata', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Bock / Stout Lata');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Bock / Stout Botella', NULL, 8000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Bock / Stout Botella');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Stella Artois Lata', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Stella Artois Lata');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Stella Artois Botella', NULL, 8000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Stella Artois Botella');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Brahma Lata', NULL, 4000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Brahma Lata');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Brahma Botella', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Brahma Botella');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Corona Lata', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Corona Lata');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Corona Botella', NULL, 8000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Cervezas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Corona Botella');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Terma Cuyano / Serrano Medida', NULL, 3500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Aperitivos'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Terma Cuyano / Serrano Medida');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Fernet Medida', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Aperitivos'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Fernet Medida');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Fernet Botella', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Aperitivos'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Fernet Botella');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Gancia 500 ml Medida', NULL, 8000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Aperitivos'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Gancia 500 ml Medida');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Cinzano 500 ml Medida', NULL, 8000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Aperitivos'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Cinzano 500 ml Medida');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Matambre Casero con rusa', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Matambre Casero con rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Lechón arrollado con rusa', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Lechón arrollado con rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo arrollado con rusa', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo arrollado con rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Lengua a la vinagreta con rusa', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Lengua a la vinagreta con rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Jamón crudo con rusa', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Jamón crudo con rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Jamón crudo con ananá', NULL, 7000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Jamón crudo con ananá');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Jamón cocido natural con rusa', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Jamón cocido natural con rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tabla de fiambres (2 pers.)', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tabla de fiambres (2 pers.)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tabla de fiambres (3 pers.)', NULL, 25000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tabla de fiambres (3 pers.)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Cóctel de camarones', NULL, 11000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Cóctel de camarones');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Mayonesa de ave', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Mayonesa de ave');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Mayonesa de atún', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Mayonesa de atún');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tomate relleno', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas frías'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tomate relleno');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Provoleta', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas calientes'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Provoleta');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Provoleta mixta', NULL, 13500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas calientes'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Provoleta mixta');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Sopa de verduras', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas calientes'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Sopa de verduras');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Rabas (Rebozadas fritas)', NULL, 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas calientes'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Rabas (Rebozadas fritas)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Provoleta rellena (Jamón crudo, tomate, verdeo)', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Entradas calientes'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Provoleta rellena (Jamón crudo, tomate, verdeo)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Plato del día', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Plato del día');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa de ternera', NULL, 12000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa de ternera');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa de ternera c/ papas fritas', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa de ternera c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa de ternera a la suiza c/ papas fritas', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa de ternera a la suiza c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa napolitana c/ papas fritas', NULL, 17000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa napolitana c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa de pollo', NULL, 12000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa de pollo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa de pollo c/ papas fritas', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa de pollo c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Milanesa de pollo a la Suiza c/ papas fritas', NULL, 14000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Milanesa de pollo a la Suiza c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Suprema a la napolitana c/ papas fritas', NULL, 17000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Suprema a la napolitana c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Bife de costilla', NULL, 22000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Bife de costilla');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Bife de costilla con fritas', NULL, 25000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Bife de costilla con fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Chuletitas de cerdo', NULL, 12000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Chuletitas de cerdo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Chuletitas de cerdo con papas fritas', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Chuletitas de cerdo con papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Chuletitas de cerdo a la Riojana c/ papas', NULL, 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Chuletitas de cerdo a la Riojana c/ papas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo deshuesado a la plancha', NULL, 12000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo deshuesado a la plancha');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo deshuesado a la plancha c/ papas fritas', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo deshuesado a la plancha c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo deshuesado a la plancha c/ salsas c/papas', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo deshuesado a la plancha c/ salsas c/papas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Cazuela de mondongo', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Cazuela de mondongo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Sandwich de Hamburguesa con jamón y queso con papas fritas y huevo', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Sandwich de Hamburguesa con jamón y queso con papas fritas y huevo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo arrollado c/salsa de verdeo c/papas fritas', NULL, 21000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo arrollado c/salsa de verdeo c/papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo arrollado c/ salsa champiñones c/ papas fritas', NULL, 21000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo arrollado c/ salsa champiñones c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Asado a la parrilla con papas fritas', NULL, 25000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Asado a la parrilla con papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Asado c/chorizo y fritas', NULL, 28000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Asado c/chorizo y fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'milanesa de ternera completa', 'milanesa de ternera con papas fritas y 2 huevos fritos', 17000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='milanesa de ternera completa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'napolitana de ternera completa', 'milanesa de ternera a la napolitana con papas fritas y 2 huevos fritos', 21000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos principales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='napolitana de ternera completa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Papas al natural', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Papas al natural');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Papas fritas', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Papas española', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Papas española');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Papas cubo', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Papas cubo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Puré de papas', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Puré de papas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Puré de manzana', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Puré de manzana');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Puré de calabaza', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Puré de calabaza');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Papa Noisette', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Papa Noisette');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Papas a la crema', NULL, 5500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Guarniciones'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Papas a la crema');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de merluza solo sin guarnición', NULL, 12000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de merluza solo sin guarnición');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de merluza con guarnición', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de merluza con guarnición');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de merluza con salsa (verdeo, champiñones, 4 quesos, ) con guarnición.', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de merluza con salsa (verdeo, champiñones, 4 quesos, ) con guarnición.');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de lenguado o abadejo', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de lenguado o abadejo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de lenguado o abadejo con guarnición', NULL, 19000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de lenguado o abadejo con guarnición');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de lenguado o abadejo c/ salsa y guarnición', 'a elección verdeo, champigñones o 4quesos', 21000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de lenguado o abadejo c/ salsa y guarnición');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Filet de Lenguado o Abadejo c/ salsa criolla y papa española', NULL, 21000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pescados'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Filet de Lenguado o Abadejo c/ salsa criolla y papa española');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de jamón y queso', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de jamón y queso');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de champiñones y queso', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de champiñones y queso');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de acelga', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de acelga');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de arvejas, queso y jamón', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de arvejas, queso y jamón');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de tomate, cebolla y queso', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de tomate, cebolla y queso');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de queso y cebolla', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de queso y cebolla');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de camarones', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de camarones');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Omelette de pollo y verdeo', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Omelette de pollo y verdeo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Revuelto de papa y huevo', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Revuelto de papa y huevo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Revuelto Gramajo (con jamón crudo)', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Revuelto Gramajo (con jamón crudo)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Revuelto Gramajo Especial (cebolla y morrón)', NULL, 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Revuelto Gramajo Especial (cebolla y morrón)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tortilla de papas', NULL, 10000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tortilla de papas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tortilla de papas con cebolla', NULL, 10000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tortilla de papas con cebolla');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tortilla de verduras', NULL, 10000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tortilla de verduras');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tortilla de verduras con cebolla y morrón', NULL, 10000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Omelettes y tortillas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tortilla de verduras con cebolla y morrón');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensalada a elección (2 ingredientes)', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Ensaladas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensalada a elección (2 ingredientes)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensalada Completa', 'Compuesta por: lechuga, tomate, huevos, remolacha, zanahoria, palmitos, apio, cebolla, choclo, arvejas, lentejas, repollo y morrón', 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Ensaladas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensalada Completa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensalada Rusa', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Ensaladas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensalada Rusa');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Arroz primavera (arroz, jamón, queso, tomate, arvejas, huevo duro)', NULL, 9000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Ensaladas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Arroz primavera (arroz, jamón, queso, tomate, arvejas, huevo duro)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensalada especial con pollo', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Ensaladas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensalada especial con pollo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensalada especial con atún', NULL, 18000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Ensaladas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensalada especial con atún');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tallarines (Fileto, Crema o Bolognesa)', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pastas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tallarines (Fileto, Crema o Bolognesa)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ravioles de verdura (Fileto, Crema o Bolognesa)', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pastas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ravioles de verdura (Fileto, Crema o Bolognesa)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ñoquis (Fileto, Crema o Bolognesa)', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pastas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ñoquis (Fileto, Crema o Bolognesa)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Sorrentinos de jamón y queso (Fileto, Crema o Bolognesa)', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pastas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Sorrentinos de jamón y queso (Fileto, Crema o Bolognesa)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Canelones de verdura y pollo (Fileto, Crema o Bolognesa)', NULL, 15000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pastas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Canelones de verdura y pollo (Fileto, Crema o Bolognesa)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Lasagna rellena (verdura, carne o jamón y queso) c/ salsa Mixta', NULL, 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Pastas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Lasagna rellena (verdura, carne o jamón y queso) c/ salsa Mixta');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, '4 Quesos', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='4 Quesos');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Salsa Parisienne (jamón, queso, salsa blanca, pollo, champiñones)', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Salsa Parisienne (jamón, queso, salsa blanca, pollo, champiñones)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Crema de verdeo', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Crema de verdeo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Champiñones I (crema, queso y champiñones)', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Champiñones I (crema, queso y champiñones)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Champiñones II (demi glace con champignones)', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Champiñones II (demi glace con champignones)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ajillo (demi glace )', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ajillo (demi glace )');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Provenzal (ajo y perejil)', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Provenzal (ajo y perejil)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agridulce de Frutos rojos', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agridulce de Frutos rojos');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Agridulce de ciruelas', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Agridulce de ciruelas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Estofado de carne', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Estofado de carne');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Estofado de pollo', NULL, 4500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Salsas'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Estofado de pollo');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Cerdo c/ salsa agridulce c/ puré de manzana', 'chuletitas de cerdo con puré de manzanas y  salsa de frutos rojos ( frutillas cerezas arándanos grosellas,frambuesas)', 22000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos especiales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Cerdo c/ salsa agridulce c/ puré de manzana');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Bondiola de cerdo al horno c/ papas al horno', 'Bondiola de cerdo al horno, con salsa cebolla, morron, zanahoria, champignon, tomates cherry, hierbas aromaticas, y papas al horno', 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos especiales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Bondiola de cerdo al horno c/ papas al horno');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Pollo deshuesado a la riojana c/ papas', NULL, 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos especiales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Pollo deshuesado a la riojana c/ papas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Peceto al horno c/ papas', 'Peceto al horno, saborizado con salsa demiglace y papas', 20000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos especiales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Peceto al horno c/ papas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Suprema Maryland c/ papas fritas', 'Suprema de pollo, crema de choclos, banana rebosada frita, papas fritas, crocante de panceta ahumada', 25000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Platos especiales'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Suprema Maryland c/ papas fritas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Flan casero', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Flan casero');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Budín de pan', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Budín de pan');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensaladas de frutas', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensaladas de frutas');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ensalada de frutas con helado', NULL, 7000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ensalada de frutas con helado');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Queso y dulce (batata o membrillo)', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Queso y dulce (batata o membrillo)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Durazno en almíbar', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Durazno en almíbar');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Ananá en almíbar', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Ananá en almíbar');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Tiramisú', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Tiramisú');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Mouse de Chocolate / Frutilla', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Mouse de Chocolate / Frutilla');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Almendrado', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Almendrado');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Bombón Helado', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Bombón Helado');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Copa de la casa (para 2 personas)', 'Helado de americana, salsa de frutas, duraznos, cerezas, almendras, oblea, salsa de chocolate y crocante de maní', 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Copa de la casa (para 2 personas)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Don Pedro', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Don Pedro');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Don Juan', NULL, 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Don Juan');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Lemon Champ', 'batido de helado de limón  con champagne demisec', 12500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Lemon Champ');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Helado (2 gustos)', NULL, 5000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Helado (2 gustos)');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Higos / Zapallo en almíbar', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Higos / Zapallo en almíbar');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Higos / Zapallo en almíbar con queso', NULL, 7500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Higos / Zapallo en almíbar con queso');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Postre Balcarce', NULL, 6000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Postre Balcarce');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Adicionales crema o dulce de leche', NULL, 1000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Adicionales crema o dulce de leche');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Adicionales Bocha de Helado', NULL, 2500, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Adicionales Bocha de Helado');
INSERT INTO public.products (establishment_id, category_id, name, description, price, tax_percentage, is_available)
  SELECT '018b04a8-18d9-49f7-86f8-b30be9307dd7', c.id, 'Te / Café', NULL, 3000, 21, true
  FROM public.categories c WHERE c.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND c.name='Postres'
  AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND x.name='Te / Café');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='prep_area') THEN
    UPDATE public.categories SET prep_area='bebida' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Bebidas sin alcohol';
    UPDATE public.categories SET prep_area='bebida' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Cervezas';
    UPDATE public.categories SET prep_area='bebida' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Aperitivos';
    UPDATE public.categories SET prep_area='entrada' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Entradas frías';
    UPDATE public.categories SET prep_area='entrada' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Entradas calientes';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Platos principales';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Guarniciones';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Pescados';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Omelettes y tortillas';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Ensaladas';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Pastas';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Salsas';
    UPDATE public.categories SET prep_area='principal' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Platos especiales';
    UPDATE public.categories SET prep_area='postre' WHERE establishment_id='018b04a8-18d9-49f7-86f8-b30be9307dd7' AND name='Postres';
  END IF;
END $$;
COMMIT;

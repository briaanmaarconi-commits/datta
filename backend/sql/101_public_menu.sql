-- Carta pública (QR del cliente): el rol anon solo LEE, con columnas y filas acotadas.
-- Las escrituras anónimas (pedido, llamado de mozo, reseñas) pasan por endpoints
-- validados del backend (/api/public/*), no por policies abiertas.
GRANT SELECT (id, number, establishment_id, sector_id, capacity) ON public.tables TO anon;
GRANT SELECT (id, category_id, establishment_id, name, description, price, image_url, is_available, created_at, promo_price, promo_active, is_daily_special) ON public.products TO anon;
GRANT SELECT (id, name, address, city, logo_url, is_active) ON public.establishments TO anon;
GRANT SELECT ON public.categories, public.menu_combos, public.menu_combo_items, public.product_reviews TO anon;
GRANT SELECT ON public.public_establishments TO anon;

DROP POLICY IF EXISTS "anon reads active categories" ON public.categories;
CREATE POLICY "anon reads active categories" ON public.categories FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS "anon reads available products" ON public.products;
CREATE POLICY "anon reads available products" ON public.products FOR SELECT TO anon USING (is_available);
DROP POLICY IF EXISTS "anon reads tables" ON public.tables;
CREATE POLICY "anon reads tables" ON public.tables FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon reads active combos" ON public.menu_combos;
CREATE POLICY "anon reads active combos" ON public.menu_combos FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS "anon reads items of active combos" ON public.menu_combo_items;
CREATE POLICY "anon reads items of active combos" ON public.menu_combo_items FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.menu_combos mc WHERE mc.id = combo_id AND mc.is_active));
DROP POLICY IF EXISTS "anon reads product reviews" ON public.product_reviews;
CREATE POLICY "anon reads product reviews" ON public.product_reviews FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon reads active establishments" ON public.establishments;
CREATE POLICY "anon reads active establishments" ON public.establishments FOR SELECT TO anon USING (is_active);

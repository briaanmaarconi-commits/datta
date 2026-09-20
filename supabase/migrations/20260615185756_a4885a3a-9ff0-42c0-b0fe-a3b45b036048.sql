
-- 1) afip_certificates: drop ALL admin policy, replace with INSERT/UPDATE/DELETE only (no SELECT)
DROP POLICY IF EXISTS "Admin can manage afip_certificates" ON public.afip_certificates;
CREATE POLICY "Admin can insert afip_certificates" ON public.afip_certificates
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Admin can update afip_certificates" ON public.afip_certificates
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Admin can delete afip_certificates" ON public.afip_certificates
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
-- Also revoke SELECT column grants from authenticated to prevent reads
REVOKE SELECT ON public.afip_certificates FROM authenticated, anon;
GRANT SELECT (id, establishment_id, expires_at, created_at) ON public.afip_certificates TO authenticated;

-- 2) products: restrict anonymous SELECT columns (hide cost / stock fields)
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (id, category_id, establishment_id, name, description, price, image_url, is_available, created_at, promo_price, promo_active, is_daily_special) ON public.products TO anon;

-- 3) tables: restrict anonymous SELECT columns (hide status/guest_count)
REVOKE SELECT ON public.tables FROM anon;
GRANT SELECT (id, establishment_id, sector_id, number, capacity) ON public.tables TO anon;

-- 4) waiter_calls: remove anonymous SELECT entirely; staff-only reads scoped to their establishment
DROP POLICY IF EXISTS "Anyone can view waiter calls" ON public.waiter_calls;
CREATE POLICY "Staff can view waiter calls" ON public.waiter_calls
  FOR SELECT TO authenticated
  USING (establishment_id = get_user_establishment(auth.uid()));
REVOKE SELECT ON public.waiter_calls FROM anon;

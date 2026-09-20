
-- 1) Establishments: remove broad public select, add safe public view
DROP POLICY IF EXISTS "Public can view active establishments" ON public.establishments;

CREATE OR REPLACE VIEW public.public_establishments
WITH (security_invoker = true) AS
SELECT id, name, address, city, logo_url, is_active
FROM public.establishments
WHERE is_active = true;

GRANT SELECT ON public.public_establishments TO anon, authenticated;

-- Allow anon to read minimal fields when fetching by id via the view's underlying select.
-- (The view filters columns; underlying RLS still requires a policy.)
CREATE POLICY "Public can view active establishment basic info"
ON public.establishments
FOR SELECT
TO anon
USING (is_active = true);
-- NOTE: anon role now has SELECT, but the app must use public_establishments view.
-- To eliminate column leak from direct anon select, restrict column privileges:
REVOKE SELECT ON public.establishments FROM anon;
GRANT SELECT (id, name, address, city, logo_url, is_active) ON public.establishments TO anon;

-- 2) Orders & order_items: drop public SELECT (was leaking all anon orders)
DROP POLICY IF EXISTS "Public can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view order_items" ON public.order_items;

-- 3) user_roles: prevent privilege escalation + allow admins to remove/update staff in their establishment
CREATE POLICY "Admins can update establishment staff roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND role NOT IN ('superadmin'::app_role, 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND role NOT IN ('superadmin'::app_role, 'admin'::app_role)
);

CREATE POLICY "Admins can delete establishment staff roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND role NOT IN ('superadmin'::app_role, 'admin'::app_role)
);

-- 4) Storage: scope product-images writes to user's establishment folder
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;

CREATE POLICY "Staff can upload product images for own establishment"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
);

CREATE POLICY "Staff can update product images for own establishment"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
);

CREATE POLICY "Staff can delete product images for own establishment"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
);

-- 5) Revoke EXECUTE on internal helper/trigger functions from anon and authenticated.
-- These are only called by triggers or by other SECURITY DEFINER functions and should not be
-- callable directly via PostgREST.
REVOKE EXECUTE ON FUNCTION public.update_floor_plans_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reservations_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_category_with_products() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_ingredient_on_purchase() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_purchase_to_expense() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_set_order_item_cost_snapshot() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_existing_purchases_on_toggle() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_ingredient_cost(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_disabled_purchase_expenses() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_supplies_expense_category(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_tips_income_category(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_tips_payout_category(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_consumption_expense_category(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_effective_cost(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid) FROM anon, authenticated;

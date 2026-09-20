REVOKE ALL ON FUNCTION public.apply_purchase_stock(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_purchase_stock(uuid, jsonb) TO authenticated;
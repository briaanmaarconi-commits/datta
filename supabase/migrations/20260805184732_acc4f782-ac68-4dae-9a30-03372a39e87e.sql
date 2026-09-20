REVOKE EXECUTE ON FUNCTION public.ensure_raw_material_expense_category(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_sync_purchase_to_expense() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_ingredient_on_purchase() FROM PUBLIC, anon;
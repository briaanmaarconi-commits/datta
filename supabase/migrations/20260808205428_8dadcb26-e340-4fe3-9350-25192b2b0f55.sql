-- ============ Cortesías: sólo admin/superadmin pueden modificar ============
DROP POLICY IF EXISTS courtesy_accounts_insert ON public.courtesy_accounts;
DROP POLICY IF EXISTS courtesy_accounts_update ON public.courtesy_accounts;
DROP POLICY IF EXISTS courtesy_accounts_delete ON public.courtesy_accounts;

CREATE POLICY courtesy_accounts_insert ON public.courtesy_accounts FOR INSERT TO authenticated
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY courtesy_accounts_update ON public.courtesy_accounts FOR UPDATE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())))
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY courtesy_accounts_delete ON public.courtesy_accounts FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));

DROP POLICY IF EXISTS courtesy_charges_update ON public.courtesy_charges;
DROP POLICY IF EXISTS courtesy_charges_delete ON public.courtesy_charges;

CREATE POLICY courtesy_charges_update ON public.courtesy_charges FOR UPDATE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())))
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY courtesy_charges_delete ON public.courtesy_charges FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));

-- ============ Caja: gestión operativa completa (excepto analíticas) ============
CREATE POLICY "Cashier can manage ingredients" ON public.ingredients FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage stock_movements" ON public.stock_movements FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage purchase_invoices" ON public.purchase_invoices FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage purchase_invoice_items" ON public.purchase_invoice_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id AND pi.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')))
WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id AND pi.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')));

CREATE POLICY "Cashier can manage product_recipes" ON public.product_recipes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_recipes.product_id AND p.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')))
WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_recipes.product_id AND p.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')));

CREATE POLICY "Cashier can manage tables" ON public.tables FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage sectors" ON public.sectors FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage floor_plans" ON public.floor_plans FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage finance_categories" ON public.finance_categories FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage finance_transactions" ON public.finance_transactions FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can update shift_controls" ON public.shift_controls FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can view audit_logs" ON public.audit_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can read insights" ON public.ai_insights FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Cashier can update insights" ON public.ai_insights FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can view staff profiles" ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id AND ur.establishment_id = get_user_establishment(auth.uid())
));

CREATE POLICY "Cashier can view establishment roles" ON public.user_roles FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Cashier can insert staff roles" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]));
CREATE POLICY "Cashier can update staff roles" ON public.user_roles FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]));
CREATE POLICY "Cashier can delete staff roles" ON public.user_roles FOR DELETE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]));

CREATE POLICY "Cashier can view staff_shifts" ON public.staff_shifts FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can update own establishment" ON public.establishments FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND id = get_user_establishment(auth.uid()));
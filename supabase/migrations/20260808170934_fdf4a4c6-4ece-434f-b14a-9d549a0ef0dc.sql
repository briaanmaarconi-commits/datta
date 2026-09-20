CREATE POLICY "Cashier can manage products" ON public.products FOR ALL TO authenticated
USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage categories" ON public.categories FOR ALL TO authenticated
USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
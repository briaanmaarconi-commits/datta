
CREATE POLICY "Cashier can insert finance_categories"
ON public.finance_categories FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

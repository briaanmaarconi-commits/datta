CREATE POLICY "Cashier can view finance_transactions"
ON public.finance_transactions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);
-- Add 'cancelled' to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Allow cashier to update their own finance_transactions
CREATE POLICY "Cashier can update own finance_transactions"
ON public.finance_transactions
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Allow cashier to delete their own finance_transactions
CREATE POLICY "Cashier can delete own finance_transactions"
ON public.finance_transactions
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND created_by = auth.uid()
);
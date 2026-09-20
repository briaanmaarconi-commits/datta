
-- Add closed_by to track who closed the shift
ALTER TABLE public.shift_controls ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.shift_controls ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Cashier can insert shift_controls (close shift)
CREATE POLICY "Cashier can insert shift_controls"
ON public.shift_controls FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can view shift_controls
CREATE POLICY "Cashier can view shift_controls"
ON public.shift_controls FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can insert finance_transactions (auto income)
CREATE POLICY "Cashier can insert finance_transactions"
ON public.finance_transactions FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can view finance_categories (to get the income category id)
CREATE POLICY "Cashier can view finance_categories"
ON public.finance_categories FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

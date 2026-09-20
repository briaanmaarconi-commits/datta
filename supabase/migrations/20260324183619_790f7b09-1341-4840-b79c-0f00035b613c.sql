
ALTER TABLE public.shift_controls ADD COLUMN opened_at timestamptz DEFAULT NULL;

-- Allow cashier to update their own shift_controls (to close a shift they opened)
CREATE POLICY "Cashier can update own shift_controls"
ON public.shift_controls FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role) 
  AND establishment_id = get_user_establishment(auth.uid())
  AND closed_by IS NULL
)
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role) 
  AND establishment_id = get_user_establishment(auth.uid())
);

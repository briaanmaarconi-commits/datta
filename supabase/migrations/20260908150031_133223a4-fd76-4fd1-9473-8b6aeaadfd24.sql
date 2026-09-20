CREATE POLICY "Waiter can create reservations"
ON public.reservations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'waiter'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

CREATE POLICY "Waiter can update reservations"
ON public.reservations
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'waiter'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'waiter'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);
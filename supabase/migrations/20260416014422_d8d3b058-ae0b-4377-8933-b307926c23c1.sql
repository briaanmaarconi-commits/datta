CREATE POLICY "Kitchen can update product availability"
ON public.products
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'kitchen'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'kitchen'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);
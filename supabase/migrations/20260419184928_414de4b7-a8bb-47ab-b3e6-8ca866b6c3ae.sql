CREATE POLICY "Admin can update own establishment"
ON public.establishments
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND id = get_user_establishment(auth.uid()));
CREATE POLICY "Admins can view staff profiles" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = profiles.id
      AND ur.establishment_id = get_user_establishment(auth.uid())
  )
  AND has_role(auth.uid(), 'admin'::app_role)
);
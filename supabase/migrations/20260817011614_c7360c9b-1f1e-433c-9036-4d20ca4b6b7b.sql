GRANT SELECT, INSERT, UPDATE, DELETE ON public.afip_certificates TO authenticated;
GRANT ALL ON public.afip_certificates TO service_role;

DROP POLICY IF EXISTS "Admin can select afip_certificates" ON public.afip_certificates;
CREATE POLICY "Admin can select afip_certificates"
ON public.afip_certificates
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);
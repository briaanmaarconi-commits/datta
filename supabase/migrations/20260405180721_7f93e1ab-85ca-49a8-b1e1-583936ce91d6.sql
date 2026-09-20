CREATE POLICY "Staff can view shift_controls"
ON public.shift_controls
FOR SELECT
TO authenticated
USING (establishment_id = get_user_establishment(auth.uid()));
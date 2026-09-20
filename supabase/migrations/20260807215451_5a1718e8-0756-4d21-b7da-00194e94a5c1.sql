CREATE OR REPLACE FUNCTION public.get_afip_cert_status(_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT (
    public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin') AND public.get_user_establishment(auth.uid()) = _establishment_id)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id, expires_at,
         coalesce(btrim(certificate_pem), '') <> '' AS has_cert,
         coalesce(btrim(private_key_pem), '') <> '' AS has_key
    INTO r
  FROM public.afip_certificates
  WHERE establishment_id = _establishment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('exists', false, 'has_cert', false, 'has_key', false);
  END IF;

  RETURN jsonb_build_object('exists', true, 'id', r.id, 'expires_at', r.expires_at, 'has_cert', r.has_cert, 'has_key', r.has_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_afip_cert_status(uuid) TO authenticated;
CREATE TABLE public.delivery_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('rappi','peya')),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  store_id text,
  external_vendor_id text,
  client_id text,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_last4 text,
  webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configured','connected','error')),
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, platform)
);

GRANT ALL ON public.delivery_integrations TO service_role;

ALTER TABLE public.delivery_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages delivery integrations"
ON public.delivery_integrations FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_delivery_integrations_updated_at
BEFORE UPDATE ON public.delivery_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_floor_plans_updated_at();

CREATE TABLE public.delivery_menu_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('rappi','peya')),
  external_item_id text NOT NULL,
  external_item_name text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, platform, external_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_menu_mapping TO authenticated;
GRANT ALL ON public.delivery_menu_mapping TO service_role;

ALTER TABLE public.delivery_menu_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can view menu mapping"
ON public.delivery_menu_mapping FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.get_user_establishment(auth.uid()) = establishment_id);

CREATE POLICY "staff can manage menu mapping"
ON public.delivery_menu_mapping FOR ALL
TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (public.get_user_establishment(auth.uid()) = establishment_id
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier')))
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (public.get_user_establishment(auth.uid()) = establishment_id
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier')))
);

CREATE TRIGGER update_delivery_menu_mapping_updated_at
BEFORE UPDATE ON public.delivery_menu_mapping
FOR EACH ROW EXECUTE FUNCTION public.update_floor_plans_updated_at();

CREATE OR REPLACE FUNCTION public.get_delivery_integration_status(_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT (
    public.is_superadmin(auth.uid())
    OR (public.get_user_establishment(auth.uid()) = _establishment_id
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier')))
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'platform', di.platform,
    'environment', di.environment,
    'store_id', di.store_id,
    'external_vendor_id', di.external_vendor_id,
    'client_id', di.client_id,
    'has_credentials', (di.credentials ? 'client_secret') OR (di.credentials ? 'api_key'),
    'secret_last4', di.secret_last4,
    'status', di.status,
    'last_checked_at', di.last_checked_at,
    'last_error', di.last_error,
    'webhook_token', di.webhook_token
  )), '[]'::jsonb)
  INTO _result
  FROM public.delivery_integrations di
  WHERE di.establishment_id = _establishment_id;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_integration_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_integration_status(uuid) TO authenticated, service_role;
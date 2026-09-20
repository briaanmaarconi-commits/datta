
-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  establishment_id UUID NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Staff can insert audit logs for their establishment
CREATE POLICY "Staff can insert audit_logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (establishment_id = get_user_establishment(auth.uid()));

-- Admin can view audit logs
CREATE POLICY "Admin can view audit_logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
  OR is_superadmin(auth.uid())
);

-- Prevent deleting categories that have products
CREATE OR REPLACE FUNCTION public.prevent_delete_category_with_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products WHERE category_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede eliminar la categoría "%" porque tiene productos asociados. Mové o eliminá los productos primero.', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER check_category_products_before_delete
BEFORE DELETE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_category_with_products();


CREATE TABLE public.floor_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  layout_data JSONB NOT NULL DEFAULT '{"elements":[],"width":800,"height":600}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(establishment_id, sector_id)
);

ALTER TABLE public.floor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage floor_plans"
ON public.floor_plans
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Staff can view floor_plans"
ON public.floor_plans
FOR SELECT
USING (establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access floor_plans"
ON public.floor_plans
FOR ALL
USING (is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_floor_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_floor_plans_updated_at
BEFORE UPDATE ON public.floor_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_floor_plans_updated_at();


-- Create sectors table
CREATE TABLE public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage sectors" ON public.sectors FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access sectors" ON public.sectors FOR ALL
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Public can view sectors" ON public.sectors FOR SELECT
  USING (true);

-- Add sector_id to tables (optional)
ALTER TABLE public.tables ADD COLUMN sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL;

-- Add guest_count to tables (temporary count set by waiter)
ALTER TABLE public.tables ADD COLUMN guest_count integer DEFAULT 0;

-- Add image_url to categories (optional)
ALTER TABLE public.categories ADD COLUMN image_url text;

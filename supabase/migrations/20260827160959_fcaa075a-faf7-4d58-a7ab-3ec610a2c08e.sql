CREATE TABLE public.menu_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.menu_combos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_combos TO authenticated;
GRANT ALL ON public.menu_combos TO service_role;

ALTER TABLE public.menu_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active combos"
ON public.menu_combos FOR SELECT
USING (is_active = true);

CREATE POLICY "Staff can view own combos"
ON public.menu_combos FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.get_user_establishment(auth.uid()) = establishment_id);

CREATE POLICY "Admins and cashiers manage combos"
ON public.menu_combos FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier'))
      AND public.get_user_establishment(auth.uid()) = establishment_id)
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier'))
      AND public.get_user_establishment(auth.uid()) = establishment_id)
);

CREATE TABLE public.menu_combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES public.menu_combos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  item_group text NOT NULL DEFAULT 'main',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.menu_combo_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_combo_items TO authenticated;
GRANT ALL ON public.menu_combo_items TO service_role;

ALTER TABLE public.menu_combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view items of active combos"
ON public.menu_combo_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.menu_combos c WHERE c.id = combo_id AND c.is_active = true));

CREATE POLICY "Staff can view own combo items"
ON public.menu_combo_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.menu_combos c
  WHERE c.id = combo_id
    AND (public.is_superadmin(auth.uid()) OR public.get_user_establishment(auth.uid()) = c.establishment_id)
));

CREATE POLICY "Admins and cashiers manage combo items"
ON public.menu_combo_items FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.menu_combos c
  WHERE c.id = combo_id
    AND (public.is_superadmin(auth.uid())
      OR ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier'))
          AND public.get_user_establishment(auth.uid()) = c.establishment_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.menu_combos c
  WHERE c.id = combo_id
    AND (public.is_superadmin(auth.uid())
      OR ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier'))
          AND public.get_user_establishment(auth.uid()) = c.establishment_id))
));

CREATE INDEX idx_menu_combos_est ON public.menu_combos(establishment_id);
CREATE INDEX idx_menu_combo_items_combo ON public.menu_combo_items(combo_id);

CREATE TRIGGER update_menu_combos_updated_at
BEFORE UPDATE ON public.menu_combos
FOR EACH ROW EXECUTE FUNCTION public.update_floor_plans_updated_at();
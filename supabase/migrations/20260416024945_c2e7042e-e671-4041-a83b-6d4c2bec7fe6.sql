
-- Ingredients (raw materials)
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'g', -- g, ml, unidad
  current_stock numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  supplier text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage ingredients" ON public.ingredients FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Staff can view ingredients" ON public.ingredients FOR SELECT
  USING (establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Superadmin full access ingredients" ON public.ingredients FOR ALL
  USING (is_superadmin(auth.uid()));
CREATE POLICY "Kitchen can update ingredients" ON public.ingredients FOR UPDATE
  USING (has_role(auth.uid(), 'kitchen'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'kitchen'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE TRIGGER update_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.update_floor_plans_updated_at();

-- Product recipes (ingredient per product)
CREATE TABLE public.product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, ingredient_id)
);

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage product_recipes" ON public.product_recipes FOR ALL
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_recipes.product_id AND p.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Staff can view product_recipes" ON public.product_recipes FOR SELECT
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_recipes.product_id AND p.establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY "Superadmin full access product_recipes" ON public.product_recipes FOR ALL
  USING (is_superadmin(auth.uid()));

-- Stock movements (full history)
CREATE TYPE public.stock_movement_type AS ENUM ('entry', 'sale', 'waste', 'adjustment');

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  type stock_movement_type NOT NULL,
  quantity numeric NOT NULL, -- positive for entry, negative for sale/waste
  reason text,
  reference_id text, -- order_id, invoice_id, etc.
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage stock_movements" ON public.stock_movements FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Staff can view stock_movements" ON public.stock_movements FOR SELECT
  USING (establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Staff can insert stock_movements" ON public.stock_movements FOR INSERT
  WITH CHECK (establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Superadmin full access stock_movements" ON public.stock_movements FOR ALL
  USING (is_superadmin(auth.uid()));

-- Purchase invoices
CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL,
  supplier text NOT NULL,
  invoice_number text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchase_invoices" ON public.purchase_invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Staff can view purchase_invoices" ON public.purchase_invoices FOR SELECT
  USING (establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Superadmin full access purchase_invoices" ON public.purchase_invoices FOR ALL
  USING (is_superadmin(auth.uid()));

-- Purchase invoice items
CREATE TABLE public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage purchase_invoice_items" ON public.purchase_invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id AND pi.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Staff can view purchase_invoice_items" ON public.purchase_invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id AND pi.establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY "Superadmin full access purchase_invoice_items" ON public.purchase_invoice_items FOR ALL
  USING (is_superadmin(auth.uid()));

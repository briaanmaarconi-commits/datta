
CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  reviewer_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert product reviews"
ON public.product_reviews FOR INSERT TO public
WITH CHECK (true);

CREATE POLICY "Anyone can view product reviews"
ON public.product_reviews FOR SELECT TO public
USING (true);

CREATE POLICY "Admin can manage product reviews"
ON public.product_reviews FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access product_reviews"
ON public.product_reviews FOR ALL TO public
USING (is_superadmin(auth.uid()));

CREATE TABLE public.waiter_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  waiter_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  reviewer_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.waiter_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert waiter reviews"
ON public.waiter_reviews FOR INSERT TO public
WITH CHECK (true);

CREATE POLICY "Anyone can view waiter reviews"
ON public.waiter_reviews FOR SELECT TO public
USING (true);

CREATE POLICY "Admin can manage waiter reviews"
ON public.waiter_reviews FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access waiter_reviews"
ON public.waiter_reviews FOR ALL TO public
USING (is_superadmin(auth.uid()));

-- GENERADO por build-schema.mjs desde supabase/migrations. No editar a mano:
-- los cambios nuevos van en archivos sql/1xx_*.sql.

-- @@MIGRATION 20260324003434_a1558940-3e85-48e0-b09f-3b0db6ec97e1.sql
-- Enums
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'cashier', 'waiter', 'kitchen');
CREATE TYPE public.table_status AS ENUM ('free', 'occupied', 'billing');
CREATE TYPE public.order_status AS ENUM ('new', 'preparing', 'ready', 'delivered', 'closed');
CREATE TYPE public.order_item_status AS ENUM ('pending', 'preparing', 'ready');

-- Establishments
CREATE TABLE public.establishments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User Roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  UNIQUE (user_id, role, establishment_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Categories
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Products
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Tables
CREATE TABLE public.tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status public.table_status NOT NULL DEFAULT 'free',
  capacity INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, number)
);
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

-- Orders
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  status public.order_status NOT NULL DEFAULT 'new',
  created_by UUID REFERENCES auth.users(id),
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  prepared_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Order Items
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  status public.order_item_status NOT NULL DEFAULT 'pending',
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_establishment(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT establishment_id FROM public.user_roles
  WHERE user_id = _user_id AND establishment_id IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'superadmin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'cashier' THEN 3
    WHEN 'waiter' THEN 4
    WHEN 'kitchen' THEN 5
  END
  LIMIT 1
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles: users read own, superadmin reads all
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_superadmin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- User Roles: superadmin full access, admins can read their establishment's roles
CREATE POLICY "Superadmin full access to user_roles" ON public.user_roles
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view establishment roles" ON public.user_roles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') AND
    establishment_id = public.get_user_establishment(auth.uid())
  );
CREATE POLICY "Admins can manage establishment roles" ON public.user_roles
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin') AND
    establishment_id = public.get_user_establishment(auth.uid()) AND
    role NOT IN ('superadmin', 'admin')
  );

-- Establishments: superadmin full, others read their own
CREATE POLICY "Superadmin full access establishments" ON public.establishments
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view their establishment" ON public.establishments
  FOR SELECT USING (id = public.get_user_establishment(auth.uid()));

-- Categories: superadmin full, establishment users can read, admin can manage
CREATE POLICY "Superadmin full access categories" ON public.categories
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view establishment categories" ON public.categories
  FOR SELECT USING (establishment_id = public.get_user_establishment(auth.uid()));
CREATE POLICY "Admin can manage categories" ON public.categories
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') AND
    establishment_id = public.get_user_establishment(auth.uid())
  );

-- Products: same pattern
CREATE POLICY "Superadmin full access products" ON public.products
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view establishment products" ON public.products
  FOR SELECT USING (establishment_id = public.get_user_establishment(auth.uid()));
CREATE POLICY "Admin can manage products" ON public.products
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') AND
    establishment_id = public.get_user_establishment(auth.uid())
  );
-- Public access for client menu (no auth needed)
CREATE POLICY "Public can view available products" ON public.products
  FOR SELECT USING (is_available = true);

-- Tables
CREATE POLICY "Superadmin full access tables" ON public.tables
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view establishment tables" ON public.tables
  FOR SELECT USING (establishment_id = public.get_user_establishment(auth.uid()));
CREATE POLICY "Admin can manage tables" ON public.tables
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') AND
    establishment_id = public.get_user_establishment(auth.uid())
  );
CREATE POLICY "Waiter can update table status" ON public.tables
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'waiter') AND
    establishment_id = public.get_user_establishment(auth.uid())
  );
CREATE POLICY "Cashier can update table status" ON public.tables
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'cashier') AND
    establishment_id = public.get_user_establishment(auth.uid())
  );

-- Orders
CREATE POLICY "Superadmin full access orders" ON public.orders
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view establishment orders" ON public.orders
  FOR SELECT USING (establishment_id = public.get_user_establishment(auth.uid()));
CREATE POLICY "Waiter can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    establishment_id = public.get_user_establishment(auth.uid())
  );
CREATE POLICY "Staff can update orders" ON public.orders
  FOR UPDATE USING (
    establishment_id = public.get_user_establishment(auth.uid())
  );
-- Public can create orders (client QR)
CREATE POLICY "Public can create orders" ON public.orders
  FOR INSERT WITH CHECK (created_by IS NULL);
CREATE POLICY "Public can view own orders" ON public.orders
  FOR SELECT USING (created_by IS NULL);

-- Order Items
CREATE POLICY "Superadmin full access order_items" ON public.order_items
  FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Users can view establishment order_items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.establishment_id = public.get_user_establishment(auth.uid())
    )
  );
CREATE POLICY "Staff can manage order_items" ON public.order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.establishment_id = public.get_user_establishment(auth.uid())
    )
  );
CREATE POLICY "Public can insert order_items" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.created_by IS NULL
    )
  );
CREATE POLICY "Public can view order_items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.created_by IS NULL
    )
  );

-- Public access to categories for client menu
CREATE POLICY "Public can view active categories" ON public.categories
  FOR SELECT USING (is_active = true);

-- Public access to tables for client menu (to verify table exists)
CREATE POLICY "Public can view tables" ON public.tables
  FOR SELECT USING (true);

-- @@MIGRATION 20260324003450_56a22220-ab73-4de3-9b61-2e0f267ad5b9.sql
-- Fix the permissive INSERT policy on profiles
-- Drop the overly permissive policy and replace with a proper one
DROP POLICY "System can insert profiles" ON public.profiles;

-- Only allow inserts from the trigger (service role) or own user
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- @@MIGRATION 20260324014107_ff7fbf7a-a549-43cc-a0ea-315efdf4fcf9.sql
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- @@MIGRATION 20260324020219_37870715-fc21-47a9-8faf-195ac21b5cb0.sql
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated users can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authenticated users can update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated users can delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');

-- @@MIGRATION 20260324023146_29ad3f0e-71dd-4eb8-8129-1f3052e5aa4d.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0;

-- @@MIGRATION 20260324031445_3c9e05c1-56a6-4248-a074-7bb83e584b5a.sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;

-- @@MIGRATION 20260324044125_e9b5c1d4-8f4b-4737-8a49-5c53fc9c1a34.sql
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

-- @@MIGRATION 20260324170546_12206590-5bb6-40c3-8230-3c4ed3d8720b.sql
CREATE POLICY "Public can view active establishments" ON public.establishments FOR SELECT USING (is_active = true);

-- @@MIGRATION 20260324171752_e851a9d1-f1d5-40fe-a9f3-bbb85a91b3d7.sql
CREATE POLICY "Admins can view staff profiles" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = profiles.id
      AND ur.establishment_id = get_user_establishment(auth.uid())
  )
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- @@MIGRATION 20260324172905_35cbc2fd-579d-4c40-9672-5e74dd0fe963.sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- @@MIGRATION 20260324180626_2cb3c468-6ac4-4862-82c4-9a21d928a447.sql
-- Expense/income categories per establishment
CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage finance_categories" ON public.finance_categories
  FOR ALL USING (has_role(auth.uid(), 'admin') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access finance_categories" ON public.finance_categories
  FOR ALL USING (is_superadmin(auth.uid()));

-- Finance transactions (income / expenses)
CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.finance_categories(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL DEFAULT 0,
  description text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage finance_transactions" ON public.finance_transactions
  FOR ALL USING (has_role(auth.uid(), 'admin') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access finance_transactions" ON public.finance_transactions
  FOR ALL USING (is_superadmin(auth.uid()));

-- Shift controls (mark shifts as reviewed/controlled)
CREATE TABLE public.shift_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  is_controlled boolean NOT NULL DEFAULT false,
  controlled_by uuid REFERENCES public.profiles(id),
  controlled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(establishment_id, shift_date)
);

ALTER TABLE public.shift_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage shift_controls" ON public.shift_controls
  FOR ALL USING (has_role(auth.uid(), 'admin') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access shift_controls" ON public.shift_controls
  FOR ALL USING (is_superadmin(auth.uid()));

-- @@MIGRATION 20260324181420_7bbb25a6-5ec6-47cf-aa1f-d031178ef5e1.sql
-- Add closed_by to track who closed the shift
ALTER TABLE public.shift_controls ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.shift_controls ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Cashier can insert shift_controls (close shift)
CREATE POLICY "Cashier can insert shift_controls"
ON public.shift_controls FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can view shift_controls
CREATE POLICY "Cashier can view shift_controls"
ON public.shift_controls FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can insert finance_transactions (auto income)
CREATE POLICY "Cashier can insert finance_transactions"
ON public.finance_transactions FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can view finance_categories (to get the income category id)
CREATE POLICY "Cashier can view finance_categories"
ON public.finance_categories FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- @@MIGRATION 20260324182259_9507b763-f88c-4642-8a0c-7b51975f99a3.sql
CREATE POLICY "Cashier can insert finance_categories"
ON public.finance_categories FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- @@MIGRATION 20260324183619_790f7b09-1341-4840-b79c-0f00035b613c.sql
ALTER TABLE public.shift_controls ADD COLUMN opened_at timestamptz DEFAULT NULL;

-- Allow cashier to update their own shift_controls (to close a shift they opened)
CREATE POLICY "Cashier can update own shift_controls"
ON public.shift_controls FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role) 
  AND establishment_id = get_user_establishment(auth.uid())
  AND closed_by IS NULL
)
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role) 
  AND establishment_id = get_user_establishment(auth.uid())
);

-- @@MIGRATION 20260324185023_e10c1ffd-82d9-4ba6-bbb8-f909a657a645.sql
ALTER TABLE public.shift_controls DROP CONSTRAINT IF EXISTS shift_controls_establishment_id_shift_date_key;

-- @@MIGRATION 20260405180721_7f93e1ab-85ca-49a8-b1e1-583936ce91d6.sql
CREATE POLICY "Staff can view shift_controls"
ON public.shift_controls
FOR SELECT
TO authenticated
USING (establishment_id = get_user_establishment(auth.uid()));

-- @@MIGRATION 20260405181517_3f7f781a-9e2b-4bb1-bd48-818a0e1a725c.sql
ALTER TABLE public.products
  ADD COLUMN cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN tax_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN promo_price numeric DEFAULT NULL,
  ADD COLUMN promo_active boolean NOT NULL DEFAULT false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.products;

-- @@MIGRATION 20260406024453_c04a8f5e-0824-4833-ae37-abf97638b794.sql
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

-- @@MIGRATION 20260412202133_4a4b94d1-8729-44d3-b884-2fc97b5c01d9.sql
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id),
  invoice_number serial,
  table_number integer NOT NULL,
  order_ids uuid[] NOT NULL,
  items jsonb NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  change_amount numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Cashier can insert invoices for their establishment
CREATE POLICY "Cashier can insert invoices"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Cashier can view invoices for their establishment
CREATE POLICY "Cashier can view invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Admin can manage invoices for their establishment
CREATE POLICY "Admin can manage invoices"
ON public.invoices FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Superadmin full access
CREATE POLICY "Superadmin full access invoices"
ON public.invoices FOR ALL
USING (is_superadmin(auth.uid()));

-- @@MIGRATION 20260413231650_8b4411d6-cbd3-4cd2-829b-08eea18dce1e.sql
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

-- @@MIGRATION 20260414022444_12f1f67d-9113-4135-b7c6-80333bde7e5c.sql
-- Table: client_plans (available subscription plans)
CREATE TABLE public.client_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text,
  features text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access client_plans"
  ON public.client_plans FOR ALL
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Authenticated can view active plans"
  ON public.client_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Extend establishments with SaaS fields
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.client_plans(id),
  ADD COLUMN IF NOT EXISTS agreed_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS service_start_date date,
  ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'active';

-- Table: datta_finance_categories
CREATE TABLE public.datta_finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.datta_finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access datta_finance_categories"
  ON public.datta_finance_categories FOR ALL
  USING (is_superadmin(auth.uid()));

-- Table: datta_transactions (Datta company finances)
CREATE TABLE public.datta_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  category_id uuid NOT NULL REFERENCES public.datta_finance_categories(id),
  establishment_id uuid REFERENCES public.establishments(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.datta_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access datta_transactions"
  ON public.datta_transactions FOR ALL
  USING (is_superadmin(auth.uid()));

-- Insert default finance categories for Datta
INSERT INTO public.datta_finance_categories (name, type) VALUES
  ('Suscripciones', 'income'),
  ('Servicios adicionales', 'income'),
  ('Salarios', 'expense'),
  ('Infraestructura', 'expense'),
  ('Marketing', 'expense'),
  ('Otros ingresos', 'income'),
  ('Otros gastos', 'expense');

-- @@MIGRATION 20260414023133_f3e2a8e9-6606-40d5-abb3-af477630587c.sql
CREATE TABLE public.client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'transfer',
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(establishment_id, period_month, period_year)
);

ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access client_payments"
  ON public.client_payments FOR ALL
  USING (is_superadmin(auth.uid()));

-- @@MIGRATION 20260414151755_425e0bc5-848c-40a4-8290-5e343e13e20f.sql
ALTER TABLE public.shift_controls
  ADD COLUMN initial_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN actual_cash numeric,
  ADD COLUMN cash_difference numeric;

-- @@MIGRATION 20260415030306_42a395a3-35f0-4d2c-be5d-32a8cf9a5ff1.sql
-- Add daily special flag to products
ALTER TABLE public.products ADD COLUMN is_daily_special boolean NOT NULL DEFAULT false;

-- Create waiter_calls table
CREATE TABLE public.waiter_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

-- Anyone can create a waiter call (public menu, no auth)
CREATE POLICY "Anyone can create waiter calls"
ON public.waiter_calls FOR INSERT
WITH CHECK (true);

-- Anyone can view waiter calls (needed for client cooldown check)
CREATE POLICY "Anyone can view waiter calls"
ON public.waiter_calls FOR SELECT
USING (true);

-- Staff can update waiter calls (acknowledge)
CREATE POLICY "Staff can update waiter calls"
ON public.waiter_calls FOR UPDATE
USING (establishment_id = get_user_establishment(auth.uid()));

-- Superadmin full access
CREATE POLICY "Superadmin full access waiter_calls"
ON public.waiter_calls FOR ALL
USING (is_superadmin(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiter_calls;

-- @@MIGRATION 20260415203455_7d608d6d-ee52-4618-92dc-16ba1380cad2.sql
CREATE POLICY "Cashier can view finance_transactions"
ON public.finance_transactions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- @@MIGRATION 20260416011419_79cc20c0-46a3-477f-a6f8-15c9b3ac6379.sql
CREATE INDEX IF NOT EXISTS idx_orders_establishment_status ON public.orders(establishment_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_establishment_created ON public.orders(establishment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_establishment ON public.products(establishment_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_establishment_date ON public.finance_transactions(establishment_id, date);
CREATE INDEX IF NOT EXISTS idx_tables_establishment ON public.tables(establishment_id);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_establishment_status ON public.waiter_calls(establishment_id, status);

-- @@MIGRATION 20260416014422_d8d3b058-ae0b-4377-8933-b307926c23c1.sql
CREATE POLICY "Kitchen can update product availability"
ON public.products
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'kitchen'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'kitchen'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- @@MIGRATION 20260416014931_1afe9596-4d89-46fb-a8db-e0e3bf96a0c3.sql
-- Add 'cancelled' to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Allow cashier to update their own finance_transactions
CREATE POLICY "Cashier can update own finance_transactions"
ON public.finance_transactions
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- Allow cashier to delete their own finance_transactions
CREATE POLICY "Cashier can delete own finance_transactions"
ON public.finance_transactions
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'cashier'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND created_by = auth.uid()
);

-- @@MIGRATION 20260416015942_9747aa78-e5dd-4cae-9164-497f244f6e0a.sql
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

-- @@MIGRATION 20260416024945_c2e7042e-e671-4041-a83b-6d4c2bec7fe6.sql
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

-- @@MIGRATION 20260416031601_531b1887-5a02-4666-b721-ba8cf3c3fde7.sql
-- Add stock tracking mode to products
ALTER TABLE public.products
  ADD COLUMN stock_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN direct_stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN direct_min_stock numeric NOT NULL DEFAULT 0;

-- Add constraint for valid stock modes
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_mode_check
  CHECK (stock_mode IN ('none', 'direct', 'recipe'));

-- @@MIGRATION 20260419165232_77b9cc5b-084b-4c3a-a079-27685fe621b8.sql
ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS purchase_quantity numeric,
  ADD COLUMN IF NOT EXISTS purchase_unit text;

-- @@MIGRATION 20260419181949_caa2ed3d-471f-49b1-a130-ac17f16f1db2.sql
-- 1. Settings en establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS auto_purchase_to_expense boolean NOT NULL DEFAULT true;

-- 2. Modo de costo en ingredientes (manual o promedio ponderado)
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS cost_mode text NOT NULL DEFAULT 'weighted_avg' CHECK (cost_mode IN ('manual', 'weighted_avg'));

-- 3. Modo de costo en productos (manual o calculado por receta)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_mode text NOT NULL DEFAULT 'manual' CHECK (cost_mode IN ('manual', 'recipe'));

-- 4. Snapshot de costo en order_items (para reportes históricos)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cost_snapshot numeric NOT NULL DEFAULT 0;

-- 5. Vincular compras con gastos automáticos
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS auto_expense boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS finance_transaction_id uuid;

-- 6. Función: recalcular costo del ingrediente como promedio ponderado de todas las compras
CREATE OR REPLACE FUNCTION public.recalculate_ingredient_cost(_ingredient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mode text;
  _total_qty numeric;
  _total_cost numeric;
  _new_cost numeric;
BEGIN
  SELECT cost_mode INTO _mode FROM public.ingredients WHERE id = _ingredient_id;
  IF _mode <> 'weighted_avg' THEN RETURN; END IF;

  -- Sumar cantidades y montos de todas las compras del ingrediente (en unidad base ya convertida)
  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(quantity * unit_price), 0)
    INTO _total_qty, _total_cost
  FROM public.purchase_invoice_items
  WHERE ingredient_id = _ingredient_id;

  IF _total_qty > 0 THEN
    _new_cost := _total_cost / _total_qty;
    UPDATE public.ingredients SET cost_per_unit = _new_cost, updated_at = now() WHERE id = _ingredient_id;
  END IF;
END;
$$;

-- 7. Trigger: cuando se inserta/actualiza/elimina un item de compra, recalcular costo del ingrediente
CREATE OR REPLACE FUNCTION public.trg_recalc_ingredient_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_ingredient_cost(NEW.ingredient_id);
    IF TG_OP = 'UPDATE' AND NEW.ingredient_id <> OLD.ingredient_id THEN
      PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recalc_ingredient_cost_trigger ON public.purchase_invoice_items;
CREATE TRIGGER recalc_ingredient_cost_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_ingredient_on_purchase();

-- 8. Función: obtener costo calculado de un producto en base a su receta
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(pr.quantity * i.cost_per_unit), 0)
  FROM public.product_recipes pr
  JOIN public.ingredients i ON i.id = pr.ingredient_id
  WHERE pr.product_id = _product_id;
$$;

-- 9. Función: obtener costo efectivo (manual o por receta según modo)
CREATE OR REPLACE FUNCTION public.get_product_effective_cost(_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.cost_mode = 'recipe' THEN public.get_product_recipe_cost(_product_id)
    ELSE p.cost
  END
  FROM public.products p
  WHERE p.id = _product_id;
$$;

-- 10. Trigger en order_items: guardar snapshot de costo al insertar
CREATE OR REPLACE FUNCTION public.trg_set_order_item_cost_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_snapshot IS NULL OR NEW.cost_snapshot = 0 THEN
    NEW.cost_snapshot := public.get_product_effective_cost(NEW.product_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_item_cost_snapshot_trigger ON public.order_items;
CREATE TRIGGER set_order_item_cost_snapshot_trigger
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_set_order_item_cost_snapshot();

-- 11. Asegurar categoría de gastos "Compras de insumos" por establecimiento
CREATE OR REPLACE FUNCTION public.ensure_supplies_expense_category(_establishment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Compras de insumos' AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Compras de insumos', 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$$;

-- 12. Trigger: cuando se inserta/actualiza/elimina una purchase_invoice, sincronizar gasto
CREATE OR REPLACE FUNCTION public.trg_sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _est_auto boolean;
  _cat_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = OLD.finance_transaction_id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT auto_purchase_to_expense INTO _est_auto FROM public.establishments WHERE id = NEW.establishment_id;

  IF NEW.auto_expense AND COALESCE(_est_auto, true) THEN
    _cat_id := public.ensure_supplies_expense_category(NEW.establishment_id);

    IF NEW.finance_transaction_id IS NULL THEN
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (NEW.establishment_id, _cat_id, 'expense', NEW.total,
              'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, ''),
              NEW.invoice_date, NEW.created_by)
      RETURNING id INTO NEW.finance_transaction_id;
    ELSE
      UPDATE public.finance_transactions
        SET amount = NEW.total,
            description = 'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, ''),
            date = NEW.invoice_date,
            category_id = _cat_id
        WHERE id = NEW.finance_transaction_id;
    END IF;
  ELSE
    -- Si se desactivó auto_expense pero había una transacción, eliminarla
    IF NEW.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = NEW.finance_transaction_id;
      NEW.finance_transaction_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_purchase_to_expense_trigger ON public.purchase_invoices;
CREATE TRIGGER sync_purchase_to_expense_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_purchase_to_expense();

-- @@MIGRATION 20260419183615_fce1e753-de99-4787-8088-77f1793164bd.sql
-- Trigger para sincronizar compras de ingredientes con caja (salidas)
DROP TRIGGER IF EXISTS trg_purchase_invoices_sync_expense ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_sync_expense
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_purchase_to_expense();

-- Trigger para recalcular costo del ingrediente (promedio ponderado) al cargar items
DROP TRIGGER IF EXISTS trg_purchase_items_recalc_cost ON public.purchase_invoice_items;
CREATE TRIGGER trg_purchase_items_recalc_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_ingredient_on_purchase();

-- Trigger para snapshot de costo al crear order_items
DROP TRIGGER IF EXISTS trg_order_items_cost_snapshot ON public.order_items;
CREATE TRIGGER trg_order_items_cost_snapshot
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_order_item_cost_snapshot();

-- Backfill: para compras existentes con auto_expense=true sin finance_transaction_id, generar la transacción
DO $$
DECLARE
  rec RECORD;
  _cat_id uuid;
  _new_tx uuid;
  _est_auto boolean;
BEGIN
  FOR rec IN
    SELECT pi.* FROM public.purchase_invoices pi
    WHERE pi.auto_expense = true AND pi.finance_transaction_id IS NULL
  LOOP
    SELECT auto_purchase_to_expense INTO _est_auto FROM public.establishments WHERE id = rec.establishment_id;
    IF COALESCE(_est_auto, true) THEN
      _cat_id := public.ensure_supplies_expense_category(rec.establishment_id);
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (rec.establishment_id, _cat_id, 'expense', rec.total,
              'Compra: ' || rec.supplier || COALESCE(' #' || rec.invoice_number, ''),
              rec.invoice_date, rec.created_by)
      RETURNING id INTO _new_tx;
      UPDATE public.purchase_invoices SET finance_transaction_id = _new_tx WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- @@MIGRATION 20260419184928_414de4b7-a8bb-47ab-b3e6-8ca866b6c3ae.sql
CREATE POLICY "Admin can update own establishment"
ON public.establishments
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND id = get_user_establishment(auth.uid()));

-- @@MIGRATION 20260419185615_599ac0dc-0450-4198-a3e0-70e646e1f441.sql
-- Trigger sobre establishments: al cambiar auto_purchase_to_expense, sincronizar las compras existentes
CREATE OR REPLACE FUNCTION public.trg_sync_existing_purchases_on_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cat_id uuid;
  _purchase record;
  _new_tx_id uuid;
BEGIN
  IF NEW.auto_purchase_to_expense = OLD.auto_purchase_to_expense THEN
    RETURN NEW;
  END IF;

  IF NEW.auto_purchase_to_expense = false THEN
    -- Desactivado: borrar TODAS las finance_transactions vinculadas a compras de este establecimiento
    DELETE FROM public.finance_transactions
     WHERE id IN (
       SELECT finance_transaction_id FROM public.purchase_invoices
        WHERE establishment_id = NEW.id AND finance_transaction_id IS NOT NULL
     );
    UPDATE public.purchase_invoices
       SET finance_transaction_id = NULL
     WHERE establishment_id = NEW.id;
  ELSE
    -- Reactivado: recrear finance_transactions para compras con auto_expense=true que no tengan
    _cat_id := public.ensure_supplies_expense_category(NEW.id);
    FOR _purchase IN
      SELECT * FROM public.purchase_invoices
       WHERE establishment_id = NEW.id
         AND auto_expense = true
         AND finance_transaction_id IS NULL
    LOOP
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (NEW.id, _cat_id, 'expense', _purchase.total,
              'Compra: ' || _purchase.supplier || COALESCE(' #' || _purchase.invoice_number, ''),
              _purchase.invoice_date, _purchase.created_by)
      RETURNING id INTO _new_tx_id;

      UPDATE public.purchase_invoices SET finance_transaction_id = _new_tx_id WHERE id = _purchase.id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_establishments_sync_purchases ON public.establishments;
CREATE TRIGGER trg_establishments_sync_purchases
AFTER UPDATE OF auto_purchase_to_expense ON public.establishments
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_existing_purchases_on_toggle();

-- @@MIGRATION 20260419185809_d0085132-703d-4922-a36b-b73f13fc6a2a.sql
select 1;

-- @@MIGRATION 20260419185849_b212ffb4-e7f4-4ced-8b73-4a09275c1d5b.sql
CREATE OR REPLACE FUNCTION public.cleanup_disabled_purchase_expenses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.finance_transactions ft
  USING public.purchase_invoices pi, public.establishments e
  WHERE pi.finance_transaction_id = ft.id
    AND e.id = pi.establishment_id
    AND e.auto_purchase_to_expense = false;

  UPDATE public.purchase_invoices pi
  SET finance_transaction_id = NULL
  FROM public.establishments e
  WHERE e.id = pi.establishment_id
    AND e.auto_purchase_to_expense = false
    AND pi.finance_transaction_id IS NOT NULL;
END;
$$;

-- @@MIGRATION 20260419225907_2e8286ac-c6c8-4708-ac3a-474aed385d75.sql
-- 1. Agregar nuevo valor al enum stock_movement_type
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'consumption';

-- 2. Agregar columnas para subtipo de consumo y vínculo a finance_transactions
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS consumption_type text,
  ADD COLUMN IF NOT EXISTS finance_transaction_id uuid;

-- 3. Función para asegurar que existan las categorías de gasto para consumos internos
CREATE OR REPLACE FUNCTION public.ensure_consumption_expense_category(_establishment_id uuid, _consumption_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cat_name text;
  _cat_id uuid;
BEGIN
  _cat_name := CASE _consumption_type
    WHEN 'invitation' THEN 'Invitaciones / Cortesías'
    WHEN 'staff_meal' THEN 'Comida de personal'
    WHEN 'internal' THEN 'Consumo interno'
    ELSE 'Consumos internos'
  END;

  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = _cat_name AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, _cat_name, 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$$;

-- @@MIGRATION 20260420172911_7afa3dc6-084e-4e11-b5fe-32bd484e3eac.sql
-- 1. Add tip_mode to establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS tip_mode text NOT NULL DEFAULT 'individual'
  CHECK (tip_mode IN ('pool', 'individual'));

-- 2. Add tip-related fields to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_payment_method text,
  ADD COLUMN IF NOT EXISTS tip_waiter_id uuid,
  ADD COLUMN IF NOT EXISTS tip_mode text,
  ADD COLUMN IF NOT EXISTS tip_settled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tip_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS tip_settlement_tx_id uuid;

-- 3. Helper function: ensure "Propinas" income category exists (separate from "Ventas")
CREATE OR REPLACE FUNCTION public.ensure_tips_income_category(_establishment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Propinas' AND type = 'income'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Propinas', 'income')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$function$;

-- 4. Helper function: ensure "Pago de propinas" expense category
CREATE OR REPLACE FUNCTION public.ensure_tips_payout_category(_establishment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Pago de propinas' AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Pago de propinas', 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$function$;

-- Index to speed up tip settlement queries
CREATE INDEX IF NOT EXISTS idx_invoices_tip_settlement
  ON public.invoices(establishment_id, tip_settled, tip_payment_method)
  WHERE tip_amount > 0;

-- @@MIGRATION 20260421030411_2ccbaa3b-cddc-4ec4-a24b-1817205563a0.sql
-- Add fiscal columns to establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS cuit text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS domicilio_comercial text,
  ADD COLUMN IF NOT EXISTS iibb text,
  ADD COLUMN IF NOT EXISTS inicio_actividades date,
  ADD COLUMN IF NOT EXISTS condicion_iva text DEFAULT 'monotributo',
  ADD COLUMN IF NOT EXISTS punto_venta_afip integer,
  ADD COLUMN IF NOT EXISTS afip_environment text DEFAULT 'testing';

-- Table for AFIP digital certificates
CREATE TABLE public.afip_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  certificate_pem text NOT NULL,
  private_key_pem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at date,
  UNIQUE(establishment_id)
);

ALTER TABLE public.afip_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage afip_certificates"
  ON public.afip_certificates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access afip_certificates"
  ON public.afip_certificates FOR ALL
  USING (is_superadmin(auth.uid()));

-- Table for fiscal invoices (facturas and credit notes)
CREATE TABLE public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id),
  invoice_ids uuid[],
  tipo_cbte integer NOT NULL,
  punto_venta integer NOT NULL,
  cbte_numero bigint,
  cae text,
  cae_vto date,
  total numeric NOT NULL DEFAULT 0,
  neto_gravado numeric,
  iva_amount numeric,
  items_detail jsonb,
  payment_method text,
  receptor_cuit text,
  receptor_razon_social text,
  receptor_condicion_iva text DEFAULT 'consumidor_final',
  status text NOT NULL DEFAULT 'pending',
  afip_response jsonb,
  is_credit_note boolean NOT NULL DEFAULT false,
  related_fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id),
  credit_note_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cashier can insert fiscal_invoices"
  ON public.fiscal_invoices FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can view fiscal_invoices"
  ON public.fiscal_invoices FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Admin can manage fiscal_invoices"
  ON public.fiscal_invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access fiscal_invoices"
  ON public.fiscal_invoices FOR ALL
  USING (is_superadmin(auth.uid()));

-- Index for quick lookups
CREATE INDEX idx_fiscal_invoices_establishment ON public.fiscal_invoices(establishment_id);
CREATE INDEX idx_fiscal_invoices_invoice_id ON public.fiscal_invoices(invoice_id);
CREATE INDEX idx_fiscal_invoices_status ON public.fiscal_invoices(establishment_id, status);

-- @@MIGRATION 20260427230045_984c38dd-9233-4151-b83e-82337a6d6dd3.sql
CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'seated', 'cancelled', 'no_show');

CREATE TABLE public.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id uuid NOT NULL,
  table_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  party_size integer NOT NULL DEFAULT 2,
  reservation_at timestamp with time zone NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'confirmed',
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_reservations_establishment_time ON public.reservations(establishment_id, reservation_at);
CREATE INDEX idx_reservations_table_time ON public.reservations(table_id, reservation_at);
CREATE INDEX idx_reservations_status ON public.reservations(status);

CREATE OR REPLACE FUNCTION public.update_reservations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_reservations_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.update_reservations_updated_at();

CREATE POLICY "Admin can manage reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Waiter can view reservations"
ON public.reservations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'waiter'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- @@MIGRATION 20260611235001_893c54df-4e47-4482-8368-ae6d13bd7988.sql
-- 1) Establishments: remove broad public select, add safe public view
DROP POLICY IF EXISTS "Public can view active establishments" ON public.establishments;

CREATE OR REPLACE VIEW public.public_establishments
WITH (security_invoker = true) AS
SELECT id, name, address, city, logo_url, is_active
FROM public.establishments
WHERE is_active = true;

GRANT SELECT ON public.public_establishments TO anon, authenticated;

-- Allow anon to read minimal fields when fetching by id via the view's underlying select.
-- (The view filters columns; underlying RLS still requires a policy.)
CREATE POLICY "Public can view active establishment basic info"
ON public.establishments
FOR SELECT
TO anon
USING (is_active = true);
-- NOTE: anon role now has SELECT, but the app must use public_establishments view.
-- To eliminate column leak from direct anon select, restrict column privileges:
REVOKE SELECT ON public.establishments FROM anon;
GRANT SELECT (id, name, address, city, logo_url, is_active) ON public.establishments TO anon;

-- 2) Orders & order_items: drop public SELECT (was leaking all anon orders)
DROP POLICY IF EXISTS "Public can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view order_items" ON public.order_items;

-- 3) user_roles: prevent privilege escalation + allow admins to remove/update staff in their establishment
CREATE POLICY "Admins can update establishment staff roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND role NOT IN ('superadmin'::app_role, 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND role NOT IN ('superadmin'::app_role, 'admin'::app_role)
);

CREATE POLICY "Admins can delete establishment staff roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
  AND role NOT IN ('superadmin'::app_role, 'admin'::app_role)
);

-- 4) Storage: scope product-images writes to user's establishment folder
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;

CREATE POLICY "Staff can upload product images for own establishment"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
);

CREATE POLICY "Staff can update product images for own establishment"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
);

CREATE POLICY "Staff can delete product images for own establishment"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[2] = get_user_establishment(auth.uid())::text
);

-- 5) Revoke EXECUTE on internal helper/trigger functions from anon and authenticated.
-- These are only called by triggers or by other SECURITY DEFINER functions and should not be
-- callable directly via PostgREST.
REVOKE EXECUTE ON FUNCTION public.update_floor_plans_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reservations_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_category_with_products() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_ingredient_on_purchase() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_purchase_to_expense() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_set_order_item_cost_snapshot() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_existing_purchases_on_toggle() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_ingredient_cost(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_disabled_purchase_expenses() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_supplies_expense_category(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_tips_income_category(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_tips_payout_category(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_consumption_expense_category(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_effective_cost(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid) FROM anon, authenticated;

-- @@MIGRATION 20260612013332_17f5a060-fd9e-42b7-97cd-34c0d7f2e1f5.sql
CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON public.order_items(order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_orders_est_status_created ON public.orders(establishment_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_est_created ON public.audit_logs(establishment_id, created_at DESC);

-- @@MIGRATION 20260612024950_74608de7-e6f3-4300-afa1-fe5afcbbf878.sql
CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_est_name_type_unique
  ON public.finance_categories (establishment_id, lower(name), type);

CREATE OR REPLACE FUNCTION public.seed_default_finance_categories(_establishment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expense_cats text[] := ARRAY[
    'Costo de mercadería',
    'Sueldos',
    'Alquiler',
    'Luz',
    'Gas',
    'Agua',
    'Internet',
    'Impuestos',
    'Mantenimiento',
    'Marketing',
    'Mermas',
    'Otros'
  ];
  _income_cats text[] := ARRAY[
    'Otros ingresos'
  ];
  _name text;
BEGIN
  FOREACH _name IN ARRAY _expense_cats LOOP
    INSERT INTO public.finance_categories (establishment_id, name, type)
    SELECT _establishment_id, _name, 'expense'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.finance_categories
       WHERE establishment_id = _establishment_id
         AND lower(name) = lower(_name)
         AND type = 'expense'
    );
  END LOOP;

  FOREACH _name IN ARRAY _income_cats LOOP
    INSERT INTO public.finance_categories (establishment_id, name, type)
    SELECT _establishment_id, _name, 'income'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.finance_categories
       WHERE establishment_id = _establishment_id
         AND lower(name) = lower(_name)
         AND type = 'income'
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_finance_categories(uuid) TO authenticated;

-- @@MIGRATION 20260615185756_a4885a3a-9ff0-42c0-b0fe-a3b45b036048.sql
-- 1) afip_certificates: drop ALL admin policy, replace with INSERT/UPDATE/DELETE only (no SELECT)
DROP POLICY IF EXISTS "Admin can manage afip_certificates" ON public.afip_certificates;
CREATE POLICY "Admin can insert afip_certificates" ON public.afip_certificates
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Admin can update afip_certificates" ON public.afip_certificates
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Admin can delete afip_certificates" ON public.afip_certificates
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));
-- Also revoke SELECT column grants from authenticated to prevent reads
REVOKE SELECT ON public.afip_certificates FROM authenticated, anon;
GRANT SELECT (id, establishment_id, expires_at, created_at) ON public.afip_certificates TO authenticated;

-- 2) products: restrict anonymous SELECT columns (hide cost / stock fields)
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (id, category_id, establishment_id, name, description, price, image_url, is_available, created_at, promo_price, promo_active, is_daily_special) ON public.products TO anon;

-- 3) tables: restrict anonymous SELECT columns (hide status/guest_count)
REVOKE SELECT ON public.tables FROM anon;
GRANT SELECT (id, establishment_id, sector_id, number, capacity) ON public.tables TO anon;

-- 4) waiter_calls: remove anonymous SELECT entirely; staff-only reads scoped to their establishment
DROP POLICY IF EXISTS "Anyone can view waiter calls" ON public.waiter_calls;
CREATE POLICY "Staff can view waiter calls" ON public.waiter_calls
  FOR SELECT TO authenticated
  USING (establishment_id = get_user_establishment(auth.uid()));
REVOKE SELECT ON public.waiter_calls FROM anon;

-- @@MIGRATION 20260624014236_31197993-5d27-4835-891f-9666e973d815.sql
-- Phase 1 foundations: AI insights, preferences, staff shifts, delivery columns on orders, establishment report settings

-- 1) ai_insights table
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('alert','recommendation')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  category text NOT NULL CHECK (category IN ('sales','costs','product','stock','operations','health','other')),
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX idx_ai_insights_est_status ON public.ai_insights(establishment_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read insights of their establishment" ON public.ai_insights
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(),'admin') AND establishment_id = public.get_user_establishment(auth.uid()))
  );
CREATE POLICY "Admins update insights of their establishment" ON public.ai_insights
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(),'admin') AND establishment_id = public.get_user_establishment(auth.uid()))
  );
CREATE POLICY "Service role full access ai_insights" ON public.ai_insights
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) ai_insight_preferences
CREATE TABLE public.ai_insight_preferences (
  establishment_id uuid PRIMARY KEY REFERENCES public.establishments(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  silenced_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  thresholds jsonb NOT NULL DEFAULT '{"sales_drop_pct":15,"cost_rise_pct":15,"ticket_drop_pct":10}'::jsonb,
  daily_report_enabled boolean NOT NULL DEFAULT true,
  daily_report_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  daily_report_hour int NOT NULL DEFAULT 8 CHECK (daily_report_hour BETWEEN 0 AND 23),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insight_preferences TO authenticated;
GRANT ALL ON public.ai_insight_preferences TO service_role;
ALTER TABLE public.ai_insight_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage their preferences" ON public.ai_insight_preferences
  FOR ALL TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(),'admin') AND establishment_id = public.get_user_establishment(auth.uid()))
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(),'admin') AND establishment_id = public.get_user_establishment(auth.uid()))
  );
CREATE POLICY "Service role full access ai_prefs" ON public.ai_insight_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) staff_shifts (turnos de personal, no confundir con shift_controls de caja)
CREATE TABLE public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  tables_served int NOT NULL DEFAULT 0,
  orders_count int NOT NULL DEFAULT 0,
  sales_total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_shifts_user_active ON public.staff_shifts(user_id) WHERE ended_at IS NULL;
CREATE INDEX idx_staff_shifts_est ON public.staff_shifts(establishment_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own or admin reads all" ON public.staff_shifts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(),'admin') AND establishment_id = public.get_user_establishment(auth.uid()))
  );
CREATE POLICY "Users open own shift" ON public.staff_shifts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND establishment_id = public.get_user_establishment(auth.uid()));
CREATE POLICY "Users close own or admin updates" ON public.staff_shifts
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_superadmin(auth.uid())
    OR (public.has_role(auth.uid(),'admin') AND establishment_id = public.get_user_establishment(auth.uid()))
  );
CREATE POLICY "Service role full access staff_shifts" ON public.staff_shifts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Extender orders para delivery / canal
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'dine_in' CHECK (channel IN ('dine_in','delivery','takeaway')),
  ADD COLUMN IF NOT EXISTS external_platform text,
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address jsonb;
CREATE INDEX IF NOT EXISTS idx_orders_channel ON public.orders(establishment_id, channel, created_at DESC);

-- 5) Onboarding flag on establishments (used by Fase 5; cheap to add now)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 6) Helper: ensure default prefs exist for an establishment
CREATE OR REPLACE FUNCTION public.ensure_insight_preferences(_establishment_id uuid)
RETURNS public.ai_insight_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.ai_insight_preferences;
BEGIN
  SELECT * INTO _row FROM public.ai_insight_preferences WHERE establishment_id = _establishment_id;
  IF NOT FOUND THEN
    INSERT INTO public.ai_insight_preferences (establishment_id)
    VALUES (_establishment_id)
    RETURNING * INTO _row;
  END IF;
  RETURN _row;
END;
$$;

-- @@MIGRATION 20260624015250_7efc0586-b8f3-448d-a00a-1fd907dcd263.sql
CREATE OR REPLACE FUNCTION public.get_business_health(_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today_start timestamptz := date_trunc('day', now());
  _today_end   timestamptz := _today_start + interval '1 day';
  _week_start  timestamptz := _today_start - interval '7 days';
  _week_end    timestamptz := _today_start;
  _prev_week_start timestamptz := _today_start - interval '14 days';
  _prev_week_end   timestamptz := _today_start - interval '7 days';

  _sales_week numeric;
  _sales_prev numeric;
  _orders_week int;
  _orders_prev int;
  _ticket_week numeric;
  _ticket_prev numeric;
  _cost_week numeric;
  _expenses_week numeric;
  _active_tables int;
  _total_tables int;

  _growth_score numeric;
  _ticket_score numeric;
  _cost_score numeric;
  _occ_score numeric;
  _final_score int;
BEGIN
  SELECT COALESCE(SUM(total), 0), COUNT(*)
    INTO _sales_week, _orders_week
  FROM orders
  WHERE establishment_id = _establishment_id
    AND status = 'closed'
    AND created_at >= _week_start AND created_at < _week_end;

  SELECT COALESCE(SUM(total), 0), COUNT(*)
    INTO _sales_prev, _orders_prev
  FROM orders
  WHERE establishment_id = _establishment_id
    AND status = 'closed'
    AND created_at >= _prev_week_start AND created_at < _prev_week_end;

  _ticket_week := CASE WHEN _orders_week > 0 THEN _sales_week / _orders_week ELSE 0 END;
  _ticket_prev := CASE WHEN _orders_prev > 0 THEN _sales_prev / _orders_prev ELSE 0 END;

  SELECT COALESCE(SUM(oi.quantity * oi.cost_snapshot), 0)
    INTO _cost_week
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.establishment_id = _establishment_id
    AND o.status = 'closed'
    AND o.created_at >= _week_start AND o.created_at < _week_end;

  SELECT COALESCE(SUM(amount), 0)
    INTO _expenses_week
  FROM finance_transactions
  WHERE establishment_id = _establishment_id
    AND type = 'expense'
    AND date >= _week_start::date AND date < _week_end::date;

  SELECT COUNT(*) FILTER (WHERE status <> 'free'), COUNT(*)
    INTO _active_tables, _total_tables
  FROM tables WHERE establishment_id = _establishment_id;

  -- Sub-scores 0-100
  _growth_score := CASE
    WHEN _sales_prev = 0 AND _sales_week > 0 THEN 80
    WHEN _sales_prev = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, 50 + ((_sales_week - _sales_prev) / _sales_prev) * 100))
  END;

  _ticket_score := CASE
    WHEN _ticket_prev = 0 AND _ticket_week > 0 THEN 70
    WHEN _ticket_prev = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, 50 + ((_ticket_week - _ticket_prev) / _ticket_prev) * 100))
  END;

  -- Cost ratio (mercadería + gastos operativos) sobre ventas: ideal <60%
  _cost_score := CASE
    WHEN _sales_week = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, 100 - ((_cost_week + _expenses_week) / _sales_week) * 100))
  END;

  _occ_score := CASE
    WHEN _total_tables = 0 THEN 50
    ELSE LEAST(100, (_active_tables::numeric / _total_tables) * 100)
  END;

  _final_score := ROUND((_growth_score * 0.35 + _ticket_score * 0.20 + _cost_score * 0.30 + _occ_score * 0.15))::int;

  RETURN jsonb_build_object(
    'score', _final_score,
    'sales_week', _sales_week,
    'sales_prev', _sales_prev,
    'orders_week', _orders_week,
    'orders_prev', _orders_prev,
    'avg_ticket_week', _ticket_week,
    'avg_ticket_prev', _ticket_prev,
    'cost_week', _cost_week,
    'expenses_week', _expenses_week,
    'active_tables', _active_tables,
    'total_tables', _total_tables,
    'sub_scores', jsonb_build_object(
      'growth', ROUND(_growth_score),
      'ticket', ROUND(_ticket_score),
      'cost',   ROUND(_cost_score),
      'occupancy', ROUND(_occ_score)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_business_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_health(uuid) TO authenticated, service_role;

-- @@MIGRATION 20260803203813_e0b473d9-8abc-477d-b59a-97d8b9eb773e.sql
GRANT SELECT (id, number, establishment_id, sector_id, status, capacity) ON public.tables TO anon;

-- @@MIGRATION 20260805184705_4be770d9-4531-4717-b876-efae36cbb770.sql
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS stock_simple_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS unit text;

ALTER TABLE public.purchase_invoice_items
  ALTER COLUMN ingredient_id DROP NOT NULL;

UPDATE public.establishments SET stock_simple_mode = true WHERE name ILIKE '%bodegon 65%' OR name ILIKE '%bodegón 65%';

CREATE OR REPLACE FUNCTION public.ensure_raw_material_expense_category(_establishment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  SELECT id INTO _cat_id FROM public.finance_categories
   WHERE establishment_id = _establishment_id AND name = 'Costo de mercadería' AND type = 'expense'
   LIMIT 1;

  IF _cat_id IS NULL THEN
    INSERT INTO public.finance_categories (establishment_id, name, type)
    VALUES (_establishment_id, 'Costo de mercadería', 'expense')
    RETURNING id INTO _cat_id;
  END IF;

  RETURN _cat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_ingredient_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.ingredient_id IS NOT NULL THEN
      PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.ingredient_id IS NOT NULL THEN
      PERFORM public.recalculate_ingredient_cost(NEW.ingredient_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.ingredient_id IS NOT NULL AND NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id THEN
      PERFORM public.recalculate_ingredient_cost(OLD.ingredient_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _est_auto boolean;
  _simple boolean;
  _cat_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = OLD.finance_transaction_id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT auto_purchase_to_expense, stock_simple_mode
    INTO _est_auto, _simple
  FROM public.establishments WHERE id = NEW.establishment_id;

  IF NEW.auto_expense AND (COALESCE(_simple, false) OR COALESCE(_est_auto, true)) THEN
    IF COALESCE(_simple, false) THEN
      _cat_id := public.ensure_raw_material_expense_category(NEW.establishment_id);
    ELSE
      _cat_id := public.ensure_supplies_expense_category(NEW.establishment_id);
    END IF;

    IF NEW.finance_transaction_id IS NULL THEN
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by)
      VALUES (NEW.establishment_id, _cat_id, 'expense', NEW.total,
              'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, ''),
              NEW.invoice_date, NEW.created_by)
      RETURNING id INTO NEW.finance_transaction_id;
    ELSE
      UPDATE public.finance_transactions
        SET amount = NEW.total,
            description = 'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, ''),
            date = NEW.invoice_date,
            category_id = _cat_id
        WHERE id = NEW.finance_transaction_id;
    END IF;
  ELSE
    IF NEW.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = NEW.finance_transaction_id;
      NEW.finance_transaction_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- @@MIGRATION 20260805184732_acc4f782-ac68-4dae-9a30-03372a39e87e.sql
REVOKE EXECUTE ON FUNCTION public.ensure_raw_material_expense_category(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_sync_purchase_to_expense() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_ingredient_on_purchase() FROM PUBLIC, anon;

-- @@MIGRATION 20260807154408_53115c96-a11b-4757-9718-d5ffc6132c97.sql
ALTER TABLE public.shift_controls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_controls;

-- @@MIGRATION 20260807211631_d718be81-b8c5-4ad9-8021-2f5e62d218dd.sql
CREATE TABLE public.courtesy_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courtesy_accounts TO authenticated;
GRANT ALL ON public.courtesy_accounts TO service_role;
ALTER TABLE public.courtesy_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courtesy_accounts_select" ON public.courtesy_accounts FOR SELECT TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_accounts_insert" ON public.courtesy_accounts FOR INSERT TO authenticated
WITH CHECK (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_accounts_update" ON public.courtesy_accounts FOR UPDATE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_accounts_delete" ON public.courtesy_accounts FOR DELETE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE TRIGGER update_courtesy_accounts_updated_at BEFORE UPDATE ON public.courtesy_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_floor_plans_updated_at();

CREATE TABLE public.courtesy_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.courtesy_accounts(id) ON DELETE SET NULL,
  table_number integer,
  order_ids uuid[] NOT NULL DEFAULT '{}',
  courtesy_type text NOT NULL DEFAULT 'invitation',
  sale_amount numeric NOT NULL DEFAULT 0,
  cost_amount numeric NOT NULL DEFAULT 0,
  notes text,
  finance_transaction_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courtesy_charges TO authenticated;
GRANT ALL ON public.courtesy_charges TO service_role;
ALTER TABLE public.courtesy_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courtesy_charges_select" ON public.courtesy_charges FOR SELECT TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_charges_insert" ON public.courtesy_charges FOR INSERT TO authenticated
WITH CHECK (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_charges_update" ON public.courtesy_charges FOR UPDATE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "courtesy_charges_delete" ON public.courtesy_charges FOR DELETE TO authenticated
USING (establishment_id = public.get_user_establishment(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE INDEX idx_courtesy_charges_est_date ON public.courtesy_charges(establishment_id, created_at DESC);

INSERT INTO public.courtesy_accounts (establishment_id, name)
SELECT e.id, n.name FROM public.establishments e
CROSS JOIN (VALUES ('Maria Luz'), ('Pablo'), ('El Ruso')) AS n(name);

-- @@MIGRATION 20260807215451_5a1718e8-0756-4d21-b7da-00194e94a5c1.sql
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

-- @@MIGRATION 20260808170934_fdf4a4c6-4ece-434f-b14a-9d549a0ef0dc.sql
CREATE POLICY "Cashier can manage products" ON public.products FOR ALL TO authenticated
USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage categories" ON public.categories FOR ALL TO authenticated
USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

-- @@MIGRATION 20260808205428_8dadcb26-e340-4fe3-9350-25192b2b0f55.sql
-- ============ Cortesías: sólo admin/superadmin pueden modificar ============
DROP POLICY IF EXISTS courtesy_accounts_insert ON public.courtesy_accounts;
DROP POLICY IF EXISTS courtesy_accounts_update ON public.courtesy_accounts;
DROP POLICY IF EXISTS courtesy_accounts_delete ON public.courtesy_accounts;

CREATE POLICY courtesy_accounts_insert ON public.courtesy_accounts FOR INSERT TO authenticated
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY courtesy_accounts_update ON public.courtesy_accounts FOR UPDATE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())))
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY courtesy_accounts_delete ON public.courtesy_accounts FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));

DROP POLICY IF EXISTS courtesy_charges_update ON public.courtesy_charges;
DROP POLICY IF EXISTS courtesy_charges_delete ON public.courtesy_charges;

CREATE POLICY courtesy_charges_update ON public.courtesy_charges FOR UPDATE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())))
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));
CREATE POLICY courtesy_charges_delete ON public.courtesy_charges FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));

-- ============ Caja: gestión operativa completa (excepto analíticas) ============
CREATE POLICY "Cashier can manage ingredients" ON public.ingredients FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage stock_movements" ON public.stock_movements FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage purchase_invoices" ON public.purchase_invoices FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage purchase_invoice_items" ON public.purchase_invoice_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id AND pi.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')))
WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id AND pi.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')));

CREATE POLICY "Cashier can manage product_recipes" ON public.product_recipes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_recipes.product_id AND p.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')))
WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_recipes.product_id AND p.establishment_id = get_user_establishment(auth.uid()) AND has_role(auth.uid(),'cashier')));

CREATE POLICY "Cashier can manage tables" ON public.tables FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage sectors" ON public.sectors FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage floor_plans" ON public.floor_plans FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage finance_categories" ON public.finance_categories FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage finance_transactions" ON public.finance_transactions FOR ALL TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can update shift_controls" ON public.shift_controls FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can view audit_logs" ON public.audit_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can read insights" ON public.ai_insights FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Cashier can update insights" ON public.ai_insights FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can view staff profiles" ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id AND ur.establishment_id = get_user_establishment(auth.uid())
));

CREATE POLICY "Cashier can view establishment roles" ON public.user_roles FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));
CREATE POLICY "Cashier can insert staff roles" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]));
CREATE POLICY "Cashier can update staff roles" ON public.user_roles FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]))
WITH CHECK (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]));
CREATE POLICY "Cashier can delete staff roles" ON public.user_roles FOR DELETE TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()) AND role <> ALL (ARRAY['superadmin'::app_role,'admin'::app_role,'cashier'::app_role]));

CREATE POLICY "Cashier can view staff_shifts" ON public.staff_shifts FOR SELECT TO authenticated
USING (has_role(auth.uid(),'cashier') AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can update own establishment" ON public.establishments FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'cashier') AND id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(),'cashier') AND id = get_user_establishment(auth.uid()));

-- @@MIGRATION 20260812155846_0eb93a36-263c-43f4-a95f-b1736564c2f6.sql
REVOKE SELECT (status) ON public.tables FROM anon;

-- @@MIGRATION 20260812180548_893c637c-d318-4632-82aa-496eeca0e17c.sql
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS affects_cash boolean NOT NULL DEFAULT true;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.trg_sync_purchase_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _est_auto boolean;
  _simple boolean;
  _cat_id uuid;
  _pm_label text;
  _desc text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = OLD.finance_transaction_id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT auto_purchase_to_expense, stock_simple_mode
    INTO _est_auto, _simple
  FROM public.establishments WHERE id = NEW.establishment_id;

  _pm_label := CASE COALESCE(NEW.payment_method, 'cash')
    WHEN 'cash' THEN 'Efectivo'
    WHEN 'transfer' THEN 'Transferencia'
    WHEN 'card' THEN 'Tarjeta'
    WHEN 'check' THEN 'Cheque'
    WHEN 'account' THEN 'Cuenta corriente'
    ELSE 'Otro'
  END;

  _desc := 'Compra: ' || NEW.supplier || COALESCE(' #' || NEW.invoice_number, '') || ' — ' || _pm_label;

  IF NEW.auto_expense AND (COALESCE(_simple, false) OR COALESCE(_est_auto, true)) THEN
    IF COALESCE(_simple, false) THEN
      _cat_id := public.ensure_raw_material_expense_category(NEW.establishment_id);
    ELSE
      _cat_id := public.ensure_supplies_expense_category(NEW.establishment_id);
    END IF;

    IF NEW.finance_transaction_id IS NULL THEN
      INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by, affects_cash, notes)
      VALUES (NEW.establishment_id, _cat_id, 'expense', NEW.total, _desc, NEW.invoice_date, NEW.created_by, false, NEW.notes)
      RETURNING id INTO NEW.finance_transaction_id;
    ELSE
      UPDATE public.finance_transactions
        SET amount = NEW.total,
            description = _desc,
            date = NEW.invoice_date,
            category_id = _cat_id,
            affects_cash = false,
            notes = NEW.notes
        WHERE id = NEW.finance_transaction_id;
    END IF;
  ELSE
    IF NEW.finance_transaction_id IS NOT NULL THEN
      DELETE FROM public.finance_transactions WHERE id = NEW.finance_transaction_id;
      NEW.finance_transaction_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.finance_transactions ft
SET affects_cash = false
FROM public.purchase_invoices pi
WHERE pi.finance_transaction_id = ft.id AND ft.affects_cash = true;

-- @@MIGRATION 20260814163017_98eb2678-dc8b-4d91-8f46-56effa698796.sql
CREATE TABLE IF NOT EXISTS public.afip_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  service text NOT NULL DEFAULT 'wsfe',
  environment text NOT NULL DEFAULT 'production',
  token text NOT NULL,
  sign text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, service, environment)
);

GRANT ALL ON public.afip_tokens TO service_role;
ALTER TABLE public.afip_tokens ENABLE ROW LEVEL SECURITY;

UPDATE public.afip_certificates
SET certificate_pem = '-----BEGIN CERTIFICATE-----
MIIDQDCCAiigAwIBAgIIB6Te89WSCTwwDQYJKoZIhvcNAQENBQAwMzEVMBMGA1UEAwwMQ29tcHV0
YWRvcmVzMQ0wCwYDVQQKDARBRklQMQswCQYDVQQGEwJBUjAeFw0yNjA4MTQxNTE5MzZaFw0yODA4
MTMxNTE5MzZaMCsxDjAMBgNVBAMMBWRhdHRhMRkwFwYDVQQFExBDVUlUIDI3OTQ3NTI4ODI5MIIB
IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2GbgGXRizoW17FzMvy1EG8MS5A+B1Q0ni63H
eVOzb99j8GZ96Z3jstocChfgXTy/LeLQG3Pper0CCh6ACPlG/Z7bt467E5JF4RfZ2uEPz7PJ2xdQ
+rIQWE2UCUDzD+dIpyi3u1UScUbuIkIkk5gNkacIa08apbJF9Dy3VqKT8FsIQgw4yuJaaCs3N9kp
Q0lcv0hEO7vgZkSD99fO6X8nidhoChV394Kkox1CGHBXvvo9sD4RKAsyJ8lDhU5kBf7uVpyxPYGl
Ts180KXyZTCKDiIP3AE34dRPsZA9IO/K4QYsk4U6N5zo9JldqH8l8KgJD47e3R9/aBfLLphLKpYc
cQIDAQABo2AwXjAMBgNVHRMBAf8EAjAAMB8GA1UdIwQYMBaAFCsNL8jfYf0IyU4R0DWTBG2OW9Bu
MB0GA1UdDgQWBBQ5RTVBwNNSCtZ/GCRY46Ucx3+XPjAOBgNVHQ8BAf8EBAMCBeAwDQYJKoZIhvcN
AQENBQADggEBALJuwt6rw8zmucLu3KxGOnjvTkjTT6B2K3kqlkXW5KAsE31F1osXupQLXZQYWLzh
Fa9pEjkBLrIxQAQnJk8fIuZ9D3BDY/TxGNfTQ2FelOiPnHVYruKGgb5V8RHEfNDrtw1izdHEqbwe
O2PMrDSIi5bcScuqsIWPfUjLrQ4Lml82CE9m/t6Xg2XH5G/cWfT7HyGhJ4lrPpSV5Qo9bIUSUQu8
eIOjNIrN+qZ4pWfkRQDiUYkbhc0gb7VeQrzHzc1gYfSgsRRHRj2n4BP9dG/qRFRyv55JoFPbnhxU
ueefRsxYdpjWjUNNw4pKzGhdfKSowItUsBeskkp9VkIjfK8w74w=
-----END CERTIFICATE-----',
    expires_at = '2028-08-13'
WHERE establishment_id = '5a56bc2d-c69b-49e7-96b4-7ff690ad8140';

-- @@MIGRATION 20260815134258_c178770f-4778-4ecc-bec3-851e0b20116b.sql
CREATE OR REPLACE FUNCTION public.trg_audit_order_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _establishment_id uuid;
  _table_number integer;
  _product_name text;
BEGIN
  SELECT o.establishment_id, t.number
    INTO _establishment_id, _table_number
  FROM public.orders o
  LEFT JOIN public.tables t ON t.id = o.table_id
  WHERE o.id = OLD.order_id;

  IF _establishment_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT p.name INTO _product_name FROM public.products p WHERE p.id = OLD.product_id;

  INSERT INTO public.audit_logs (user_id, establishment_id, action, table_name, record_id, details)
  VALUES (
    auth.uid(),
    _establishment_id,
    'item_deleted',
    'order_items',
    OLD.id::text,
    jsonb_build_object(
      'product', COALESCE(_product_name, 'desconocido'),
      'product_id', OLD.product_id,
      'qty', OLD.quantity,
      'unit_price', OLD.unit_price,
      'order_id', OLD.order_id,
      'table_number', _table_number,
      'item_status', OLD.status,
      'notes', OLD.notes
    )
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_order_item_delete ON public.order_items;
CREATE TRIGGER audit_order_item_delete
AFTER DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_order_item_delete();

-- @@MIGRATION 20260817011614_c7360c9b-1f1e-433c-9036-4d20ca4b6b7b.sql
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

-- @@MIGRATION 20260817013820_f022ebc9-b083-4fb0-a7f6-034cb2bb161b.sql
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.fiscal_invoices REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fiscal_invoices;

-- @@MIGRATION 20260820145930_a357428a-fbbf-4b81-9a8d-5dfa9b5ed2b1.sql
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS ai_invoice_reader boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS receipt_url text;

UPDATE public.establishments SET ai_invoice_reader = true WHERE name IN ('la cabrera', 'Restaurante prueba');

CREATE POLICY "Users read own establishment receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'purchase-receipts'
  AND (
    public.is_superadmin(auth.uid())
    OR (storage.foldername(name))[1] = public.get_user_establishment(auth.uid())::text
  )
);

CREATE POLICY "Users upload own establishment receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'purchase-receipts'
  AND (
    public.is_superadmin(auth.uid())
    OR (storage.foldername(name))[1] = public.get_user_establishment(auth.uid())::text
  )
);

CREATE POLICY "Users delete own establishment receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'purchase-receipts'
  AND (
    public.is_superadmin(auth.uid())
    OR (storage.foldername(name))[1] = public.get_user_establishment(auth.uid())::text
  )
);

-- @@MIGRATION 20260820152048_51a9cacb-8bdb-447d-8850-ee993764050b.sql
ALTER TABLE public.stock_movements ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);

CREATE OR REPLACE FUNCTION public.apply_purchase_stock(_invoice_id uuid, _lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _est uuid;
  _line jsonb;
  _pid uuid;
  _qty numeric;
  _unit_price numeric;
  _name text;
  _cat uuid;
  _cur_stock numeric;
  _cur_cost numeric;
  _new_cost numeric;
  _applied int := 0;
  _created int := 0;
BEGIN
  SELECT establishment_id INTO _est FROM public.purchase_invoices WHERE id = _invoice_id;
  IF _est IS NULL THEN
    RAISE EXCEPTION 'Compra inexistente';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR public.get_user_establishment(auth.uid()) = _est
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR _line IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb))
  LOOP
    _qty := COALESCE((_line->>'quantity')::numeric, 0);
    _unit_price := COALESCE((_line->>'unit_price')::numeric, 0);
    _name := btrim(COALESCE(_line->>'item_name', ''));
    _pid := NULLIF(_line->>'product_id', '')::uuid;

    CONTINUE WHEN _qty <= 0;

    IF _pid IS NULL THEN
      CONTINUE WHEN COALESCE(_line->>'create_product', 'false') <> 'true' OR _name = '';

      SELECT id INTO _cat FROM public.categories
       WHERE establishment_id = _est AND lower(name) = 'sin categoría' LIMIT 1;
      IF _cat IS NULL THEN
        INSERT INTO public.categories (establishment_id, name, sort_order, is_active)
        VALUES (_est, 'Sin categoría', 999, true)
        RETURNING id INTO _cat;
      END IF;

      INSERT INTO public.products (establishment_id, category_id, name, price, cost, is_available, stock_mode, direct_stock, cost_mode)
      VALUES (_est, _cat, _name, 0, _unit_price, false, 'direct', 0, 'manual')
      RETURNING id INTO _pid;
      _created := _created + 1;
    END IF;

    SELECT COALESCE(direct_stock, 0), COALESCE(cost, 0)
      INTO _cur_stock, _cur_cost
    FROM public.products WHERE id = _pid AND establishment_id = _est;

    CONTINUE WHEN NOT FOUND;

    IF (_cur_stock + _qty) > 0 THEN
      _new_cost := ((GREATEST(_cur_stock, 0) * _cur_cost) + (_qty * _unit_price)) / (GREATEST(_cur_stock, 0) + _qty);
    ELSE
      _new_cost := _unit_price;
    END IF;

    UPDATE public.products
       SET direct_stock = COALESCE(direct_stock, 0) + _qty,
           cost = ROUND(_new_cost, 2),
           stock_mode = CASE WHEN stock_mode = 'recipe' THEN stock_mode ELSE 'direct' END,
           cost_mode = CASE WHEN cost_mode = 'recipe' THEN cost_mode ELSE 'manual' END
     WHERE id = _pid;

    INSERT INTO public.stock_movements (establishment_id, product_id, ingredient_id, type, quantity, reason, reference_id, created_by)
    VALUES (_est, _pid, NULL, 'entry', _qty, 'Compra de mercadería', _invoice_id::text, auth.uid());

    _applied := _applied + 1;
  END LOOP;

  RETURN jsonb_build_object('applied', _applied, 'created', _created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_purchase_stock(uuid, jsonb) TO authenticated;

-- @@MIGRATION 20260820152126_e048487b-134a-4a94-ac5f-9e7092a2f41c.sql
REVOKE ALL ON FUNCTION public.apply_purchase_stock(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_purchase_stock(uuid, jsonb) TO authenticated;

-- @@MIGRATION 20260827160959_fcaa075a-faf7-4d58-a7ab-3ec610a2c08e.sql
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

-- @@MIGRATION 20260902130928_11bec9d8-f604-46c1-977d-2a29b6867da0.sql
CREATE OR REPLACE FUNCTION public.apply_sale_stock(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv record;
  _est uuid;
  _rec record;
  _count int := 0;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF _inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  END IF;

  _est := public.get_user_establishment(auth.uid());
  IF _est IS NULL OR (_est <> _inv.establishment_id AND NOT public.is_superadmin(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotencia: si ya se descontó para este comprobante, no repetir
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = _invoice_id::text AND type = 'sale'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  FOR _rec IN
    SELECT oi.product_id, SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = ANY(_inv.order_ids)
      AND p.stock_mode = 'direct'
      AND p.establishment_id = _inv.establishment_id
    GROUP BY oi.product_id
  LOOP
    UPDATE public.products
      SET direct_stock = direct_stock - _rec.qty
      WHERE id = _rec.product_id;

    INSERT INTO public.stock_movements
      (establishment_id, product_id, type, quantity, reason, reference_id, created_by)
    VALUES
      (_inv.establishment_id, _rec.product_id, 'sale', _rec.qty,
       'Venta mesa ' || COALESCE(_inv.table_number::text, '-'), _invoice_id::text, auth.uid());

    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'products', _count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_sale_stock(uuid) TO authenticated;

-- @@MIGRATION 20260902203249_23cf47a2-9c6f-424a-9877-b1766e9cfd60.sql
CREATE TABLE public.fiscal_invoice_covered_invoices (
  id uuid primary key default gen_random_uuid(),
  fiscal_invoice_id uuid not null references public.fiscal_invoices(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fiscal_invoice_id, invoice_id)
);

CREATE INDEX idx_ficov_invoice ON public.fiscal_invoice_covered_invoices(invoice_id);
CREATE INDEX idx_ficov_estab ON public.fiscal_invoice_covered_invoices(establishment_id);

GRANT SELECT, INSERT, DELETE ON public.fiscal_invoice_covered_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoice_covered_invoices TO service_role;

ALTER TABLE public.fiscal_invoice_covered_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ficov select same establishment"
ON public.fiscal_invoice_covered_invoices FOR SELECT TO authenticated
USING (is_superadmin(auth.uid()) OR establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "ficov insert same establishment"
ON public.fiscal_invoice_covered_invoices FOR INSERT TO authenticated
WITH CHECK (is_superadmin(auth.uid()) OR establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "ficov delete admins"
ON public.fiscal_invoice_covered_invoices FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin') AND establishment_id = get_user_establishment(auth.uid())));

-- @@MIGRATION 20260903122622_b3d5ef51-9f04-4a49-aeb8-2a68ee5b7e85.sql
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rappi_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peya_commission numeric NOT NULL DEFAULT 0;

ALTER TABLE public.orders ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS idx_orders_channel ON public.orders (establishment_id, channel, created_at DESC);

-- @@MIGRATION 20260903130037_fa57789d-4fbc-4c82-8f9b-c7c2213f0c02.sql
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

-- @@MIGRATION 20260908150031_133223a4-fd76-4fd1-9473-8b6aeaadfd24.sql
CREATE POLICY "Waiter can create reservations"
ON public.reservations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'waiter'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

CREATE POLICY "Waiter can update reservations"
ON public.reservations
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'waiter'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'waiter'::app_role)
  AND establishment_id = get_user_establishment(auth.uid())
);

-- @@MIGRATION 20260908150249_aa104774-0cda-4361-81cf-1531f4a10a57.sql
ALTER TABLE public.reservations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

-- @@MIGRATION cleanup-supabase-stubs
DROP PUBLICATION IF EXISTS supabase_realtime;
DROP SCHEMA IF EXISTS storage CASCADE;

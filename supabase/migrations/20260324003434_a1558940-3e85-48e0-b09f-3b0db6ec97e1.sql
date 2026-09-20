
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

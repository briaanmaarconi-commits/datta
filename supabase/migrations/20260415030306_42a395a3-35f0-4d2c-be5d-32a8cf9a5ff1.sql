
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

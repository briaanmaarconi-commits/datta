
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

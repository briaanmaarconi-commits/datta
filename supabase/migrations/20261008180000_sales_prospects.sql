-- Commercial prospects belong to Datta, not to any restaurant workspace.
CREATE TABLE public.sales_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 500),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contacted', 'follow_up', 'client', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_prospect_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.sales_prospects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'visit' CHECK (kind IN ('visit', 'call', 'whatsapp')),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sales_prospect_activities_prospect_date
  ON public.sales_prospect_activities (prospect_id, scheduled_at);
CREATE INDEX sales_prospect_activities_pending_date
  ON public.sales_prospect_activities (scheduled_at) WHERE status = 'pending';

ALTER TABLE public.sales_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_prospect_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_prospects, public.sales_prospect_activities FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_prospects, public.sales_prospect_activities TO authenticated;

CREATE POLICY "Only superadmin manages prospects"
  ON public.sales_prospects FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Only superadmin manages prospect activities"
  ON public.sales_prospect_activities FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

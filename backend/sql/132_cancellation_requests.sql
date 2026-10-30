-- Baja de la suscripción pedida por el local (trámite en Suscripción, solo el admin).
-- El local sigue operando hasta el fin del período pagado (effective_date); ese día el barrido diario
-- lo pasa a "cancelled". El débito automático se corta al pedir la baja. Mientras está pendiente,
-- el admin puede arrepentirse (withdrawn). Una sola baja pendiente por local. Idempotente.

CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reason_category text NOT NULL,
  reason_detail text NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'withdrawn', 'done')),
  requested_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cancellation_requests_one_pending
  ON public.cancellation_requests (establishment_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS cancellation_requests_est_idx ON public.cancellation_requests (establishment_id, created_at DESC);
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmin full access cancellation_requests" ON public.cancellation_requests;
CREATE POLICY "Superadmin full access cancellation_requests" ON public.cancellation_requests
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

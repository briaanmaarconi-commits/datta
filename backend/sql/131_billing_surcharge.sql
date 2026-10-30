-- Vencimientos con recargo y comprobantes de pago subidos por el local.
-- Reglas (todos los meses, también al terminar la prueba): aviso desde 7 días antes del vencimiento;
-- la primera semana de atraso sin recargo, la segunda +10%, la tercera +20%; a los 22 días se suspende.
-- El admin del local sube el comprobante y el pago se acepta al instante; el superadmin lo puede rechazar
-- (se borra el pago y vuelve el vencimiento anterior, guardado en previous_due_date). Idempotente.

UPDATE public.app_settings SET value = '22'::jsonb, updated_at = now() WHERE key = 'billing_grace_days';

ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS receipt_path text,
  ADD COLUMN IF NOT EXISTS previous_due_date date,
  ADD COLUMN IF NOT EXISTS surcharge_pct integer NOT NULL DEFAULT 0;

-- Comprobantes rechazados: el pago se borra, pero el local tiene que ver el motivo.
CREATE TABLE IF NOT EXISTS public.rejected_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  receipt_path text,
  reason text NOT NULL,
  rejected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rejected_receipts_est_idx ON public.rejected_receipts (establishment_id, created_at DESC);
ALTER TABLE public.rejected_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmin full access rejected_receipts" ON public.rejected_receipts;
CREATE POLICY "Superadmin full access rejected_receipts" ON public.rejected_receipts
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

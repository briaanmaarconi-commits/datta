-- El reporte y el resumen del turno filtran comprobantes y movimientos por local y hora (created_at).
-- Sin estos índices la base recorre todas las filas del local; con el tiempo el cierre de caja se hacía lento.
CREATE INDEX IF NOT EXISTS idx_invoices_est_created ON public.invoices (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_est_created ON public.finance_transactions (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_invoices_est_created ON public.fiscal_invoices (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_controls_est_open ON public.shift_controls (establishment_id, created_at DESC) WHERE closed_at IS NULL;

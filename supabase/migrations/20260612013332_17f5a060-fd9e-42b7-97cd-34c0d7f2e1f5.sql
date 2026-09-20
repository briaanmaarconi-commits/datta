CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON public.order_items(order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_orders_est_status_created ON public.orders(establishment_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_est_created ON public.audit_logs(establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_establishment_status ON public.orders(establishment_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_establishment_created ON public.orders(establishment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_establishment ON public.products(establishment_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_establishment_date ON public.finance_transactions(establishment_id, date);
CREATE INDEX IF NOT EXISTS idx_tables_establishment ON public.tables(establishment_id);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_establishment_status ON public.waiter_calls(establishment_id, status);
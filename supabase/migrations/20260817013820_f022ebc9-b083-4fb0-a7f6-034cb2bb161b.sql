ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.fiscal_invoices REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fiscal_invoices;
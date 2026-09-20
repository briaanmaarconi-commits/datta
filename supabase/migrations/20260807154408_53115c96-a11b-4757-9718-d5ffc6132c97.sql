ALTER TABLE public.shift_controls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_controls;
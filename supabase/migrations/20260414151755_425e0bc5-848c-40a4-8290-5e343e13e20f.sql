
ALTER TABLE public.shift_controls
  ADD COLUMN initial_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN actual_cash numeric,
  ADD COLUMN cash_difference numeric;

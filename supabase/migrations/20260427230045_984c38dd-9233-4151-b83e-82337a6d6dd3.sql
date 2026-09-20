CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'seated', 'cancelled', 'no_show');

CREATE TABLE public.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id uuid NOT NULL,
  table_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  party_size integer NOT NULL DEFAULT 2,
  reservation_at timestamp with time zone NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'confirmed',
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_reservations_establishment_time ON public.reservations(establishment_id, reservation_at);
CREATE INDEX idx_reservations_table_time ON public.reservations(table_id, reservation_at);
CREATE INDEX idx_reservations_status ON public.reservations(status);

CREATE OR REPLACE FUNCTION public.update_reservations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_reservations_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.update_reservations_updated_at();

CREATE POLICY "Admin can manage reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Cashier can manage reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'cashier'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Waiter can view reservations"
ON public.reservations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'waiter'::app_role) AND establishment_id = get_user_establishment(auth.uid()));

CREATE POLICY "Superadmin full access reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));
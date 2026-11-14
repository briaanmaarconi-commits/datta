-- Personas que atiende el mozo en la mesa (se pide al tomar el pedido; sale en la comanda).
-- Es independiente de la capacidad de la mesa en el plano. Idempotente.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_count integer;

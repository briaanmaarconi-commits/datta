-- Pago combinado: una mesa se puede cobrar con varios medios (ej. mitad tarjeta, mitad efectivo).
-- `payments` guarda el detalle [{ "method": "card", "amount": 10000 }, ...]; en ese caso
-- payment_method = 'mixed'. Con un solo medio queda en NULL y todo sigue como antes.
-- `tables.payment_request` es lo que la moza anotó al pedir la cuenta, para precargar el cobro en caja.
-- Idempotente y aditiva.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payments jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payments jsonb;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS payment_request jsonb;

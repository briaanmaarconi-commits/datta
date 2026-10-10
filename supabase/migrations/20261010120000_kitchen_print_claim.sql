-- Evita comandas duplicadas: cada pedido se imprime una sola vez aunque la
-- pantalla de cocina esté abierta en varias pestañas o dispositivos.
-- La pantalla que logra marcar kitchen_printed_at (de NULL a now()) es la única que imprime.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kitchen_printed_at timestamptz;

-- Los pedidos activos existentes ya se consideran impresos.
UPDATE public.orders
SET kitchen_printed_at = now()
WHERE kitchen_printed_at IS NULL AND status IN ('new', 'preparing');

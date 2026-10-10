-- Comandas sin duplicar: si la cocina está abierta en varias pestañas o dispositivos, cada
-- producto se imprime una sola vez. La pantalla que logra marcar kitchen_printed_at (de NULL a
-- now()) es la única que lo imprime. Idempotente: en producción orders.kitchen_printed_at ya existe.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kitchen_printed_at timestamptz;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS kitchen_printed_at timestamptz;

-- Lo que ya está en cocina al aplicar la migración se considera impreso.
UPDATE public.order_items oi
   SET kitchen_printed_at = now()
  FROM public.orders o
 WHERE o.id = oi.order_id
   AND oi.kitchen_printed_at IS NULL
   AND o.status IN ('new', 'preparing');

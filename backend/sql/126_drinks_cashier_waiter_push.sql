-- Opciones por local (las activa el superadmin en Clientes; pensadas para El Cuartel 10):
--   drinks_print_at_cashier = las comandas de bebidas salen por la comandera de caja y el resto por cocina.
--   waiter_push_enabled     = el mozo que tomó el pedido recibe un aviso en el celular cuando cocina lo marca listo.
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS drinks_print_at_cashier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiter_push_enabled boolean NOT NULL DEFAULT false;

-- Celulares suscriptos a avisos (Web Push). Solo los maneja el backend.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM authenticated, anon;
GRANT ALL ON public.push_subscriptions TO service_role;

-- Claves VAPID del servidor de avisos (una sola fila, la privada cifrada). Se generan solas la primera vez.
CREATE TABLE IF NOT EXISTS public.push_keys (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_keys FROM authenticated, anon;
GRANT ALL ON public.push_keys TO service_role;

-- Pedido que pasa a "listo": avisa al backend (canal datta_push) para mandar el aviso al mozo que lo tomó.
CREATE OR REPLACE FUNCTION public.notify_order_ready() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' AND NEW.created_by IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = NEW.establishment_id AND e.waiter_push_enabled) THEN
    PERFORM pg_notify('datta_push', jsonb_build_object(
      'kind', 'order_ready',
      'order_id', NEW.id,
      'user_id', NEW.created_by,
      'table', (SELECT t.number FROM public.tables t WHERE t.id = NEW.table_id)
    )::text);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS notify_order_ready ON public.orders;
CREATE TRIGGER notify_order_ready AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_ready();

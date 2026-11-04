-- Comandas desde la PC de caja: el interruptor "Imprimir comandas automáticamente en esta PC" se guarda en el
-- navegador y se perdía sin aviso al borrar sus datos o abrir Datta desde otro acceso directo (le pasó a Restaurant
-- Olavarría). Ahora el local recuerda que imprime comandas por caja: una caja que no lo tiene configurado muestra un
-- aviso con el botón para prenderlo. Nunca se prende solo (una caja abierta desde otra compu no se lleva las comandas).
-- Idempotente.
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS cashier_comandas boolean NOT NULL DEFAULT false;

-- Restaurant Olavarría ya imprime así.
UPDATE public.establishments SET cashier_comandas = true WHERE id = '018b04a8-18d9-49f7-86f8-b30be9307dd7';

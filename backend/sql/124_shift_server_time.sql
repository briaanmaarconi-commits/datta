-- La hora de apertura/cierre de turno la pone el servidor, no el reloj de la PC de caja.
-- Antes se guardaba new Date() del navegador: si la PC de caja tenía la hora adelantada
-- (Bodegón 65: ~14 min), el turno "arrancaba" más tarde que los cobros reales y esos
-- comprobantes (que sí usan la hora del servidor) quedaban afuera del resumen de turno.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.shift_controls_server_time()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.opened_at IS NOT NULL THEN
      NEW.opened_at := now();
    END IF;
    IF NEW.closed_at IS NOT NULL THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.controlled_at IS NOT NULL AND NEW.controlled_at IS DISTINCT FROM OLD.controlled_at THEN
      NEW.controlled_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_controls_server_time ON public.shift_controls;
CREATE TRIGGER shift_controls_server_time
  BEFORE INSERT OR UPDATE ON public.shift_controls
  FOR EACH ROW EXECUTE FUNCTION public.shift_controls_server_time();

-- Corrige turnos ya guardados con la hora de la PC de caja.
-- Apertura: created_at lo pone el servidor en el mismo insert.
UPDATE public.shift_controls
SET opened_at = created_at
WHERE opened_at IS NOT NULL
  AND abs(extract(epoch FROM opened_at - created_at)) > 60;

-- Cierre: el registro de auditoría 'close_shift' lo fecha el servidor.
UPDATE public.shift_controls s
SET closed_at = a.server_closed_at
FROM (
  SELECT record_id::text AS shift_id, min(created_at) AS server_closed_at
  FROM public.audit_logs
  WHERE action = 'close_shift' AND record_id IS NOT NULL
  GROUP BY record_id
) a
WHERE a.shift_id = s.id::text
  AND s.closed_at IS NOT NULL
  AND abs(extract(epoch FROM s.closed_at - a.server_closed_at)) > 60;

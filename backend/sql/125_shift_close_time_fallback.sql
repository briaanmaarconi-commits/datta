-- Complemento de 124: muchos registros de auditoría 'close_shift' quedaron sin record_id,
-- así que el cierre no se pudo corregir por id. Se toma el 'close_shift' del mismo local más
-- cercano anterior al cierre guardado (la PC de caja adelantada lo corre hacia adelante),
-- dentro de las 3 horas previas y posterior a la apertura del turno.
-- Idempotente.

WITH fix AS (
  SELECT s.id,
    (SELECT max(l.created_at)
     FROM public.audit_logs l
     WHERE l.establishment_id = s.establishment_id
       AND l.action = 'close_shift'
       AND l.created_at > s.created_at
       AND l.created_at <= s.closed_at + interval '5 minutes'
       AND l.created_at >= s.closed_at - interval '3 hours') AS server_closed_at
  FROM public.shift_controls s
  WHERE s.closed_at IS NOT NULL
)
UPDATE public.shift_controls s
SET closed_at = fix.server_closed_at
FROM fix
WHERE fix.id = s.id
  AND fix.server_closed_at IS NOT NULL
  AND abs(extract(epoch FROM s.closed_at - fix.server_closed_at)) > 60;

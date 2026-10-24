-- Un solo turno abierto por local.
-- Un doble clic en "Abrir turno" (Bodegón 65, 12/08 y 23/10) creó dos turnos con milésimas de
-- diferencia: se cerró uno al mediodía y el otro siguió abierto a la noche, sumando en el resumen
-- las ventas del mediodía otra vez. La base rechaza ahora el segundo turno abierto (error 23505),
-- venga de un doble clic, de dos PCs o de reabrir un turno con otro ya abierto.
-- Si hubiera duplicados abiertos, se deja abierto el más nuevo de cada local y se cierran los
-- demás sin arqueo (actual_cash NULL) para que el índice se pueda crear. Idempotente.

UPDATE public.shift_controls s
SET closed_at = now(),
    notes = concat_ws(' ', nullif(s.notes, ''), '[Cerrado automáticamente: turno duplicado abierto al mismo tiempo que otro]')
WHERE s.closed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.shift_controls o
    WHERE o.establishment_id = s.establishment_id
      AND o.closed_at IS NULL
      AND (o.created_at, o.id) > (s.created_at, s.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS shift_controls_one_open_per_establishment
  ON public.shift_controls (establishment_id)
  WHERE closed_at IS NULL;

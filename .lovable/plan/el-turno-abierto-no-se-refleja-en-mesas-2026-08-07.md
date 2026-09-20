# El turno abierto no se refleja en Mesas

Al abrir el turno en caja y pasar a Mesas, la pantalla sigue diciendo que no hay turno abierto y no deja tomar pedidos.

## Causa (verificada)

1. La tabla `shift_controls` **no está incluida en la publicación de tiempo real** de la base (solo lo están `orders`, `products`, `tables`, `waiter_calls`). El hook `useActiveShift` se suscribe a cambios de `shift_controls`, pero ese canal nunca recibe eventos, así que el aviso instantáneo de "turno abierto" nunca llega.
2. Las consultas tienen `staleTime: 60s` global y `refetchOnWindowFocus/Reconnect` desactivados, y la pantalla de turno usa una clave de caché distinta (`['active-shift', establecimiento, usuario]`) a la del hook (`['active-shift', establecimiento]`). El resultado es que Mesas puede seguir mostrando el estado viejo cacheado.

## Qué se va a hacer

1. **Habilitar tiempo real en `shift_controls`** con una migración que la agregue a la publicación `supabase_realtime` (y `REPLICA IDENTITY FULL`), para que abrir o cerrar el turno se propague al instante a Mesas (caja y mesero).
2. **Unificar la clave de caché del turno**: la pantalla de Resumen de turno pasa a usar el mismo hook `useActiveShift` / la misma clave que Mesas, así abrir el turno actualiza el único estado compartido.
3. **Estado siempre fresco**: en el hook `useActiveShift`, poner `staleTime: 0` y `refetchOnMount: 'always'` (y volver a chequear al recuperar foco de la pestaña), de modo que al entrar a Mesas se relea el turno aunque el tiempo real falle.
4. **Fallback**: tras abrir o cerrar turno, invalidar explícitamente la clave del hook además de las estadísticas del turno.

Con esto, apenas se abre el turno la sección Mesas se desbloquea sola, sin recargar la página.

## Detalle técnico

- Migración: `ALTER TABLE public.shift_controls REPLICA IDENTITY FULL;` + `ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_controls;` (sin cambios de esquema ni de permisos).
- `src/hooks/useActiveShift.ts`: opciones de frescura y el canal de realtime ya existente.
- `src/pages/cashier/ShiftSummary.tsx`: reemplazar la query local `['active-shift', establishmentId, userId]` por el hook compartido y ajustar las invalidaciones de `openShift` / `closeShift` / `reopenShift`.
- `src/pages/cashier/Tables.tsx` y `src/pages/waiter/Tables.tsx` no necesitan cambios: ya consumen el hook.

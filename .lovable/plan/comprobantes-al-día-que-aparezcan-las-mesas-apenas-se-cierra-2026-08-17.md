# Comprobantes al día: que aparezcan las mesas apenas se cierran

Hoy, en Caja > Comprobantes, la lista de comprobantes no se actualiza sola cuando se cobra una mesa desde otra pantalla o desde otra computadora. Recién aparece cuando se recarga la página (por eso "parece" que solo salen al cerrar el turno).

## Causa (verificada)

- La tabla de comprobantes (`invoices`) **no está incluida en la publicación de tiempo real** de la base. Solo lo están `orders`, `products`, `tables`, `shift_controls` y `waiter_calls`.
- La pantalla de Comprobantes solo escucha cambios de `tables` y `orders`, no de comprobantes ni de facturas fiscales.
- Las consultas tienen caché de 60 segundos y no se refrescan al volver a la pestaña, así que la lista queda vieja.

## Qué se va a hacer

1. Habilitar tiempo real para comprobantes y facturas fiscales, para que cualquier cobro hecho desde Mesas (misma o distinta computadora) impacte al instante en Comprobantes.
2. Suscribir la pantalla de Comprobantes a esos cambios y refrescar la lista automáticamente.
3. Hacer que la lista de comprobantes y de facturas fiscales sea siempre fresca: se relee al entrar a la pantalla y al volver a la pestaña del navegador.
4. Al cobrar una mesa desde cualquier pantalla, refrescar también la lista de comprobantes del día (no solo la de mesas).

Resultado: apenas se cierra y cobra una mesa, el comprobante aparece en la lista listo para facturar, sin esperar al cierre de turno ni recargar.

## Detalle técnico

- Migración (sin cambios de esquema ni de permisos): `REPLICA IDENTITY FULL` + agregar `public.invoices` y `public.fiscal_invoices` a la publicación `supabase_realtime`.
- `src/pages/cashier/Invoices.tsx`: extender el canal `invoices-tables-realtime` con `postgres_changes` sobre `invoices` y `fiscal_invoices` filtrados por `establishment_id`, invalidando `['invoices', ...]` y `['fiscal-invoices', ...]`; agregar `staleTime: 0`, `refetchOnMount: 'always'` y `refetchOnWindowFocus: true` a esas dos queries.
- `src/pages/cashier/Tables.tsx`: en el `onSuccess` del cobro, invalidar además `['invoices']` y `['fiscal-invoices']`.
- No se toca la lógica de cobro, tickets ni facturación ARCA.

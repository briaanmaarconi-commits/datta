# Botón "Comanda lista" en Cocina

## Qué cambia

Hoy en la pantalla de Cocina hay que tocar "Listo" en cada ítem del pedido. Se agrega un botón único por comanda para marcar todo el pedido como listo de una sola vez.

- Botón destacado **"Comanda lista"** al pie de cada tarjeta de pedido (arriba del botón "Reimprimir").
- Marca todos los ítems pendientes como listos y pasa el pedido a estado "Listo", que es lo que ya avisa al mozo.
- El pedido desaparece de la pantalla de pedidos activos, igual que cuando se marcan todos los ítems uno por uno.
- Si el pedido tiene varios ítems, pide confirmación rápida para evitar toques accidentales.
- Los botones "Listo" por ítem se mantienen para cuando sale un plato antes que otro.

## Detalles técnicos

- Solo cambios en `src/pages/kitchen/Orders.tsx`.
- Nueva mutación `markOrderReady`: actualiza en lote `order_items` pendientes del pedido a `ready` y luego `orders` a `ready` con `prepared_at`.
- Actualización optimista sobre la query `['kitchen-orders', establishmentId]` (misma lógica que `markItemReady`) para que el pedido salga de la grilla al instante.
- Sin cambios de base de datos ni de permisos.

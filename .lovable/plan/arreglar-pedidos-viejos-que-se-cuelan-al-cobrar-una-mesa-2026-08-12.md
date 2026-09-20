# Arreglar pedidos viejos que se cuelan al cobrar una mesa

## Qué pasó (verificado en la base)

La Mesa 3 tiene hoy el pedido real de las 13:09 (Hamburguesa completa + Coca-Cola 500ml), pero además arrastra un pedido del **9 de agosto a las 15:37** que nunca se cerró ni se canceló, con: Ñoquis de papa x1, Sorrentinos de jamón y queso x1, Raviolón de cordero x1, **Agua sin gas x2** y Coca cola x1.

Coincide exactamente con lo que vieron en caja, incluido el "-2" del agua: al tocar la X sobre ese ítem el sistema no lo borra, sino que agrega una línea de ajuste negativa ("Ajuste: agua sin gas (no consumido)") con la cantidad en negativo.

Causa raíz: el detalle de cuenta en Caja trae **todos** los pedidos de la mesa que no estén en estado cerrado/cancelado, sin importar de qué día o turno sean. Si un pedido quedó en "listo"/"entregado" (por ejemplo de pruebas o de un turno que se cerró sin cobrar esa mesa), queda pegado a la mesa para siempre y reaparece en el próximo cliente.

Hoy hay 8 pedidos en ese estado colgado, 6 de ellos del 9 de agosto (mesas 3, 6, 9 y 13).

## Solución

1. **Limpiar lo que ya está colgado**: cancelar los pedidos abiertos anteriores a hoy (los 6 del 9/8) y dejar libres las mesas que queden sin pedidos activos.

2. **Evitar que se repita — el detalle de cuenta solo muestra pedidos vigentes**: en Caja (y en la vista de Mesero) los pedidos de una mesa se filtran por el turno abierto actual; si no hay turno, por el día en curso. Un pedido de días anteriores ya no se suma al total.

3. **Aviso visible en vez de silencio**: si la mesa tiene pedidos anteriores al turno actual, se muestra un cartel en el diálogo ("Esta mesa tiene N pedidos de días anteriores sin cerrar") con un botón para descartarlos, en lugar de sumarlos a la cuenta sin avisar.

4. **Cierre de turno prolijo**: al cerrar el turno, los pedidos que hayan quedado abiertos se cancelan automáticamente y las mesas vuelven a estado libre, para que el turno siguiente arranque limpio.

5. **La X del detalle se vuelve más clara**: pasa a llamarse "Quitar de la cuenta" y elimina la línea del total directamente, en lugar de generar un renglón con cantidad negativa. El ajuste negativo manual sigue disponible aparte para casos de devolución.

## Detalles técnicos

- `src/pages/cashier/Tables.tsx`: la query `table-orders` agrega filtro `created_at >= inicio del turno abierto` (fallback: inicio del día local, zona Buenos Aires). Se calculan `staleOrders` (los excluidos) para el aviso y su acción de descarte (`status = 'cancelled'`).
- `src/pages/waiter/Tables.tsx` y `src/components/waiter/OrderingView.tsx`: mismo criterio de filtrado para que mozo y caja vean lo mismo.
- `src/pages/cashier/ShiftSummary.tsx`: en el cierre de turno, cancelar pedidos activos restantes del establecimiento y setear `tables.status = 'free'`.
- Ítems quitados: se manejan como un set de `excludedItemIds` en el estado del diálogo, que se descuenta de `allItems` y del snapshot que va al ticket/invoice; se quita el uso de `refundOrderItem` para ese botón.
- Migración puntual (una sola vez) para cancelar los pedidos colgados previos a hoy y liberar sus mesas.

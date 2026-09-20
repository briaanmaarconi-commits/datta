# Cierre de turno bloqueado + edición de la cuenta desde Caja

## Parte 1 — Bloquear el cierre de turno si quedan mesas sin cerrar

Estado actual (verificado): el botón "Cerrar turno" ya muestra un toast de error si hay mesas en estado `ocupada` o `cuenta`. Falta que sea más claro y más completo.

1. **Detección más completa**: una mesa cuenta como pendiente si está ocupada / en cuenta **o** si tiene pedidos activos del turno actual, aunque figure como libre.
2. **Bloqueo con cartel claro** (en vez del toast fugaz):

   ```text
   No se puede cerrar el turno
   La Mesa 9 y la Mesa 13 aún no se cerraron.
   Liberalas (cobrá o cancelá la cuenta) para poder cerrar el turno.

   Recordá: imprimir la pre-cuenta NO cierra la mesa.
   ```

   Con la lista de mesas pendientes y un botón "Ir a Mesas".
3. **Aviso permanente** en la tarjeta del turno con los números de mesa pendientes.
4. **Leyenda en la pre-cuenta**: "La pre-cuenta no cierra la mesa. Para cobrar, usá Cerrar mesa."
5. **Sin cancelaciones silenciosas**: el paso que cancelaba pedidos al cerrar queda solo como red de seguridad para pedidos huérfanos.

## Parte 2 — Agregar y quitar productos de la carta desde Caja

Hoy Caja solo puede sumar "ítems manuales" con nombre y precio escritos a mano (Cubiertos, Servicio). Eso no descuenta stock, no aparece en analíticas de productos ni llega a cocina/barra.

Se agrega un buscador de productos reales dentro del detalle de la mesa:

1. **Botón "Agregar productos"** en el diálogo de la mesa, junto a los ajustes manuales. Abre un panel con buscador por nombre, filtro por categoría y precio; se elige cantidad y se suma al carrito.
2. **Se carga como pedido real de la mesa**: los productos van a un pedido de la mesa (se agregan al pedido abierto del turno; si no hay, se crea uno nuevo), con el precio vigente. Así descuentan stock, cuentan en analíticas y quedan en el ticket y en la factura como cualquier otro consumo.
3. **Enviar a cocina, opcional**: un switch "Mandar comanda a cocina" (encendido por defecto). Para el caso típico de "agregame 2 aguas", Caja lo puede apagar y el ítem entra directo a la cuenta sin generar comanda.
4. **Quitar productos**: la X de cada línea sigue quitándolo de la cuenta, pero ahora con dos opciones claras:
   - *Quitar de la cuenta* (no se cobra, el pedido queda registrado como no consumido).
   - *Eliminar el ítem* (cargado por error): borra el renglón del pedido y recalcula el total del pedido.
5. **Trazabilidad**: cada alta o baja desde Caja queda registrada en Auditoría (quién, qué producto, cantidad, mesa) para poder revisar después.

## Detalles técnicos

- `src/pages/cashier/ShiftSummary.tsx`: la query de mesas pendientes suma los `orders` activos posteriores al corte del turno (`getOrdersCutoff`), con refetch periódico; el toast se reemplaza por un `AlertDialog` con la lista y navegación a `/cashier/tables`.
- Nuevo `src/components/cashier/AddProductsDialog.tsx`: buscador sobre `products` + `categories` del establecimiento, carrito local y mutación que inserta en `orders` / `order_items` reutilizando la misma lógica que el mesero (`src/pages/waiter/Tables.tsx`), actualizando `orders.total` y `tables.status = 'occupied'`.
- Cuando el switch de cocina está apagado, los ítems se insertan con `status = 'ready'` y el pedido no vuelve a `new`, así no aparece en la pantalla de cocina.
- `src/pages/cashier/Tables.tsx`: integra el diálogo, agrega el menú de la X con las dos acciones (excluir vs. borrar `order_items`) e invalida `table-orders`.
- Auditoría vía el hook existente `useAuditLog`.
- Sin cambios en base de datos.

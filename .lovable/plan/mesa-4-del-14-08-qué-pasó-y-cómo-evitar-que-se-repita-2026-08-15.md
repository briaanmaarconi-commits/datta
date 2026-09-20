# Mesa 4 del 14/08 — qué pasó y cómo evitar que se repita

## Lo que muestran los datos

Turno abierto: 14/08 08:10 (hora Argentina). Cierre: 15:16, con $104.000 contados.

Mesa 4 — 5 pedidos, todos cargados por **Mozo 1**:

| Pedido | Hora de apertura | Estado | Total hoy |
|---|---|---|---|
| 23c32b93 | 11:30:01 | cerrado | $0 |
| ad123f3e | 11:30:29 | cerrado | $0 |
| 8bae6acb | 11:35:49 | cerrado | $0 |
| 1d5ca3da | 11:36:04 | cerrado | $0 |
| 2fbf9773 | 11:36:59 | cerrado | $0 |

Factura #58, mesa 4, cobrada **15:13:03** por $0 en efectivo, con `items: []` (lista de ítems vacía) y los 5 pedidos vinculados.

Punto clave: **no queda ningún ítem cargado de esos 5 pedidos**. La tabla de ítems no tiene filas para ninguno de ellos, y tampoco hay movimientos de stock del 14/08 que permitan reconstruirlos. El registro de auditoría de ese día sólo tiene acciones de la **mesa 2** (altas y bajas de ítems desde caja); de la mesa 4 no hay ninguna acción registrada.

Conclusión: los ítems de la mesa 4 se borraron por una vía que **no deja auditoría** (borrado desde la vista de mozo / eliminación de ítems fuera del flujo de caja). Por eso el detalle de qué se pidió es hoy irrecuperable: no existe ni en ítems, ni en la factura, ni en stock, ni en auditoría. Los totales originales ($20.000 por pedido, $100.000 en total) fueron los que generaron el faltante que ya se corrigió.

## Qué propongo hacer

1. **Auditar todo borrado de ítems, venga de donde venga.** Un trigger en base de datos que registre cada eliminación de ítem de pedido (producto, cantidad, precio, mesa, usuario, hora), sin depender de que la pantalla lo registre. Así cubre mozo, caja, cocina y cualquier acceso futuro.
2. **Guardar el detalle en la factura siempre.** Si la mesa se cierra en $0 o con ítems excluidos, la factura debe conservar igual el detalle original y marcar cuáles se excluyeron y por qué, en vez de guardar una lista vacía.
3. **Bloquear el cierre en $0 sin motivo.** Si el total a cobrar queda en $0 con pedidos asociados, pedir un motivo obligatorio (cortesía, error de carga, anulación) y dejarlo en auditoría.
4. **Aviso en cierre de turno.** Listar en el reporte de cierre las mesas cerradas en $0 o con ítems eliminados durante el turno, para que la encargada las revise antes de cerrar.

## Detalle técnico

- Migración: trigger `AFTER DELETE` en `order_items` que inserta en `audit_logs` con `action = 'item_deleted'`, incluyendo producto, cantidad, precio unitario, `order_id`, número de mesa y `auth.uid()`.
- `src/pages/cashier/Tables.tsx`: al cerrar, persistir en `invoices.items` el detalle completo (incluyendo excluidos con flag), y exigir motivo cuando el total final sea 0.
- `src/components/cashier/ShiftReportTicket.tsx` y el cierre de turno: sección "Mesas cerradas en $0 / con ítems eliminados".
- La mesa 4 del 14/08 no se puede reconstruir; queda documentada como incidente.

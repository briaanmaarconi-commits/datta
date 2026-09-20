---
name: Vigencia de pedidos por turno
description: Los pedidos de una mesa solo cuentan si son del turno abierto (o del día); los anteriores quedan colgados y no se cobran.
type: feature
---

## Regla
Un pedido en estado `new/preparing/ready/delivered` solo se considera parte de la cuenta de la mesa si `created_at >= inicio del turno abierto`. Si no hay turno abierto, el corte es el inicio del día en hora Argentina.

- Helper: `getOrdersCutoff(activeShift)` en `src/lib/shiftScope.ts`.
- Caja (`src/pages/cashier/Tables.tsx`): separa `tableOrders` (vigentes) de `staleOrders` (viejos). Los viejos se muestran en un alerta con botón "Descartar pedidos viejos" (los cancela) y NUNCA se suman al total.
- Mesero (`src/pages/waiter/Tables.tsx`): la query `active-orders` filtra con `.gte('created_at', ordersCutoff)`.
- Cierre de turno (`src/pages/cashier/ShiftSummary.tsx`): cancela pedidos que quedaron abiertos y pone todas las mesas en `free`.

## Quitar ítems de la cuenta
En el detalle de cuenta de Caja, la X de cada ítem lo **quita** de la cuenta (`excludedItemIds`), no genera renglones "Ajuste: X (no consumido)" con cantidad negativa. El ajuste manual negativo sigue existiendo aparte para devoluciones. El total se calcula sumando ítems incluidos, no `orders.total`.

---
name: Arqueo de caja
description: Fórmula única del efectivo esperado en cierre de turno; excluye ventas automáticas duplicadas y propinas.
type: feature
---
- Helper único: `src/lib/cashReconciliation.ts`. Lo usan `src/pages/cashier/ShiftSummary.tsx` (cierre + ticket) y `src/components/admin/ShiftDetailDialog.tsx`.
- Fórmula: `esperado = fondo inicial + ventas en efectivo (orders.payment_method='cash') + ingresos manuales − egresos manuales`.
- **Movimientos automáticos** (categoría "Ventas", descripción `Mesa X - Método`) se crean al cerrar mesa: NO se suman al arqueo, ya están contados en ventas en efectivo.
- **Propinas** ("Propinas" / "Pago de propinas"): neutras, excluidas del arqueo.
- Manual = todo movimiento cuya categoría no sea "Ventas" ni propina.
- En el detalle de Admin cada movimiento se etiqueta "Auto" o "Manual".

## Total cobrado por pedido (14/08/2026)
- Al cerrar la mesa, cada `orders.total` se actualiza al monto REALMENTE cobrado (ítems no excluidos; los ajustes manuales van al primer pedido). Antes quedaba el total original y las ventas en efectivo del arqueo se inflaban con ítems quitados de la cuenta.

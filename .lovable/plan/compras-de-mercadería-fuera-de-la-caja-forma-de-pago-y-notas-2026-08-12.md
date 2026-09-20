# Compras de mercadería fuera de la caja + forma de pago y notas

## Qué está pasando hoy (verificado)

Cada compra de mercadería genera automáticamente un egreso en Movimientos con categoría "Costo de mercadería" (por ejemplo "Compra: casquero"). El cálculo del efectivo esperado suma todo egreso que no sea venta ni propina, así que esas compras se descuentan de la caja.

En el Bodegón 65, en el turno abierto de hoy hay 15 compras registradas por unos $869.000 en total, contra $22.000 de ventas en efectivo. De ahí sale el efectivo esperado negativo (-$847.268 aprox.).

## Qué se va a hacer

1. **Desvincular las compras de la caja**
   - Las compras siguen apareciendo en Movimientos y siguen contando como gasto en rentabilidad/analíticas.
   - Dejan de restar del efectivo esperado del turno (arqueo), tanto en el cierre de Caja como en el detalle del turno en Admin.
   - Se aplica también a las compras ya registradas del Bodegón 65, sin borrar nada.

2. **Forma de pago en la compra**
   - Al registrar (o editar) una compra se elige: Efectivo, Transferencia, Tarjeta, Cheque, Cuenta corriente / A pagar.
   - Queda visible en el listado de compras y en la descripción del movimiento (ej.: "Compra: casquero — Transferencia").
   - Aun pagando en efectivo, no afecta la caja: se entiende que el dinero sale de otro lado.

3. **Aclaraciones / notas visibles en Movimientos**
   - El campo de notas de la compra se guarda junto al movimiento.
   - En la lista de Movimientos, al lado del ícono de basura aparece un ícono de nota solo en los movimientos que tienen aclaración; al pasar el mouse o tocarlo se ve el texto completo.
   - Los movimientos manuales cargados desde Caja también podrán llevar aclaración.

## Detalle técnico

- Migración:
  - `purchase_invoices`: nueva columna `payment_method text` (default `'cash'`) y se aprovecha `notes` ya existente.
  - `finance_transactions`: nuevas columnas `affects_cash boolean not null default true` y `notes text`.
  - `trg_sync_purchase_to_expense`: inserta/actualiza el movimiento con `affects_cash = false`, copia `notes` y agrega la forma de pago a la descripción.
  - Backfill: `UPDATE finance_transactions SET affects_cash = false` para los movimientos referenciados por `purchase_invoices.finance_transaction_id` (no toca pedidos, mesas ni turnos).
- `src/lib/cashReconciliation.ts`: `isManualCashTx` pasa a excluir además los movimientos con `affects_cash = false`; los consumidores (`ShiftSummary.tsx`, `ShiftDetailDialog.tsx`, `Expenses.tsx`, `CashControl.tsx`) pasan ese campo en las consultas.
- `SimplePurchasesTab.tsx` y `PurchasesTab.tsx`: selector de forma de pago + notas en alta y edición; badge de forma de pago en el listado.
- `Expenses.tsx` / `CashControl.tsx`: ícono de nota junto al de eliminar cuando el movimiento tiene aclaración, con tooltip; campo de aclaración en el alta manual; los movimientos que no afectan caja se muestran con una etiqueta ("No afecta caja").

## Seguridad operativa

Solo se agregan columnas y se marca una bandera en movimientos existentes. No se cancelan pedidos, no se liberan mesas, no se cierran turnos ni se borran compras. El servicio en curso del Bodegón 65 no se interrumpe.

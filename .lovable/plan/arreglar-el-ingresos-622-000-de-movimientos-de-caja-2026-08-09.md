# Arreglar el "Ingresos $622.000" de Movimientos de caja

## Qué está pasando

En el turno del 09/08 las ventas cerradas fueron **$287.000** (efectivo $140.000, tarjeta $51.000, transferencia $96.000), pero la pantalla de caja muestra **$622.000** de ingresos. El número sale de sumar tres veces lo mismo:

```text
+ $287.000  ventas armadas a partir de los pedidos cerrados
+ $287.000  los movimientos "Ventas" (Mesa X - Método) que ya se crean al cerrar la mesa
+  $48.000  la propina de la mesa 2 (que además tiene su egreso espejo)
= $622.000
```

Cada venta aparece duplicada: una vez como pedido y otra como movimiento automático de la categoría "Ventas". La propina, que debe ser neutra, se suma al ingreso.

## Qué se corrige

1. Mostrar cada venta **una sola vez**. Se deja de generar la fila sintética desde los pedidos cerrados cuando ya existe el movimiento automático de la categoría "Ventas"; la lista y los totales usan el movimiento real.
2. **Propinas fuera de los totales**: los movimientos de "Propinas" y "Pago de propinas" no suman a Ingresos ni a Salidas ni al Balance (siguen visibles en la lista, etiquetados como neutros), igual que en el arqueo y en analíticas.
3. Mismo criterio en la pantalla de caja del cajero (Movimientos de caja) y en la del administrador, para que los dos muestren el mismo número.

Resultado esperado para el 09/08: Ingresos $287.000, Salidas $0, Balance $287.000, y el arqueo del turno sigue en diferencia $0.

## Detalle técnico

- `src/pages/admin/CashControl.tsx` (líneas ~338-374) y `src/pages/cashier/Expenses.tsx` (líneas ~115-140): la query combina `finance_transactions` con filas `salesTx` derivadas de `orders` cerradas. Se elimina esa derivación y se usan solo los `finance_transactions`; el detalle de método de pago ya viene en la descripción `Mesa X - Método`. Para pedidos antiguos sin movimiento asociado se conserva un respaldo: solo se genera la fila sintética si no existe un movimiento "Ventas" de esa fecha y monto.
- Los totales `totalIncome` / `totalExpense` de ambas pantallas filtran con `isTipTx` de `src/lib/cashReconciliation.ts` (regex `/propina/i`), reutilizando el helper ya existente en vez de duplicar reglas.
- Sin cambios de base de datos; los datos ya están correctos, el problema es de presentación.

# Revisión del cierre de caja del 09/08 (Bodegón 65)

## ¿Hubo ventas cargadas a mano? No

Los 7 movimientos de ingreso del turno son **todos automáticos**, generados al cerrar cada mesa desde Caja (usuario Maria). Se reconocen por la categoría "Ventas" y la descripción con formato `Mesa X - Método`:

```text
Mesa 1 - Tarjeta          $22.000
Mesa 2 - Efectivo         $43.000
Mesa 4 - Efectivo         $36.000
Mesa 2 - Transferencia    $48.000
Mesa 7 - Efectivo         $61.000
Mesa 2 - Tarjeta          $29.000
Mesa 1 - Transferencia    $48.000
                Total    $287.000
```

Más la propina de mesa 2 ($48.000 por transferencia) con su egreso espejo.

No hay ningún movimiento cargado manualmente desde Caja → Movimientos de caja / Gastos.

## De dónde sale el "FALTANTE $287.000" de la pantalla

```text
Fondo inicial            $0
+ Ventas en efectivo     $140.000   (de los pedidos con método efectivo)
+ Otros ingresos         $287.000   (los MISMOS movimientos de venta, contados de nuevo)
- Egresos                $0
= Efectivo esperado      $427.000
Efectivo contado         $140.000
Diferencia              -$287.000  → "FALTANTE"
```

El "Otros ingresos" debería contener solo ingresos manuales (aportes, cobros extra), pero está sumando los movimientos automáticos de venta, que ya se contaron en "Ventas en efectivo". Por eso el esperado se infla y aparece un faltante que no existe.

## El otro cálculo, el del cierre en Caja

Al cerrar el turno se guardó una diferencia de **+$48.000**, con esta fórmula:

```text
Esperado = 0 + 140.000 (ventas efectivo) - 48.000 (todos los egresos, incluido el espejo de propina) = 92.000
Diferencia = 140.000 - 92.000 = +48.000
```

Ahí el error es el opuesto: resta el egreso espejo de una propina cobrada por transferencia, que no toca el efectivo.

Cálculo correcto para este turno:

```text
Esperado = 0 + 140.000 + 0 - 0 = 140.000
Contado  = 140.000  → CAJA OK, diferencia $0
```

## Qué corregir

1. En el arqueo, "Otros ingresos" debe considerar solo ingresos **manuales en efectivo**: excluir la categoría "Ventas" (movimientos automáticos de cierre de mesa) y las categorías de propinas.
2. En el cierre de turno de Caja, excluir de los egresos las categorías de propinas y acotar la ventana al cierre del turno.
3. Unificar la fórmula del arqueo en un solo lugar compartido por: cierre en Caja, ticket de cierre y detalle de Admin, para que los tres muestren el mismo número.
4. Diferenciar visualmente en la lista de movimientos los automáticos (venta de mesa) de los manuales, para que se entienda de dónde viene cada peso.
5. Recalcular la diferencia del turno cerrado del 09/08 y dejarla en $0.

## Detalle técnico

- `src/components/admin/ShiftDetailDialog.tsx` líneas 113-127: `cashIncomeExtra` suma todos los `finance_transactions` de tipo `income` que no sean propina, incluidos los de categoría "Ventas" creados por el cierre de mesa → doble conteo con `payments.cash.amount`.
- `src/pages/cashier/ShiftSummary.tsx` líneas 180-191 y 229: `cashExpenses` toma todos los `expense` desde `opened_at` sin filtrar categoría ni fecha de cierre, e ignora los ingresos manuales.
- Se agregará un helper compartido (por ejemplo `src/lib/cashReconciliation.ts`) con las reglas: ventas en efectivo desde `orders`, ingresos/egresos manuales = movimientos cuya categoría no sea "Ventas" ni propinas, ventana `opened_at`→`closed_at`.
- Corrección de dato: `UPDATE shift_controls SET cash_difference = 0` para el turno `65c5d4e0…`.

# Mesa 6: el pedido "de turnos anteriores" en realidad es de hoy

## Qué es ese pedido (verificado en la base)

Mesa 6, pedido de **hoy 15/08 a las 13:40 (hora Argentina)**, estado "listo", total **$18.000**:

- Raviolón de cordero x1 — $8.000
- Salsa rosa x1 — $6.000
- Coca-Cola 500ml x1 — $4.000

No es de un turno anterior: se tomó hace pocos minutos.

## Por qué aparece como viejo

El turno de hoy se creó a las 13:34 pero su `opened_at` quedó grabado a las **13:46**, o sea 6 minutos *después* de que se cargó el pedido. El corte de vigencia usa `opened_at`, así que todo lo cargado entre la creación del turno y ese `opened_at` cae fuera del turno y se muestra como "pedido de días anteriores".

Riesgo actual: si en caja se toca "Descartar pedidos viejos", ese pedido real de $18.000 se cancela y no se cobra.

## Solución

1. **Corte del turno más tolerante**: usar el momento más temprano entre `opened_at` y `created_at` del turno abierto, en vez de solo `opened_at`. Así ningún pedido cargado durante la apertura del turno queda afuera.
2. **Margen de seguridad**: además, nunca cortar después del inicio del día en hora Argentina cuando el turno es del día en curso; un pedido de hoy siempre pertenece al turno de hoy.
3. **Aviso más honesto**: el cartel deja de decir "de días anteriores" y pasa a decir "pedidos fuera del turno actual", con la fecha y hora de cada pedido y su monto, para que en caja se vea qué se estaría descartando.
4. **Confirmación antes de descartar**: el botón de descarte pide confirmación mostrando el total involucrado, en vez de cancelar de una.

Con el punto 1, el pedido de la Mesa 6 vuelve a la cuenta normal de la mesa y se puede cobrar como corresponde.

## Detalles técnicos

- `src/lib/shiftScope.ts`: `getOrdersCutoff` devuelve `min(opened_at, created_at)` del turno; si ese valor es posterior al inicio del día ARG y el turno es de hoy, se usa el inicio del día como corte.
- `src/pages/cashier/Tables.tsx`: el bloque de `staleOrders` muestra fecha/hora y monto por pedido y agrega `AlertDialog` de confirmación con el total antes de cancelar.
- Sin cambios en base de datos ni en los pedidos existentes.

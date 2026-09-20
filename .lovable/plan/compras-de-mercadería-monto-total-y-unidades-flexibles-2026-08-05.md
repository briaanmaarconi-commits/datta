# Compras de mercadería: monto total y unidades flexibles

## Qué cambia en la carga de compras (Bodegón 65 / modo simple)

### 1. Precio por unidad o monto total

Cada línea de compra pasa a tener dos campos de dinero, y se completan solos entre sí:

- **Precio x unidad**: se escribe cuánto sale el kg (o la unidad elegida) y el sistema calcula el monto total de esa línea.
- **Monto total**: se escribe lo que salió toda la compra de ese ítem y el sistema calcula solo el precio por unidad, dividiendo por la cantidad.

Se puede cargar cualquiera de los dos; el otro se actualiza al instante. Si después se cambia la cantidad, se mantiene el último valor que la persona escribió a mano y se recalcula el otro.

El total de la compra sigue siendo la suma de los montos de cada línea, y se sigue registrando automáticamente como gasto de "Costo de mercadería".

### 2. Unidades de medida ampliables

- La lista pasa a incluir **litros (Lt)** además de kg, g, ml, unidad, bulto, docena, caja.
- Al final del desplegable aparece la opción **"+ Agregar unidad"**: se escribe la unidad nueva (ej. "cajón", "atado", "bolsa 25kg") y queda seleccionada.
- Las unidades que ya se usaron en compras anteriores del restaurante aparecen siempre en la lista, así no hay que volver a escribirlas.

## Detalles técnicos

- Solo se modifica `src/components/admin/stock/SimplePurchasesTab.tsx`. No hace falta migración: las unidades personalizadas ya se guardan en `purchase_invoice_items.unit`.
- El tipo `Line` suma `line_total` y un flag `lastEdited: 'unit' | 'total'` para decidir cuál campo recalcular. Al guardar se sigue persistiendo `quantity` y `unit_price` (derivado de `line_total / quantity` cuando corresponde), por lo que triggers, rentabilidad y analíticas no cambian.
- Las opciones de unidad se arman como unión de la lista por defecto (con `Lt` agregado), las unidades presentes en las compras ya cargadas, y las que el usuario agregue en la sesión.
- El desplegable de unidad se reemplaza por un combobox con opción de crear valor nuevo (patrón similar a `IngredientCombobox`), con `position="popper"` para evitar el corte dentro del diálogo.

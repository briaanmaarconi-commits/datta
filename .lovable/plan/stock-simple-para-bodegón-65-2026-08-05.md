# Stock simple para Bodegón 65

## Qué se busca

Sacar la carga de recetas e ingredientes por plato y dejar una única pantalla: **cargar la compra de materia prima** (qué se compró, cuánto y a qué precio) y que ese dinero impacte automáticamente en balance, rentabilidad y analíticas.

## Cómo va a funcionar

### 1. Modo simple activable por restaurante

Un interruptor de configuración por establecimiento ("Gestión de stock simple"). Se activa para Bodegón 65 y no afecta a los demás clientes, que siguen con recetas.

Con el modo simple activo, en **Stock** desaparecen:
- Productos y Recetas
- Ingredientes / Sugerencias / Mermas por ingrediente
- El semáforo de stock por ingrediente

Y queda una sola pantalla: **Compras de materia prima**.

### 2. Pantalla de compras (lo único que se carga)

Un formulario corto:

- Proveedor (texto libre, con sugerencias de los ya usados)
- Fecha
- Líneas de compra: descripción libre ("Carne picada"), cantidad, unidad (kg, l, unidad, bulto) y precio
- Total calculado solo
- Botón guardar

No hace falta crear ingredientes previamente: se escribe el nombre y listo. Los nombres usados quedan guardados como sugerencias para la próxima compra.

Debajo, el listado de compras del período con total, y opción de editar o borrar.

### 3. Impacto en los números

Cada compra guardada genera automáticamente un gasto con fecha de la compra en la categoría **"Costo de mercadería"**. Con eso:

- **Balance / Caja**: aparece como salida de dinero del día.
- **Rentabilidad**: se toma como costo de mercadería (no como gasto operativo), así el margen de contribución y el punto de equilibrio quedan bien calculados sin recetas.
- **Analíticas**: entra en gastos y en la comparación de períodos como cualquier otro movimiento.

Si se edita o elimina una compra, el gasto se actualiza o se borra solo.

### 4. Resumen simple de consumo

Arriba de la pantalla, tres tarjetas: total comprado en el período, proveedor con mayor gasto, e insumo con mayor gasto. Es la información útil que se puede dar sin recetas.

## Detalles técnicos

- Nueva columna `stock_simple_mode` (boolean, default false) en `establishments`, activada para Bodegón 65.
- Se reutilizan `purchase_invoices` y `purchase_invoice_items`; se agrega una columna de descripción libre en los ítems para no depender de `ingredient_id` (pasa a ser opcional).
- El trigger actual `trg_sync_purchase_to_expense` se ajusta: si el establecimiento está en modo simple, la categoría del gasto generado es "Costo de mercadería" en lugar de "Compras de insumos". `ProfitMarginTab` ya reconoce esa categoría como materia prima manual, así que no hay que tocar la lógica de rentabilidad.
- `src/pages/admin/Stock.tsx` renderiza condicionalmente: modo simple → nuevo componente `SimplePurchasesTab`; modo completo → tabs actuales sin cambios.
- Sin descuento automático de stock ni recetas en modo simple.

## Fuera de alcance

- Control de existencias / faltantes por ingrediente (no es posible sin recetas).
- Costo por plato y matriz de productos basada en receta: para Bodegón 65 el costo por plato sigue cargándose a mano en Costos si se quiere.

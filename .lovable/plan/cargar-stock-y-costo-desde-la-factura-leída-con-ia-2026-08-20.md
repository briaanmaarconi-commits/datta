# Cargar stock y costo desde la factura leída con IA

Hoy el lector de facturas prellena el gasto (salida de dinero) pero no toca stock ni costos. Se agrega el paso que falta: cada línea de la factura se puede vincular a un producto y, al confirmar, suma unidades al stock y actualiza el costo.

## Cómo va a funcionar

1. Se suben **uno o varios archivos a la vez**: varias fotos (hojas de una misma factura o facturas distintas), capturas y PDFs de varias páginas. Se ven en miniatura antes de leer, con opción de quitar alguna.
2. La IA lee todo y **agrupa por factura** (mismo proveedor + número = una sola compra, aunque venga en 3 fotos). Se abre una revisión prolija: una tarjeta por factura (proveedor, fecha, N.º, total) con una tabla ordenada de ítems — nombre, cantidad, unidad, precio unitario e importe — montos alineados a la derecha, filas alternadas y totales al pie.
3. Al lado de cada ítem aparece **a qué producto se carga**:
   - Si el nombre coincide con un producto existente (ej. "Nicasia Malbec"), viene ya vinculado.
   - Si no existe, se ofrece **crearlo** (queda con stock y costo cargados, sin precio de venta; el precio se pone después desde Carta o Costos).
   - También se puede elegir "solo gasto" para ítems que no van a stock (bolsas, flete, etc.).
4. Al confirmar se hace todo junto:
   - **Salida de dinero**: se registra la compra con su importe total y el gasto automático, igual que hoy.
   - **Stock**: se suman las unidades al producto (si ya había 4 y compró 6, quedan 10).
   - **Costo**: se recalcula con **promedio ponderado** entre el stock que ya había (a su costo anterior) y lo que entra ahora.
   - Queda un movimiento de stock tipo "entrada" con la referencia de la compra, visible en el historial.
5. Con el costo actualizado, el margen del producto se ve al instante en Costos y en Rentabilidad.

## Ejemplo

Factura: "Nicasia Malbec x6 — $9.000 c/u — $54.000".

- Gasto: $54.000 en Costo de mercadería.
- Stock: +6 unidades de Nicasia Malbec.
- Costo: si había 4 unidades a $8.000, el nuevo costo pasa a $8.600 ((4×8.000 + 6×9.000) / 10).

## Diseño de la revisión

- Una tarjeta por factura, colapsable, con encabezado: proveedor, fecha, N.º y total; badge verde "coincide" o amarillo "revisar" si la suma de ítems no da igual al total leído.
- Tabla de ítems con tipografía tabular, montos alineados a la derecha, filas alternadas y campos editables discretos (se ven como texto y se editan al tocar).
- Cada fila muestra el destino con un chip: verde "vincula a <producto>", azul "crea producto nuevo", gris "solo gasto". Un clic abre el buscador de productos.
- Barra superior con contador: "3 facturas · 27 ítems · $312.500" y acciones masivas: vincular todos los sugeridos, marcar todos como "solo gasto".
- En móvil las filas pasan a tarjetas apiladas para que se lea cómodo.

## Detalle técnico

- Nuevo componente `src/components/shared/InvoiceItemsReviewDialog.tsx`: revisión multi-factura con líneas editables, selector de destino por línea (`producto existente` / `crear producto` / `solo gasto`) y avisos de descuadre.
- `InvoiceScanDialog` pasa a soportar selección múltiple (`multiple`), miniaturas y barra de progreso "Leyendo 2 de 5". Cada archivo se envía en su propia llamada a `parse-invoice` (secuencial, con manejo de 429/402 según el contrato del gateway); los PDFs multi‑página van completos en un solo pedido.
- Agrupación en cliente: se juntan resultados con mismo proveedor+número normalizados; si un archivo no trae número, se agrupa por proveedor+fecha. Igual se puede separar/juntar a mano en la revisión.
- Matching automático por nombre normalizado (sin tildes, minúsculas, inclusión + similitud simple) contra `products` del establecimiento.
- Nueva función de base `apply_purchase_stock(_invoice_id uuid, _lines jsonb)` (security definer, valida que la factura sea del establecimiento del usuario) que por cada línea vinculada:
  - `UPDATE products SET direct_stock = direct_stock + qty, cost = (direct_stock*cost + qty*unit_price)/(direct_stock+qty), stock_mode = 'direct'`
  - `INSERT INTO stock_movements` (tipo `entry`, `reference_id` = id de la compra). Nota: `stock_movements.ingredient_id` es NOT NULL hoy, así que la migración lo vuelve nullable y agrega `product_id uuid` para poder registrar entradas de productos terminados.
  - Creación de producto nuevo cuando la línea lo pide: categoría por defecto "Sin categoría" (se crea si no existe), `price = 0`, `is_available = false`, `stock_mode = 'direct'`.
- Migración: `stock_movements.product_id` (nullable, FK a products), `ingredient_id` nullable, GRANTs y política existente sin cambios de alcance; función `apply_purchase_stock` con `GRANT EXECUTE TO authenticated`.
- `src/pages/cashier/Expenses.tsx`: al leer una factura, en vez de abrir solo el alta de movimiento, abre la revisión de ítems; al confirmar crea la `purchase_invoice` + ítems (lo que ya genera el gasto automático) y llama a `apply_purchase_stock`.
- `src/components/admin/stock/SimplePurchasesTab.tsx`: mismo paso de revisión antes de guardar.
- Se invalidan las queries de productos, stock y finanzas para que se vea al instante.

## Alcance

- Sigue activo solo donde está la bandera `ai_invoice_reader` (Restaurante prueba y la cabrera). BODEGON 65 no cambia.
- La carga manual de compras sigue igual; el paso de stock es opcional línea por línea.
- No se toca el descuento de stock por venta ni las recetas de ingredientes en esta etapa (las líneas se cargan a productos con stock directo).

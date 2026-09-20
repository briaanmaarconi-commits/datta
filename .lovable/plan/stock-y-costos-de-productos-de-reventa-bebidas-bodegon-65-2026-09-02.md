# Stock y costos de productos de reventa (bebidas) — BODEGON 65

Los platos elaborados siguen sin recetas ni stock. Se agrega control solo para lo que se vende tal cual se compra: gaseosas, agua, vinos, cervezas.

Estado actual verificado: BODEGON 65 tiene 83 productos, ninguno marcado como reventa, ninguno con costo cargado y 62 compras registradas en modo simple (nombre libre, sin vínculo a producto). Hoy la venta no descuenta stock en ningún caso (solo las cortesías descuentan).

## 1. Nueva pestaña "Productos en stock"

En Stock aparece una segunda pestaña junto a Compras (también en modo simple).

- Lista solo los productos marcados como **reventa** (se vende tal cual se compra), con: stock actual, mínimo, costo por unidad, precio y margen.
- Semáforo: rojo bajo el mínimo, amarillo cerca, verde ok.
- Botón "Elegir productos de reventa": lista de toda la carta con un check para marcar cuáles entran al control de stock (típicamente la categoría de bebidas). Se puede marcar una categoría entera de una vez.

## 2. Recuento inicial (carga masiva)

Botón "Recuento de stock" que abre la lista de todos los productos de reventa con un campo de cantidad al lado. Se carga todo de una y se guarda junto.

- Queda registrado como movimiento de "ajuste" con la fecha y el usuario.
- Se puede repetir cuando quieran (recuento semanal/mensual): el sistema muestra la diferencia entre lo que decía el sistema y lo contado, y esa diferencia queda como faltante/sobrante.

## 3. Compras a proveedores

Se puede cargar en los dos lugares, como pediste, con aviso de duplicado.

- **Desde Movimientos de caja** (rápido): proveedor + monto, como hoy. Debajo, un paso opcional "Detallar productos de stock" para sumar unidades a los productos de reventa.
- **Desde Stock** (detallado): cada producto con cantidad y precio; el gasto se genera solo como hoy.
- **Aviso de duplicado**: al guardar, si ya existe una compra o un gasto del mismo proveedor, con fecha en ±2 días y monto igual (±1%), aparece un cartel: "Parece que esta compra ya está cargada el 02/09 por $48.500. ¿Cargar igual?" con opciones "Es otra compra" / "Cancelar". Nunca bloquea, solo avisa.

## 4. Descuento por venta

Al **cerrar/cobrar la mesa** se descuentan las unidades vendidas de cada producto de reventa. Los platos elaborados no se tocan.

- Si se anula la mesa o se cierra como cortesía, no se duplica el descuento (la cortesía ya descuenta hoy).
- Cada descuento queda en el historial de movimientos con la mesa y el comprobante de referencia.
- Si el stock queda en cero no se bloquea la venta: se permite y queda en negativo visible en rojo, para que el recuento lo corrija.

## 5. Costos y doble conteo (importante)

- El costo por unidad se sigue cargando en **Costos y Promociones** (manual) y además se actualiza solo por **promedio ponderado** cuando la compra se carga con detalle.
- **No hay doble conteo en el balance**: el costo por unidad no genera ningún gasto. El único gasto real es la compra al proveedor. El costo sirve para margen por producto y rentabilidad.
- El único riesgo real de doble conteo es cargar la misma compra dos veces (una en Movimientos y otra en Stock); eso lo cubre el aviso del punto 3.

## Detalle técnico

- Se reutiliza `products.stock_mode = 'direct'`, `direct_stock`, `direct_min_stock` y `cost`. "Producto de reventa" = `stock_mode='direct'`.
- Nuevo componente `src/components/admin/stock/DirectStockTab.tsx` (listado + semáforo) y `DirectStockCountDialog.tsx` (recuento masivo). `src/pages/admin/Stock.tsx` pasa a mostrar en modo simple dos pestañas: Compras y Productos en stock.
- Selector masivo de productos de reventa: diálogo con checkboxes por categoría que hace un update en lote de `stock_mode`.
- Recuento: por cada línea con cambio, `UPDATE products.direct_stock` + `INSERT stock_movements` tipo `adjustment` con `product_id`, cantidad = diferencia y motivo "Recuento de stock".
- Descuento por venta: nueva función de base `apply_sale_stock(_invoice_id uuid)` (security definer, valida establecimiento) que recorre los `order_items` del comprobante, filtra productos con `stock_mode='direct'`, resta `direct_stock` e inserta `stock_movements` tipo `sale` con `reference_id` = id del comprobante. Se llama desde `src/pages/cashier/Tables.tsx` justo después de crear la `invoice`, y es idempotente (si ya existen movimientos con ese `reference_id`, no repite).
- Compras con detalle: se reutiliza `apply_purchase_stock(_invoice_id, _lines)` ya existente (suma stock + promedio ponderado + movimiento `entry`).
- Aviso de duplicado: consulta previa a guardar contra `purchase_invoices` y `finance_transactions` (mismo establecimiento, proveedor/descripción normalizada, fecha ±2 días, monto ±1%). Solo UI, sin cambios de datos.
- Migración necesaria: función `apply_sale_stock` con `GRANT EXECUTE TO authenticated`. `stock_movements.product_id` y `ingredient_id` nullable ya existen.

## Fuera de alcance

- Recetas e ingredientes por plato (sigue sin usarse en BODEGON 65).
- Descuento de stock para platos elaborados.
- Órdenes de compra o sugerencias de reposición automáticas (se pueden agregar después con el histórico de ventas).

---
name: Gestión de Stock e Inventario
description: Sistema dual de stock - directo (productos terminados) y con receta (ingredientes). Compras, mermas, ajustes, historial, sugerencias y cierre de mesas como cortesía.
type: feature
---

## Sistema Dual
- **Stock directo**: Productos terminados (bebidas, postres comprados). Se descuenta el producto al vender.
- **Con receta**: Platos elaborados. Se descuentan los ingredientes según la receta al vender.
- **Sin trackeo**: Productos que no participan del inventario.
- Cada producto tiene `stock_mode` ('none' | 'direct' | 'recipe') en la tabla `products`.
- Productos directos tienen `direct_stock` y `direct_min_stock`.

## Tablas
- `ingredients`: Materia prima con unidad (g/ml/kg/l/unidad), stock actual, stock mínimo, costo/u, proveedor
- `product_recipes`: Vincula producto → ingrediente + cantidad (UNIQUE por par)
- `stock_movements`: Historial de movimientos. Tipos: entry/sale/waste/adjustment/consumption. Para consumption, columnas `consumption_type` ('invitation'|'staff_meal'|'internal') y `finance_transaction_id`
- `purchase_invoices`: Facturas de compra (proveedor, nro, fecha, total)
- `purchase_invoice_items`: Detalle de factura (ingrediente, cantidad, precio unitario)

## UI Stock — 4 Tabs
1. **Estado**: Dashboard semáforo unificado (productos directos + ingredientes)
2. **Productos y Recetas**: Configurar modo de stock por producto, edición inline de recetas
3. **Movimientos**: Sub-tabs Compras / Mermas / Ajustes / Historial
4. **Sugerencias**: Basadas en consumo últimos 30 días, cobertura de 7 días

## Cortesías (Mesas sin cobro)
Para invitaciones a clientes, comida del personal o consumo interno se elige a nivel de **mesa con pedido**, no por ingrediente. La operación reutiliza la receta del producto.

- Hook compartido: `src/hooks/useCloseTableAsCourtesy.ts` (función `closeTableAsCourtesy`)
- Componente compartido: `src/components/shared/CourtesyDialog.tsx` con selector de tipo y notas
- Disponible en **2 lugares**:
  - **Caja** (`/cashier/tables`): botón "Cerrar como cortesía (sin cobro)" en el diálogo de cobro debajo de los métodos de pago
  - **Mesero** (`/waiter/tables`): botón Gift "Cortesía" en cada card de mesa con pedidos activos
- Al confirmar:
  1. Marca órdenes como `cancelled` con `payment_method='courtesy'`
  2. Libera la mesa (`status='free'`)
  3. Descuenta ingredientes (recetas) y/o stock directo según `stock_mode` de cada producto
  4. Crea `finance_transactions` (expense) con SUMA de costos de ingredientes (cost_per_unit × qty)
  5. Inserta `stock_movements` tipo `consumption` por cada ingrediente, vinculados a la finance_transaction
  6. NO genera invoice ni ingreso por venta
- Categorías de gasto auto-creadas via `ensure_consumption_expense_category()`: "Invitaciones / Cortesías", "Comida de personal", "Consumo interno"

## Pendientes
- Descuento automático por venta normal (trigger o lógica al cerrar orden)
- Lectura de facturas con IA (foto/PDF)
- Reporte de cortesías por período en Analytics

## Modo simple (por establecimiento)
- Flag `establishments.stock_simple_mode`. Activo en BODEGON 65.
- Oculta recetas/ingredientes/sugerencias: `/admin/stock` muestra solo `SimplePurchasesTab` (compras de materia prima con nombre libre, cantidad, unidad y precio; `purchase_invoice_items.item_name` / `unit`, `ingredient_id` nullable).
- Cada compra genera gasto automático en categoría **"Costo de mercadería"** (no "Compras de insumos"), vía `trg_sync_purchase_to_expense` + `ensure_raw_material_expense_category`. Así cuenta como MP manual en Rentabilidad y aparece en balance y analíticas.
- El toggle "Gestión de stock simple" está en `StockSettingsCard`.

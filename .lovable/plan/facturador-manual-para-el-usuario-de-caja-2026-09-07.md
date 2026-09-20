# Facturador manual para el usuario de caja

María (usuario de caja) va a poder emitir una factura escribiendo ella misma el detalle, sin depender de una mesa cerrada ni del consumo cargado.

## Qué va a ver

En **Facturación** (caja) se agrega un botón **"Factura manual"** que abre una ventana con:

- **Detalle**: puede cargar una sola línea con la descripción y el monto (por ejemplo "1 comida mesa 3" — $12.000) o agregar varias líneas con descripción, cantidad y precio unitario. El total se calcula solo.
- **Receptor**: Consumidor Final por defecto; si elige Responsable Inscripto pide CUIT y Razón Social (igual que hoy).
- **Tipo de comprobante**: se resuelve automáticamente según la condición fiscal del local y del receptor (A / B / C), igual que en la facturación por mesa.
- **Forma de pago** (efectivo, tarjeta, transferencia) solo como dato del comprobante.
- **Fecha de emisión**: por defecto hoy, con la opción de fecha anterior respetando las reglas de ARCA ya implementadas.

Al confirmar, se emite la factura ante ARCA y se abre la vista de ticket 80 mm con **Imprimir**, **Reimprimir** y **Descargar PDF (A4)**, igual que las facturas actuales. La factura queda listada junto a las demás.

Estas facturas **no** generan movimientos de caja ni ingresos: son solo fiscales, como pediste.

## Detalles técnicos

- Nuevo componente `src/components/cashier/ManualInvoiceDialog.tsx`: formulario de líneas (descripción, cantidad, precio), validaciones (al menos una línea, total > 0, datos del receptor para Factura A), cálculo de total.
- Reutiliza `invokeAfip` con `action: 'authorize'`, `invoice_id: null` y el arreglo `items` armado a mano. La función `afip-invoice` ya acepta `invoice_id` nulo y guarda `items_detail`, así que no hace falta migración ni cambios de backend.
- `src/pages/cashier/Invoices.tsx`: botón para abrir el diálogo y, al autorizar, reutilizar el `FiscalTicketDialog` existente e invalidar `fiscal-invoices`.
- Se agrega el mismo botón en `src/pages/admin/Billing.tsx` para el usuario administrador, aprovechando el mismo componente.
- Sin cambios en `finance_transactions` ni en el arqueo de caja.

# Lector de facturas con IA en Movimientos de caja

## Qué se agrega

En **Caja → Salidas e Ingresos** se agrega un botón nuevo **"Leer factura con IA"** al lado del botón **"Registrar movimiento"**. También estará disponible en **Stock → Compras de mercadería**.

Flujo:

1. Se toca el botón y se sube una foto (la típica de WhatsApp: JPG/PNG/HEIC pasada a JPG), una captura o un PDF.
2. La IA lee el comprobante y devuelve: proveedor, fecha, número de factura, ítems (descripción, cantidad, unidad, precio unitario) y total.
3. Se abre el formulario **ya completo** con esos datos, editable. Nada se guarda hasta que la persona revisa y confirma.
4. Al confirmar, se guarda igual que hoy: queda la compra registrada y el gasto automático en "Costo de mercadería", sin afectar el efectivo esperado de la caja (como ya funciona).

La carga manual sigue exactamente igual: el lector es una opción extra, no reemplaza nada.

## Detalles de la lectura

- Formatos aceptados: JPG, PNG, WEBP y PDF. Fotos torcidas o con poca luz se procesan igual (la IA hace el reconocimiento), pero si algo no se entiende, ese campo queda vacío para completarlo a mano.
- Si el total leído no coincide con la suma de los ítems, se muestra un aviso amarillo antes de guardar.
- El archivo original queda guardado y se puede volver a ver desde el listado de compras (ícono de comprobante).

## Detalle técnico

- Nueva edge function `parse-invoice`: recibe el archivo en base64, llama al Lovable AI Gateway (`google/gemini-3-flash`, entrada multimodal imagen/PDF) con salida en JSON estructurado (proveedor, fecha, nro, líneas, total, moneda). Maneja 429/402 mostrando el mensaje real en pantalla.
- Bucket privado `purchase-receipts` en storage, con políticas por `establishment_id`; se sube el archivo y se guarda la ruta.
- Migración: `purchase_invoices.receipt_url text` (nullable) para enlazar el comprobante.
- Nuevo componente `src/components/shared/InvoiceScanDialog.tsx` (subida + estado "leyendo" + preview del resultado) reutilizado por `SimplePurchasesTab.tsx` y por un botón en `src/pages/cashier/Expenses.tsx`.
- En Expenses, si el establecimiento está en modo stock simple, el resultado abre el alta de compra; si no, propone un movimiento de gasto simple (categoría sugerida + monto + descripción).
- Sin cambios en la lógica de arqueo ni en cómo se calcula el efectivo esperado.

## Puesta en marcha controlada

- La función arranca **apagada para BODEGON 65**: ahí no aparece ningún botón nuevo ni cambia nada de lo que ya usan.
- Se prueba primero con los establecimientos de **Benja / Naty**, donde sí se ve el botón "Leer factura con IA".
- Se controla con una bandera por establecimiento (`establishments.ai_invoice_reader`, default apagado), activada solo para los establecimientos de prueba. Cuando esté validado, se enciende para Bodegón 65 con un solo cambio.

## Fuera de alcance

- Lectura automática de facturas que llegan por mail o WhatsApp sin intervención.
- Cruce fiscal con ARCA de las facturas de compra.

# Reporte de cierre de turno imprimible

Al cerrar el turno desde Caja, generar un reporte en formato 80 mm listo para la ticketera, con opción de reimprimirlo desde "Turnos anteriores".

## Qué incluye el ticket

Encabezado
- Nombre del establecimiento, título "CIERRE DE TURNO"
- Fecha del turno, hora de apertura y de cierre, usuario que cierra

Ventas del turno
- Total de ventas, cantidad de pedidos cerrados, ticket promedio

Desglose por método de pago
- Efectivo, tarjeta, transferencia

Arqueo de caja (lo central)
- Fondo inicial
- + Ingresos en efectivo
- − Egresos en efectivo
- = Efectivo esperado
- Efectivo real contado
- DIFERENCIA con leyenda destacada: SOBRANTE / FALTANTE / CAJA OK

Extras
- Propinas del turno (informativo, no afecta el arqueo)
- Cantidad de facturas fiscales emitidas en el turno, si hubo
- Línea de firma del responsable

## Flujo

1. Caja completa el arqueo y confirma el cierre (igual que hoy).
2. Al cerrarse correctamente, se abre un diálogo "Turno cerrado" con la vista previa del ticket y botón **Imprimir reporte**.
3. En la tabla "Turnos anteriores" se agrega un botón de impresión por fila para reimprimir el reporte (marcado como REIMPRESIÓN).

## Detalles técnicos

- Nuevo componente `src/components/cashier/ShiftReportTicket.tsx`, mismo patrón de impresión que `CloseTicket.tsx` (clase `print-ticket`, ancho 80 mm, tipografía monoespaciada, separadores punteados). Sin cambios en `src/index.css`.
- `src/pages/cashier/ShiftSummary.tsx`: al finalizar `closeShift`, guardar en estado los datos del turno (stats, arqueo, propinas) y abrir el diálogo del reporte antes de invalidar las queries, para que los números impresos sean los del turno recién cerrado.
- Para la reimpresión de turnos anteriores se recalculan ventas, métodos de pago y propinas consultando `orders` / `invoices` acotados por `opened_at` y `closed_at` del turno seleccionado.
- Una sola copia por defecto; el reporte no reemplaza los tickets de mesa existentes.

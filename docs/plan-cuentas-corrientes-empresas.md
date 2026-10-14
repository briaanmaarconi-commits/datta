# Cuentas corrientes de empresas (vales) — Restaurant Olavarría

Estado: decisiones de negocio cerradas. Fase 1 en rama (sin desplegar). El cierre de mesa (Fase 2) se toca **después** de la prueba de comandas (jueves 2026-10-15).

## Decisiones de negocio (confirmadas)

| Tema | Decisión |
|---|---|
| Facturación | Las dos formas: **por vale seleccionado** o **todos los vales del período** en una factura a la empresa |
| IVA | Los precios **ya incluyen IVA** |
| Alcance del vale | Es un consumo **para una cantidad de personas** (campo `comensales`) |
| Fecha de corte | La define la dueña (por empresa; por defecto fin de mes) |
| Comprobación | El **número de vale** alcanza (sin foto) |
| Propina | No hay propina en estos vales |
| Tope | No hay tope de monto: solo se registra la cantidad de comensales |
| Cobro | Las empresas pagan con **cualquier medio** (efectivo, tarjeta, transferencia, cheque, otro) |
| Comprobante | A definir con el contador más adelante: por vale o por el total de los vales (el sistema soporta ambos) |

## Flujo

1. **Cierre de mesa (caja o admin):** nuevo medio de pago **Cuenta corriente** → elige empresa, carga nº de vale, comensales y nombre de quien firma. La mesa queda cobrada a cuenta; **no entra al arqueo de efectivo**.
2. **Durante el mes:** cada vale queda `pendiente` en la cuenta de la empresa.
3. **Control (admin):** tilda cada vale como `verificado` contra el papel físico.
4. **Facturación (admin):** selecciona vales (uno, varios o "todos del período") → emite **una factura a la empresa** con CUIT/razón social. Los vales pasan a `facturado` y quedan ligados al comprobante.
5. **Cobro (admin):** registra el pago de la empresa (total o parcial, medio de pago, fecha) aplicado a facturas/vales. Recién ahí se genera el **ingreso en finanzas**.

Estados de un vale: `pendiente → verificado → facturado → cobrado` (facturar y cobrar son independientes: se puede cobrar sin facturar o al revés; el resumen muestra ambos saldos).

## Modelo de datos (migración nueva)

- `company_accounts`: `establishment_id`, `name`, `cuit`, `razon_social`, `condicion_iva`, `contact`, `cutoff_day` (1–28, NULL = fin de mes), `is_active`.
- `company_vouchers`: `account_id`, `voucher_number` (único por empresa), `diners`, `signed_by`, `table_number`, `order_ids`, `invoice_id` (cierre de mesa), `amount`, `status`, `billed_invoice_id` (AFIP), `settlement_id`, `created_by`, `verified_at/by`, `notes`.
- `company_settlements`: cobros de la empresa (`account_id`, `amount`, `payment_method`, `paid_at`, `notes`, `finance_transaction_id`) + aplicación a vales.
- RLS: admin y caja del local; caja **registra y lee**, sin editar ni borrar vales ya cargados; toda corrección del admin queda en auditoría.

## Reglas

- Vale duplicado (mismo nº y empresa) → rechazado.
- Anular una mesa cobrada a cuenta corriente → solo admin, con motivo; un vale facturado exige nota de crédito.
- Reportes: la venta cuenta el día del consumo; la caja, el día del cobro; el cierre de turno muestra "A cuenta corriente" aparte.

## Facturación AFIP

Reutiliza lo existente (emisión con CUIT receptor y padrón): una factura A/B a la empresa con una línea por vale (o detalle resumido), importe = suma de vales seleccionados (IVA incluido, discriminado según tipo de comprobante). Factura solo vales `verificado`/`pendiente` no facturados antes.

## Pantallas

- **Cuentas corrientes** (admin; lectura para caja): saldo por empresa, vales por período, filtros por estado.
- **Resumen imprimible/Excel** por empresa y período para entregar con la factura.
- **Alta/edición de empresas** y definición de fecha de corte.

## Fases

| Fase | Entrega |
|---|---|
| 1 | Migración, empresas y permisos + tests de aislamiento |
| 2 | Medio de pago "Cuenta corriente" en cierre de mesa (validaciones) |
| 3 | Pantalla de saldos, verificación y resumen imprimible |
| 4 | Facturación por vale / por período |
| 5 | Registro de cobros e integración con finanzas |
| 6 | Prueba en el local con una empresa real |

## Pendientes

1. **Contador:** definir si la factura es por vale o por el total del período según cada empresa (el sistema soporta las dos), y el tipo de comprobante A/B.

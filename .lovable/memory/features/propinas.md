---
name: Gestión de propinas
description: Modos pool/individual, registro neutral (ingreso+egreso espejo), panel liquidación, ranking por mozo. Excluidas de analíticas.
type: feature
---
- `establishments.tip_mode`: 'individual' (default) o 'pool'.
- `invoices` guarda: `tip_amount`, `tip_payment_method`, `tip_waiter_id`, `tip_mode`, `tip_settled`, `tip_settled_at`.
- Reglas en cierre de mesa (cashier/Tables):
  - Modo `individual`: solo se registran propinas de tarjeta/transferencia. Las de efectivo se las lleva el mozo (no se registran).
  - Modo `pool`: se registran con cualquier método. En efectivo, el cliente entrega total + propina (cashRequired).
  - Mozo sugerido = `created_by` del primer pedido de la mesa (editable).
- **Registro NEUTRAL**: al cobrar, cada propina genera SIMULTÁNEAMENTE:
  - `finance_transaction` income en categoría **"Propinas"** (`ensure_tips_income_category`)
  - `finance_transaction` expense espejo en categoría **"Pago de propinas"** (`ensure_tips_payout_category`)
  Resultado: balance neutro, caja siempre cuadrada.
- Liquidación en `/admin/cash` → tab **Propinas**: agrupa pendientes por mozo (individual) o pozo (pool). "Marcar como pagado" SOLO cambia `tip_settled=true` (NO crea otro egreso, ya está creado al cobrar).
- **Excluidas de analíticas**: `Analytics.tsx` y `AnalyticsComparison.tsx` filtran categorías `Propinas` y `Pago de propinas` por nombre (regex), igual que `ProfitMarginTab`. No aparecen en gráficos de ingresos/gastos ni en KPIs.
- UI: toggle de modo en `TipsSettingsCard` (admin), input de propina + selector de mozo en diálogo de cobro.
- Tab Propinas incluye: banner explicativo de neutralidad, summary, pendientes agrupados, ranking mensual por mozo (modo individual), historial completo.

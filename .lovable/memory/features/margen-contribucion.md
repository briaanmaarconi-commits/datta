---
name: Margen de contribución, ganancia y punto de equilibrio
description: Cálculo de rentabilidad para restaurantes en pestaña Rentabilidad de /admin/analytics
type: feature
---
# Rentabilidad (pestaña Rentabilidad en /admin/analytics)

## Datos fuente (sin cambios en DB)
- Ventas brutas: `orders.total` con `status='closed'`
- Costo materia prima (MP): `SUM(order_items.cost_snapshot * order_items.quantity)` de los pedidos cerrados
- Gastos operativos: `SUM(finance_transactions.amount)` con `type='expense'`, EXCLUYENDO `'Compras de insumos'` (ya contada en MP) y CUALQUIER categoría que matchee `/propina|tip/i` (ej. "Propinas", "Pago de propinas") por ser pass-through (ingreso + egreso que se anulan)

## Fórmulas
- margen_contribucion = ventas - costo_mp
- % margen_contribucion = margen_contribucion / ventas
- margen_ganancia = margen_contribucion - gastos_operativos
- punto_equilibrio = gastos_operativos / % margen_contribucion
- PE diario = PE mensual / 30  ·  PE semanal = PE mensual / 4.33

## Casos especiales
- Si %MC ≤ 0 → mostrar advertencia "Tu costo de mercadería supera tus ventas"
- Si gastos_operativos = 0 → PE = 0

## Períodos
- Último mes (30 días), Últimos 6 meses (180), Último año (365)
- Comparación contra período anterior equivalente para variación

## Umbrales recomendados (alertas en ranking gastos)
- Salarios ≤ 30% sobre venta · Alquiler ≤ 10% · Impuestos ≤ 12% · Marketing ≤ 5% · Servicios ≤ 5%

## Componentes
- `ProfitMarginTab.tsx` — orquesta todo
- `ProfitMarginCard.tsx` — tarjeta de margen por período
- `BreakEvenCard.tsx` — PE + mini-tarjetas día/semana/mes + gráfico 12m + simulador
- `ExpenseBreakdownCard.tsx` — ranking + pie + top 3 + alertas vs umbrales

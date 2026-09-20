# Simulación de demanda 2025 y 2026

Objetivo: cargar historial de ventas y gastos para "Restaurante prueba" de modo que las comparaciones de períodos (hoy vs ayer, semana, mes, año vs año anterior) muestren datos reales en Analíticas y Rentabilidad.

## Estado actual verificado

- Restaurante prueba: 662 pedidos cerrados, entre 14/04/2026 y 12/06/2026.
- No hay datos de 2025 ni de junio a agosto de 2026, por eso las comparaciones anuales y de mes/semana actual salen vacías.
- Hay 14 productos disponibles para armar los pedidos.

## Qué se va a generar

1. **Año 2025 completo (ene–dic)**: pedidos cerrados con estacionalidad realista (picos en verano, fines de semana y viernes/sábado noche), volumen promedio algo menor que 2026 para que el crecimiento interanual se note.
2. **Año 2026 hasta hoy (03/08)**: completar los huecos — enero a abril, y del 13/06 al 03/08 — respetando la demanda ya existente de abr–jun para no duplicar.
3. **Composición de cada pedido**: 2 a 6 ítems variados de la carta, cantidades 1–3, métodos de pago mezclados (efectivo, tarjeta, transferencia), horarios de almuerzo y cena, mesas rotativas.
4. **Gastos y costos mensuales** en ambos años: sueldos, alquiler, servicios (luz, gas, agua, internet), impuestos (IVA, IIBB), marketing, costo de mercadería y mermas — con montos crecientes por inflación en 2026 respecto a 2025.
5. **Propinas** en una porción de las ventas, siguiendo el esquema neutral ya existente (ingreso + egreso espejo).

## Detalles técnicos

- Inserción por SQL con `generate_series` sobre fechas y selección aleatoria acotada de productos, en `orders`, `order_items` y `finance_transactions`.
- `order_items.cost_snapshot` se completa con el costo efectivo del producto para que Rentabilidad y la matriz de productos funcionen.
- Se respeta `establishment_id` del restaurante de prueba; el otro establecimiento queda sin tocar.
- Volumen objetivo aproximado: ~4.500 pedidos en 2025 y ~2.000 pedidos nuevos en 2026, suficientes para gráficos densos sin saturar la carga del cliente.

## Verificación posterior

Revisar en `/admin/analytics` (Explorar, Comparar, Rentabilidad y Productos) que aparezcan datos en año vs año anterior, mes vs mes anterior y semana vs semana anterior.

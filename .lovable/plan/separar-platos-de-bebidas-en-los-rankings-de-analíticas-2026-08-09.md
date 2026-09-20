# Separar platos de bebidas en los rankings de Analíticas

Hoy los rankings "Top 10 productos más pedidos" y "Top 10 menos pedidos" mezclan todo lo vendido, incluidas las bebidas (categoría "Bebidas" existe en ambos establecimientos). La idea es que esos rankings midan solo cocina.

## Qué se va a hacer

1. **Clasificar cada ítem vendido** como bebida o plato según el nombre de su categoría (Bebidas, Tragos, Vinos, Cervezas, Gaseosas, Jugos, Cafetería/Café, Licores, Barra, Sin alcohol). Todo lo demás cuenta como plato.
2. **Top 10 platos más pedidos** y **Top 10 platos menos pedidos**: mismos gráficos y estilo actual, renombrados a "platos" y calculados solo con productos que no son bebidas.
3. **Nueva tarjeta "Top 10 bebidas más pedidas"**, con el mismo formato de barras (unidades + ingreso), ubicada junto a los rankings de platos. Si no hay ventas de bebidas en el período, muestra "Sin datos".
4. **Exportaciones (PDF/Excel)**: el ranking exportado pasa a ser el de platos, y se agrega una sección/hoja aparte con el ranking de bebidas, para que el reporte coincida con lo que se ve en pantalla.

## Detalles técnicos

- En `src/pages/admin/Analytics.tsx`, la consulta a `order_items` ya trae `products.categories(name)`, así que la separación se hace en el mismo `useQuery`: se generan `dishRanking` y `drinkRanking` en lugar de un único `productRanking`.
- La detección de bebidas se hace con una expresión regular sobre el nombre de categoría, sin acentos ni mayúsculas, en un helper reutilizable para no repetir criterio.
- `src/lib/exportAnalytics.ts` suma un campo opcional `drinkRanking` y su tabla/hoja correspondiente.
- No se toca la base de datos ni las demás métricas (ingresos por categoría, matriz de productos, rentabilidad siguen igual).

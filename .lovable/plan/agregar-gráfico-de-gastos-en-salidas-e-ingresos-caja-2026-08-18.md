# Agregar gráfico de gastos en Salidas e Ingresos (caja)

## Objetivo
En la pantalla **Caja → Salidas e Ingresos** (`src/pages/cashier/Expenses.tsx`) agregar un gráfico de barras que muestre los **gastos agrupados por categoría, ordenados de mayor a menor**, con un buscador para filtrar categorías. Solo salidas, no ingresos.

## Alcance
- Frontend únicamente: no se tocan tablas ni políticas del backend.
- Reutilizar `recharts` (ya está en el proyecto) y los componentes de UI existentes.
- Respetar el selector de período actual y ampliar los presets para que el usuario pueda elegir rangos comunes.

## Cambios propuestos

### 1. Ampliar presets de período
En `src/pages/cashier/Expenses.tsx`:
- Agregar el preset `last_30_days` al tipo `PeriodFilter`.
- Actualizar `getDateRange` para que devuelva los últimos 30 días cuando se elija ese preset.
- Agregar el botón correspondiente en la barra de filtros (junto a Día, Semana, Mes, Año, Personalizar).

### 2. Calcular datos del gráfico
A partir de `filteredTx` ya existente:
- Filtrar solo transacciones de tipo `expense`.
- Excluir propinas usando `isTipTx` (manteniendo el comportamiento actual del balance).
- Agrupar por nombre de categoría (`finance_categories.name`) sumando `amount`.
- Ordenar de mayor a menor.
- Exponer un array tipado `{ name: string; amount: number }[]` para el gráfico.

### 3. Agregar buscador de categorías
- Nuevo estado `categorySearch`.
- Input de búsqueda sobre el gráfico que filtre las categorías por nombre (case-insensitive).
- Mostrar mensaje amigable si no hay gastos en el período o si la búsqueda no arroja resultados.

### 4. Nuevo gráfico de barras
Insertar una nueva sección entre las tarjetas resumen y la tabla de movimientos:
- Card con título **"Gastos por categoría"**.
- `ResponsiveContainer` + `BarChart` con `layout="vertical"` para que los nombres de categoría largos se lean bien.
- Eje Y con `dataKey="name"`, eje X numérico, `Tooltip` formateado a moneda argentina.
- Barras con color semántico de gastos (variante `destructive`) y bordes redondeados.
- Opcional: mostrar el monto al final de cada barra.

### 5. Ajustes de UI menores
- Mantener las tarjetas de Ingresos, Salidas y Balance sin cambios.
- Asegurar que el gráfico se actualice al cambiar el período, el tipo de filtro o la búsqueda.

## Verificación
- Ejecutar `bun run build` (o el typecheck automático) para confirmar que no hay errores de tipado.
- Revisar en preview que el gráfico renderice, respete el período seleccionado y el buscador funcione.

## Notas técnicas
- Archivo a modificar: `src/pages/cashier/Expenses.tsx`.
- Librería: `recharts` (importar `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`).
- No se requieren migraciones ni secrets.

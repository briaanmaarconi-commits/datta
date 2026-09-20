# Comparar meses específicos en la sección "Comparar períodos" existente

## Objetivo
Modificar la sección "Comparar períodos" ya existente en Analíticas (`AnalyticsComparison.tsx`) para que, además de las opciones actuales (Hoy vs Ayer, Esta semana vs anterior, etc.), tenga un modo para elegir **dos meses completos cualesquiera (con año)** y compararlos. Ej: enero 2026 vs agosto 2026, o abril 2026 vs abril 2025.

## Qué se hace

### 1. Nueva opción "Comparar meses" en el selector existente
- Se agrega al selector de período actual la opción **"Comparar meses"**.
- Al elegirla aparecen **dos botones/selectores**, uno para cada mes a comparar:
  - **Mes A**: despliega los 12 meses (Enero…Diciembre) + selector de año.
  - **Mes B**: igual.
- Valores por defecto: Mes A = mes actual, Mes B = mes anterior.
- El año se elige con un selector que lista desde 2024 hasta el año actual (+1 por las dudas).
- Las demás opciones del selector (Hoy, Semana, Mes, Año, Personalizado) siguen funcionando igual.

### 2. Rango de fechas de cada mes
- Cada mes seleccionado se convierte en un rango completo: del día 1 a las 00:00 hasta el último día del mes a las 23:59 (horario local Argentina, igual que el resto del sistema).
- El **Mes A** pasa a ser el "período actual" (línea continua / columna Actual) y el **Mes B** el "período anterior" (línea punteada / columna Anterior). Todo lo demás del componente (KPIs, score, gráficos superpuestos, tablas de categorías y gastos, mix de productos) funciona igual, sin cambios de lógica.

### 3. Etiquetas claras
- En gráficos y tablas, cuando el modo es "Comparar meses", las leyendas "Actual"/"Anterior" pasan a mostrar el nombre del mes y año (ej: "Agosto 2026" vs "Abril 2025") para que no haya confusión.

## Detalles técnicos
- Todo el cambio es en `src/components/admin/AnalyticsComparison.tsx` (frontend, sin cambios en base de datos).
- Se agrega el caso `months` en `getComparisonRanges` (recibe `{ month, year }` de A y B) y dos pequeños selectores de mes/año reutilizando los componentes Select de shadcn ya usados.
- Se reutiliza `fetchPeriodData` sin modificaciones.
- Formato de números compacto (k/M) ya existente se mantiene.

## Verificación
- Build OK.
- Prueba en preview: comparar dos meses con datos (ej: agosto 2026 vs julio 2026 en Bodegón 65) y verificar que los gráficos y KPIs cambian al cambiar mes o año.

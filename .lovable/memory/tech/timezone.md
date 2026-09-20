---
name: Argentina timezone
description: All date grouping and filtering uses America/Argentina/Buenos_Aires (UTC-3) via utility functions in lib/utils.ts
type: preference
---
All date operations (grouping orders by day, heatmaps, dashboard "today", etc.) use Argentina timezone.
Utility functions: `toArgDate()`, `argDayRange()`, `argHour()`, `argDayOfWeek()` in `src/lib/utils.ts`.
Argentina is UTC-3 with no DST.
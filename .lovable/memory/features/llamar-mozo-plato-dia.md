---
name: Call Waiter & Daily Specials
description: Clients can call waiters via button (2min cooldown), admins mark daily specials on products, waiter gets doorbell notification (toggleable)
type: feature
---
- **Plato del día**: Campo `is_daily_special` en products, toggle en admin Menu, sección destacada en menú público
- **Llamar al mozo**: Tabla `waiter_calls` (realtime), botón en menú QR por mesa con cooldown 2 min
- **Notificación mozo**: Sonido doorbell (ding-dong, distinto a cocina), toast con botón "Atender", toggle mute en sesión
- **Platos populares**: Componente PopularDishes muestra los 6 más reseñados con ranking

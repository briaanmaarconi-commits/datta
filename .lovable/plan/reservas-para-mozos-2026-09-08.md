# Reservas para mozos

Los mozos van a tener su propia sección **Reservas**, para cargar reservas nuevas y controlar la llegada de la gente desde el celular.

## Situación actual

- Ya existe una pantalla de Reservas, pero solo para **Caja** y **Administración** (`/cashier/reservations`).
- El mozo hoy solo tiene **Mis Mesas** y **Pedidos**; no ve reservas.
- En la base, el mozo tiene permiso para **ver** reservas, pero **no** para crearlas ni cambiarles el estado. Hay que habilitarlo.

## Qué va a ver el mozo

Nueva opción **Reservas** en el menú lateral del mozo (`/waiter/reservations`), pensada mobile-first:

- **Hoy** por defecto: lista de reservas del día ordenadas por horario, con selector para ver otro día.
- Cada reserva en formato tarjeta (no tabla, para que entre bien en el celular): hora grande, nombre del cliente, mesa, cantidad de personas, teléfono y notas.
- Colores por estado: Confirmada, Llegó (sentados), Cancelada, No vino.
- Aviso visual para reservas **atrasadas** (pasó la hora y siguen confirmadas), para que el mozo las tenga presentes.
- Contadores arriba: reservas de hoy, personas esperadas y cuántas ya llegaron.

## Qué va a poder hacer

- **Nueva reserva**: nombre, teléfono, cantidad de personas, mesa, fecha y hora, y notas.
- **Marcar que llegó**: un botón por reserva que la pasa a "Llegó" y deja la mesa marcada como ocupada, con la cantidad de personas de la reserva.
- **Cancelar** o marcar **No vino**.
- **Deshacer**: si se marca por error, se puede volver a Confirmada.

Todo lo que cargue el mozo aparece también en la pantalla de Caja y Administración, y al revés: es la misma agenda compartida.

## Detalles técnicos

**Base de datos (migración)**
- Nueva política en `reservations` que permita al rol `waiter` crear y actualizar reservas de su propio establecimiento (hoy solo tiene lectura). Se mantiene el aislamiento por `establishment_id`.

**Frontend**
- Nuevo `src/pages/waiter/Reservations.tsx`: mismo modelo de datos que `src/pages/cashier/Reservations.tsx`, pero en tarjetas mobile-first, con filtro por día y foco en el flujo de llegada.
- Nueva ruta protegida `/waiter/reservations` (rol `waiter`) en `src/App.tsx`.
- Ítem **Reservas** con icono de calendario en `src/layouts/WaiterLayout.tsx`.
- Al marcar "Llegó": actualiza la reserva a `seated` y pone la mesa en `occupied` con `guest_count` = personas de la reserva.
- React Query con invalidación de `['reservations', establishmentId]` y de las mesas, más suscripción realtime para que Caja y Mozo se mantengan sincronizados.

No se toca la pantalla de Caja ni el flujo de pedidos existente.

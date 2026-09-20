# Limpiar los datos de prueba de BODEGON 65

## Qué hay hoy en BODEGON 65

- 47 pedidos (del 06/08 al 08/08) con sus ítems
- 16 comprobantes internos y 2 facturas fiscales
- 17 movimientos de ingreso por "Ventas" ($313.500)
- 6 consumos de cortesía (invitaciones, comida de personal, consumo interno) con sus movimientos en $0
- 7 turnos de caja abiertos/cerrados
- 1 reserva y 17 registros de auditoría
- Las 26 mesas ya están libres

## Qué se va a borrar

1. Todos los pedidos y sus ítems.
2. Todos los comprobantes internos y las 2 facturas fiscales asociadas.
3. Los movimientos de caja generados por esas ventas y por las cortesías.
4. Los consumos de cortesía cargados en las cuentas de Maria Luz, Pablo y El Ruso (las cuentas quedan, sin consumo).
5. Los turnos de caja de prueba y el historial de auditoría.
6. La reserva de prueba.
7. Todas las mesas quedan en estado libre.

No se toca: la carta (productos, categorías, fotos), sectores y plano, usuarios y roles, datos fiscales ni el certificado de ARCA. Tampoco se toca ningún otro restaurante.

## A definir

Hay 3 movimientos cargados a mano que no vienen de pedidos:

- Otros ingresos: $550.000
- Mermas: $20.000
- Otros: $10.000

Por defecto **también se borran** (parecen de prueba). Si alguno es real, avisame y lo dejo.

## Detalles técnicos

Borrado por `establishment_id = 5a56bc2d-...` en este orden: `order_items` (por `order_id`), `orders`, `fiscal_invoices`, `invoices`, `courtesy_charges`, `finance_transactions`, `shift_controls`, `staff_shifts`, `reservations`, `audit_logs`; y `UPDATE tables SET status='free', guest_count=NULL`. Se ejecuta con la herramienta de datos (no es un cambio de esquema). La operación no es reversible.

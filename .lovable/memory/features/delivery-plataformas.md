---
name: Delivery (Rappi / PedidosYa)
description: Módulo Delivery por establecimiento — pedidos manuales de plataformas, comisiones configurables y analíticas por canal
type: feature
---

# Delivery (Rappi / PedidosYa / propio)

## Habilitación
- Add-on por establecimiento: `establishments.delivery_enabled` (switch en Super Admin > Clientes > editar cliente).
- Comisiones configurables: `establishments.rappi_commission`, `establishments.peya_commission` (porcentaje).
- Hook `useDeliverySettings()` expone `enabled` y `commissions` (`rappi`, `pedidosya`, `propio`).

## Modelo de datos
- `orders.channel` = `dine_in | delivery | takeaway`; `orders.table_id` es NULLABLE (delivery no ocupa mesa).
- `orders.external_platform` (`rappi | pedidosya | propio`), `external_order_id`, `customer_name`, `delivery_address` (jsonb con address/phone), `delivery_fee`, `platform_commission`.
- La comisión se calcula sobre el subtotal de productos (no sobre el envío) al crear el pedido y queda congelada en la orden.

## Flujo (modo manual, sin API)
`/cashier/delivery` (item "Delivery" en el sidebar de Caja, visible solo si el módulo está activo):
crear pedido → va a Cocina como cualquier comanda → preparación → listo → retirado → cerrar.
Los pedidos de delivery **no afectan el efectivo esperado en caja** (los cobra la plataforma) porque no generan `invoices` ni movimientos de caja.

## Analíticas
Pestaña "Canales" en `/admin/analytics` (`SalesChannelsTab.tsx`): venta bruta, comisión, ingreso neto y ticket promedio por canal.

## Integración API (infraestructura lista)
Pantalla `/admin/delivery` (`src/pages/admin/DeliverySettings.tsx`, item "Delivery" en el sidebar de Admin, visible solo con el módulo activo).
Pestañas: Conexión, Mapeo de menú, Cómo vincular.

- Tabla `delivery_integrations` (`establishment_id`, `platform` = `rappi | peya`, `environment`, `store_id`, `external_vendor_id`, `client_id`, `credentials` jsonb, `secret_last4`, `webhook_token`, `status`, `last_checked_at`, `last_error`). Sin acceso desde el cliente: solo `service_role`. El frontend lee metadatos con la RPC `get_delivery_integration_status(_establishment_id)`.
- Tabla `delivery_menu_mapping` (`platform`, `external_item_id`, `external_item_name`, `product_id`) editable por admin/cashier del establecimiento.
- Edge functions: `delivery-credentials` (guardar/reemplazar claves, genera webhook_token), `delivery-test-connection` (autentica contra Rappi/PedidosYa y actualiza status), `delivery-webhook` (`?token=<webhook_token>`, público, idempotente por `external_order_id`, crea la orden con `channel='delivery'` y comisión sobre subtotal; si hay ítems sin mapear responde 422 y los deja listados en el mapeo).
- Las claves nunca se devuelven al frontend: solo se muestran los últimos 4 caracteres.
- Falta únicamente el alta como POS partner en cada plataforma y ajustar los endpoints reales con credenciales sandbox.

# Credenciales de integración Rappi / PedidosYa

Objetivo: que el propio cliente (admin del restaurante) pueda pegar sus credenciales de Rappi y PedidosYa desde el sistema, y que la vinculación quede lista para activarse apenas tenga el alta como partner.

## Qué va a ver el usuario

**Admin → Configuración de Delivery** (visible solo si Super Admin activó el módulo Delivery):

- Una tarjeta por plataforma (Rappi y PedidosYa) con:
  - Estado de conexión: "Sin configurar" / "Credenciales cargadas" / "Conectada" / "Error".
  - Campos para pegar credenciales:
    - Rappi: Client ID, Client Secret, Store ID.
    - PedidosYa: Vendor ID, API Key / Client Secret.
  - Selector de ambiente: Sandbox / Producción.
  - Comisión % (heredada de lo que cargó Super Admin, editable solo por Super Admin).
  - Botón "Probar conexión" que valida las credenciales y muestra el resultado.
  - Botón "Copiar URL de webhook": la URL única del establecimiento que el cliente pega en el panel de la plataforma.
- Las credenciales guardadas nunca se vuelven a mostrar completas: se ve solo los últimos 4 caracteres y un botón "Reemplazar".

**Super Admin → Clientes** sigue igual (switch del módulo + comisiones), y además muestra si el cliente ya cargó credenciales de cada plataforma.

## Cómo se vincula (el paso a paso que verá el cliente)

Un panel de instrucciones dentro de la misma pantalla:
1. Pedir el alta como integración POS en Rappi / PedidosYa.
2. Copiar las credenciales que entrega la plataforma y pegarlas acá.
3. Copiar la URL de webhook de Datta y cargarla en el panel de la plataforma.
4. Presionar "Probar conexión".
5. Mapear el menú (pantalla de mapeo, ver abajo).

## Detalles técnicos

**Base de datos**
- Nueva tabla `delivery_integrations`: `establishment_id`, `platform` ('rappi' | 'peya'), `environment`, `store_id`, `external_vendor_id`, `client_id`, `credentials` (cifrado/no legible desde el cliente), `webhook_token`, `status`, `last_checked_at`, `last_error`.
- GRANTs + RLS: solo admin/superadmin del mismo establecimiento; los secretos nunca se exponen vía Data API — el frontend lee una vista/RPC que devuelve solo metadatos (estado, últimos 4 dígitos, ambiente).
- Nueva tabla `delivery_menu_mapping`: `establishment_id`, `platform`, `external_item_id`, `product_id`, para traducir el ítem de la plataforma a un producto de Datta.

**Edge functions**
- `delivery-credentials`: guarda/actualiza credenciales (única vía de escritura de secretos) y genera el `webhook_token`.
- `delivery-test-connection`: intenta autenticar contra la plataforma y actualiza `status` / `last_error`.
- `delivery-webhook`: endpoint público por token que recibe pedidos entrantes, los valida, mapea ítems y crea la orden con `channel='delivery'`, `external_platform` y `external_order_id` — reutilizando exactamente la lógica que ya usa la carga manual (comisión sobre subtotal, envío aparte, sin impacto en efectivo esperado). Idempotente por `external_order_id`.

**Frontend**
- Nueva página `src/pages/admin/DeliverySettings.tsx` + ruta protegida e ítem en el sidebar de Admin, condicionados por `useDeliverySettings`.
- Nueva pestaña "Mapeo de menú" dentro de esa página: lista de ítems externos detectados y selector de producto de Datta.
- La carga manual actual de pedidos en Caja se mantiene sin cambios como respaldo.

## Alcance de esta etapa

Se entrega toda la infraestructura (tablas, RLS, pantallas, webhook, prueba de conexión y mapeo). Las llamadas concretas de autenticación a cada plataforma quedan implementadas contra sus endpoints estándar, y se ajustan cuando haya un cliente real con credenciales de sandbox para probarlas de punta a punta.

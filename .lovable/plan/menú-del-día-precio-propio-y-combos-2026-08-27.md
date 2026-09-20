# Menú del día: precio propio y combos

## 1. Arreglar la carta desde Caja

La pantalla de Carta del usuario de caja tiene un formulario reducido: al tocar el lápiz solo aparecen nombre, descripción, precio, categoría y disponible. Le falta todo lo que sí tiene el admin.

Se agrega al formulario de caja:
- Switch **⭐ Menú del día**
- Precio promocional (**Precio del menú**) y su switch de activación
- Imagen del producto
- Badge **⭐ Menú del día** en la tarjeta del producto

Así caja y admin quedan iguales.

## 2. Varios platos en el menú del día

Ya se puede marcar más de un plato como menú del día (el cliente los ve todos en la sección "Menú del día"). Se suma:
- Un **precio de menú** por producto: se carga con el precio de carta por defecto y se puede editar. Si está activo, el cliente ve ese precio y el precio de carta tachado.
- La sección del cliente agrupa los ítems por tipo: **Platos**, **Postres**, **Bebidas** (según la categoría del producto), para que se pueda armar el menú con acompañamientos.

## 3. Combos (plato + postre + bebida con precio único)

Nueva sección **Combos del día** dentro de Carta (admin y caja):
- Crear un combo con nombre, descripción opcional, imagen opcional y **precio final editable**.
- Elegir los productos que lo componen, cada uno asignado a un grupo: **Plato**, **Postre** o **Bebida**. Se pueden cargar varias opciones por grupo (el cliente elige una de cada uno).
- El precio se propone automáticamente sumando los precios de carta de los productos elegidos y se puede sobreescribir con el precio que se quiera cobrar.
- Switch activo/inactivo para prenderlo o apagarlo por día.

En la carta del cliente los combos aparecen arriba, dentro de "Menú del día", como tarjetas con el precio único y el detalle de las opciones incluidas.

Al tomar el pedido (mozo y caja) se puede elegir un combo: se cargan los productos seleccionados como ítems del pedido, con el precio del combo aplicado al plato principal y los acompañamientos en $0, de modo que el total de la mesa sea exactamente el precio del combo y las analíticas sigan contando cada producto vendido.

## Detalles técnicos

- Base de datos: nuevas tablas `menu_combos` (establishment_id, name, description, image_url, price, is_active) y `menu_combo_items` (combo_id, product_id, group: `main`|`dessert`|`drink`, sort_order), con GRANTs, RLS por `establishment_id` (lectura pública para la carta del QR, escritura para admin/cashier del establecimiento).
- Frontend:
  - `src/pages/cashier/Menu.tsx`: agregar campos faltantes (daily special, promo_price/promo_active, imagen) replicando `src/pages/admin/Menu.tsx`.
  - Nuevo componente compartido `MenuCombosTab` usado como pestaña en `src/pages/admin/Menu.tsx` y `src/pages/cashier/Menu.tsx`.
  - `src/components/client/DailySpecials.tsx`: agrupar por tipo y renderizar combos.
  - `src/components/cashier/AddProductsDialog.tsx` y `src/components/waiter/OrderingView.tsx`: selector de combo que expande a ítems del pedido con el prorrateo descripto.

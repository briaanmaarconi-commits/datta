---
name: Menú del día y combos
description: Menú del día por producto con precio propio y combos (plato + postre + bebida) con precio único
type: feature
---

- Producto marcado con `is_daily_special` aparece en la sección "Menú del día" de la carta del cliente (agrupada en Platos / Postres / Bebidas según la categoría, ver `src/lib/menuGroups.ts`).
- Precio del menú por producto: `promo_active` + `promo_price`. Se propone con el precio de carta y es editable. El cliente ve el precio del menú y el de carta tachado.
- Combos: tablas `menu_combos` (nombre, descripción, imagen, precio final, activo) y `menu_combo_items` (producto + `item_group`: main/dessert/drink). Se gestionan desde la pestaña "Combos del día" en Carta, tanto en admin como en caja.
- Al tomar el pedido (mozo y caja) se elige un combo: se cargan los productos como ítems del pedido, con el precio del combo aplicado al plato principal y los acompañamientos en $0, para que el total sea el precio del combo y las analíticas cuenten cada producto.
- La pantalla de Carta de caja debe mantenerse igual a la de admin (menú del día, precio del menú, imagen, combos).
- Al guardar un producto activando "⭐ Menú del día" (admin y caja), aparece un aviso "¿Querés armar un combo con postre y/o bebida?" con acción "Armar combo": abre la pestaña Combos del día con el plato precargado.
- La pestaña Combos del día muestra cuántos platos/combos ve hoy el cliente y un botón "Ver carta del cliente" hacia `/carta/{establishmentId}`.

# Combos del día: creación guiada y verificación del QR

## Chequeo del QR general (hecho)

Probé la carta pública tal como la ve un cliente sin iniciar sesión (con la clave pública, sobre BODEGON 65):

- Productos y categorías: se leen bien sin login.
- Combos (`menu_combos` + sus ítems): las reglas de acceso permiten lectura pública de los combos activos y sus productos.
- Resultado de la consulta: hoy BODEGON 65 **no tiene ningún producto marcado como Menú del día ni ningún combo cargado**, por eso el bloque "Menú del día" no aparece en el QR.

Conclusión: el circuito funciona; falta cargar el contenido. Igual queda un punto a mejorar: no hay forma de comprobarlo desde el sistema sin escanear el QR.

## 1. Crear combos de forma guiada (opción sugerida por vos)

Cuando en Carta (admin o caja) se guarda un producto con el switch **⭐ Menú del día** activado, aparece un aviso:

"Sumaste **{plato}** al menú del día. ¿Querés armar un combo con postre y/o bebida?" con dos botones: **Armar combo** y **Ahora no**.

Al elegir "Armar combo" se abre el formulario de combo ya precargado:
- El plato recién marcado queda como **Plato**.
- Se eligen postre y bebida desde un buscador (opcionales, se pueden cargar varias opciones).
- El precio se propone sumando los precios de carta y se puede editar para poner el precio del menú.
- Se guarda activo por defecto.

## 2. Botón directo (la otra opción, también incluida)

En la pestaña **Combos del día** se mantiene el botón **Nuevo combo** para armar uno desde cero, sin pasar por un producto.

## 3. Ver el resultado antes de imprimir el QR

En la pestaña Combos del día se agrega un botón **Ver carta del cliente**, que abre en otra pestaña la carta pública del establecimiento, para confirmar que el "Menú del día" y los combos se ven como corresponde.

Además, si hay combos activos pero ningún producto marcado como menú del día (o al revés), se muestra un aviso en la pantalla de Carta indicando qué está viendo hoy el cliente.

## Detalles técnicos

- `src/pages/admin/Menu.tsx` y `src/pages/cashier/Menu.tsx`: al guardar un producto con `is_daily_special` recién activado, disparar el prompt y abrir `MenuCombosTab` en modo "nuevo combo" con la línea precargada.
- `src/components/menu/MenuCombosTab.tsx`: aceptar props `initialLines` / `openSignal` para abrir el diálogo prellenado; agregar el botón "Ver carta del cliente" hacia `/carta/{establishmentId}` y el resumen de estado del menú del día.
- No se tocan la base de datos ni las reglas de acceso: `menu_combos` y `menu_combo_items` ya tienen lectura pública de combos activos, verificada contra la API.

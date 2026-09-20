# Arreglar la impresión de la pre-cuenta

## Qué está pasando

En la pantalla de Mesas de caja pueden quedar montados dos tickets imprimibles a la vez:

- La pre-cuenta (`PreBillTicket`) mientras el diálogo está abierto.
- El ticket de cierre (`CloseTicket`, que ya son dos copias: cliente + control) que queda guardado en pantalla después de cerrar la última mesa.

Los estilos de impresión ponen todo elemento `.print-ticket` en `position: absolute; left:0; top:0`, así que los dos se superponen en la misma hoja y salen páginas encimadas o en blanco, además de mandar más tickets de los que corresponden.

## Qué se corrige

1. Al imprimir, mandar a la impresora **solo** el ticket que se pidió:
   - Si se abre la pre-cuenta y se toca "Imprimir pre-cuenta", sale únicamente la pre-cuenta (1 ticket, con todos los productos, cantidades, subtotales y total).
   - Al cerrar la mesa, siguen saliendo las dos copias (CLIENTE + CONTROL) como hasta ahora.
2. La pre-cuenta vuelve a mostrar todo el detalle: nombre del local, mesa, fecha/hora, lista completa de ítems (incluidos los agregados manuales marcados con `*`) y el total.

## Detalle técnico

- `PreBillTicket` pasa a renderizarse por portal en `document.body` con la clase `print-portal print-ticket` (el mismo patrón que ya usa `KitchenTicket`), y solo se monta cuando se dispara la impresión de pre-cuenta.
- `CloseTicket` usa el mismo patrón de portal, de modo que nunca coexisten dos `.print-ticket` en el flujo del documento.
- Se agrega una clase de cuerpo por tipo de impresión (`printing-prebill` / `printing-close`) y en `src/index.css` se muestra solo el portal correspondiente, ocultando `#root` durante el trabajo de impresión.
- Se limpia la clase del body con `afterprint` (o timeout de respaldo) para que la pantalla vuelva a la normalidad.
- Sin cambios en base de datos ni en la lógica de cierre de mesa.

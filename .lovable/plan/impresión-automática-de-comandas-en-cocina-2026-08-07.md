# Impresión automática de comandas en cocina

## Cómo funciona con dos impresoras

El navegador no puede elegir la impresora desde el código: siempre usa la impresora predeterminada del equipo donde se imprime. Por eso el esquema correcto es:

- PC de caja: impresora de caja como predeterminada. Imprime tickets de mesa y cierre de turno (ya funciona hoy).
- PC de cocina: impresora de cocina como predeterminada, con la pantalla de Cocina abierta. Ahí se imprime la comanda automáticamente cuando llega un pedido.

Para que no aparezca el diálogo de impresión en cocina, Chrome debe abrirse con la opción de impresión silenciosa (`--kiosk-printing`). Dejo las instrucciones dentro de la pantalla de Cocina.

## Qué se construye

1. Comanda de cocina (80mm), diseño sobrio y de letra grande:
   - Nombre del local, "COMANDA", número de mesa y sector.
   - Hora del pedido y mozo que lo tomó.
   - Lista de productos: cantidad + nombre en grande, notas del ítem debajo.
   - Marca "AGREGADO" cuando el pedido es un agregado a una mesa ya abierta.
   - Pie con línea de corte.

2. Impresión automática en la pantalla de Cocina:
   - Al detectar un pedido nuevo (el mismo evento que hoy dispara la campana), se arma la comanda y se dispara la impresión.
   - Cada pedido se imprime una sola vez: se guarda el registro de impresos en el navegador de esa PC, así un refresco de la página no reimprime todo.
   - Si llegan varios pedidos juntos, se imprimen uno detrás del otro en secuencia.

3. Controles en la pantalla de Cocina:
   - Interruptor "Impresión automática" (queda guardado en esa PC, apagado por defecto para no molestar en tablets de cocina).
   - Botón "Imprimir comanda" en cada tarjeta de pedido, para reimprimir a mano.
   - Nota de ayuda con el paso a paso para configurar la impresora y la impresión sin diálogo.

## Detalles técnicos

- Nuevo componente `src/components/kitchen/KitchenTicket.tsx` con el cuerpo de la comanda y un contenedor `hidden print:block print-ticket`.
- `src/pages/kitchen/Orders.tsx`: cola de impresión con `useRef`, set de IDs ya impresos persistido en `localStorage` por establecimiento, e interruptor de auto-impresión también en `localStorage`.
- Se monta un único nodo imprimible a la vez y se llama a `window.print()`; entre comandas se espera a que termine el ciclo (`afterprint` o timeout) antes de la siguiente.
- Se reutilizan los estilos de impresión existentes en `src/index.css` (`.print-ticket`, 80mm) sin tocar el flujo de caja.
- Sin cambios de base de datos.

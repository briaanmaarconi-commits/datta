# Restaurant Olavarría — Comandas por sector de preparación

Local: RESTAURANT OLAVARRIA (`018b04a8-18d9-49f7-86f8-b30be9307dd7`). Dueña: Silvia.

## Flujo pedido

1. **Mozo** toma el pedido en su dispositivo (rol `waiter`) → Datta lo guarda como ítems de la mesa.
2. **PC Cocina** (rol `kitchen`, pantalla `/kitchen`) recibe el pedido en tiempo real y lo **reparte por sector**:
   - Entrada → Impresora 1
   - Plato principal → Impresora 2
   - Postre → Impresora 3
3. El mozo vuelve a la mesa y agrega "bocha de helado" → sale **solo lo nuevo** (marcado AGREGADO) en la impresora 3.
4. **PC Caja** (rol `cashier`) ve la mesa con TODOS los pedidos acumulados y cierra/cobra una sola vez.

Ejemplo: empanada + papas (entrada) y tira de asado (principal) en un pedido → 2 comandas (imp. 1 e imp. 2). Después helado → 1 comanda en imp. 3. Caja ve 4 ítems en una cuenta.

## Lo que ya existe y se reutiliza

- Comanda 80 mm (`KitchenTicket.tsx`), impresión automática y control de "ya impreso" en `src/pages/kitchen/Orders.tsx`.
- Agregados a una mesa abierta se detectan y se imprimen solos (solo ítems nuevos).
- Cierre de mesa de caja con todas las órdenes de la mesa.

## Lo que falta (y por qué)

1. **Sector de preparación por producto.** Hoy `categories`/`products` no tienen ese dato. Propuesta: campo `prep_area` (`entrada | principal | postre`) en `categories`, con override opcional en `products`. Con eso Silvia solo marca 3 categorías y listo.
2. **Impresoras por sector.** Limitación técnica: el navegador solo imprime en la impresora predeterminada de la PC, no puede elegir entre 3. Opciones:
   - **A (recomendada): agente de impresión local** en la PC de cocina (programa chico en Windows). Datta le manda cada comanda con el nombre del sector y el agente la envía a la impresora 1/2/3 (USB por nombre de Windows, o red por IP:9100). Configurable en una pantalla "Impresoras → sector".
   - B: QZ Tray (software de terceros que hace lo mismo), menos desarrollo propio pero con aviso de certificado.
   - C: sin agente, 3 PCs/tablets (una por sector) cada una con su impresora predeterminada. Funciona hoy, pero requiere 2 equipos más.
3. **Una comanda por sector**: `Orders.tsx` agrupa los ítems nuevos por `prep_area` y emite un ticket por grupo, con encabezado del sector, mesa, mozo y hora.
4. **Fallback**: producto sin sector → impresora de Principal (o la que se marque por defecto) + aviso en cocina para que no se pierda ningún ítem.
5. **Reimpresión** por sector y alerta visible si una impresora no responde (no depender de que "salió").

## Datos a cargar en el local

- Usuarios: admin Silvia, 1 `kitchen`, 1+ `cashier`, mozos `waiter`.
- Categorías: Entradas, Platos principales, Postres (con su `prep_area`) y la carta.
- Mesas / sectores de salón y plano.

## Fases

| Fase | Entrega |
|---|---|
| 1 | Crear usuarios y roles de Olavarría; cargar categorías, carta y mesas |
| 2 | Migración `prep_area` + pantalla para asignarlo en Carta |
| 3 | Comandas separadas por sector en la PC de cocina (con la impresora predeterminada, ya probable) |
| 4 | Agente de impresión local y mapeo sector → impresora |
| 5 | Prueba en el local con las 3 comanderas y la caja |

## Datos que faltan

- Marca/modelo de las 3 comanderas y cómo se conectan (USB o red/LAN).
- ¿Windows en la PC de cocina? ¿Ancho de papel (80 o 58 mm)?
- ¿La pantalla de cocina debe mostrar todo junto o filtrar por sector?
- Emails de Silvia, cocina, cajera y cantidad de mozos.

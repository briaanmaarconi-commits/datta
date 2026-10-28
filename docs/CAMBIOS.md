# Registro de cambios de Datta

Lo más nuevo arriba. Una línea por cambio, en palabras simples. "Publicado" = ya está en dattagestion.com.
Contexto general del sistema: [CONTEXTO-PROYECTO.md](CONTEXTO-PROYECTO.md).

## 2026-10-27
- Presentación comercial: dattagestion.com/presentacion (la dirección del QR de stickers y tarjetas) ahora muestra la nueva web con recorrido en 3D: pedido, comanda, comprobantes, cocina y analíticas. La presentación anterior quedó en dattagestion.com/presentacion-anterior. Publicado.
- Presentación nueva: en pantallas medianas (tablet) las capturas del sistema ya no tapan el título de "Los números". Publicado.

## 2026-10-26
- Carta digital (QR): se sacaron las fotos de "Los más pedidos" y "Postres favoritos", que no hacían nada al tocarlas. Ahora hay botones "Ver los más pedidos", "Ver postres más pedidos" y "Ver promociones" que muestran esos platos. El QR no cambia. Publicado.
- Presentación comercial: se reemplazó el ejemplo de punto de equilibrio por un texto corto.

## 2026-10-25
- Personal: caja y administrador pueden editar nombre y contraseña de mozos y cocina.
- Cobro: un pedido no se puede cobrar dos veces.

## 2026-10-24
- Superadmin: ficha de cada cliente con datos, usuarios, suscripción y pagos.
- Turnos: solo puede haber un turno abierto por local.

## 2026-10-23
- Turnos: abrir y cerrar se ve al instante.
- Bebidas: se venden por caja, avisos al mozo, modo de stock para bebidas y tragos.

## 2026-10-19
- Analíticas y caja cargan más rápido.
- Admin: la lista de mesas a veces quedaba vacía 1 minuto; arreglado.

## 2026-10-17
- Turnos: la hora de apertura/cierre la pone el servidor (no la PC de caja); un error de conexión ya no se muestra como "no hay turno abierto".
- Movimientos guardados con fecha de Argentina.
- Caja: el botón "Cerrar mesa" ya no queda sin responder.

## 2026-10-16
- Recibo con número grande y visible.
- Pago combinado: el mozo anota cómo paga la mesa y la caja cobra con varios medios.
- Comanda de delivery imprime la dirección de entrega.

## 2026-10-15
- Platos del día cargados por mozos y caja desde la pantalla de pedidos.
- Caja: factura electrónica al cerrar la mesa y facturación de varios pedidos juntos.
- Cerrar mesa a cuenta corriente: la caja elige la empresa y carga el vale.
- Comandas: una por sector (fiambrería, principal, postre, bebida), automáticas y sin duplicar, también con una sola impresora.
- Mozo en celular: sin zoom al tocar campos y plano de mesas táctil.
- Plano de fin de semana/feriado para Restaurant Olavarría.

## 2026-10-14
- Cuentas corrientes de empresas: empresas, vales, cobros; la caja puede dar de alta empresas.
- Agente de impresión instalable para la PC de cocina; impresoras por sector.

## 2026-10-13
- Botón de soporte remoto (AnyDesk) en los paneles del restaurante.
- Analíticas: "Comparar períodos" corregido.

## 2026-10-07 al 2026-10-10
- Cocina: no se duplican comandas con varias pantallas abiertas.
- Ayuda: asistente de soporte que deriva a Inconvenientes.
- Historial: el dueño ve todos los movimientos y los borrados aparte.
- Superadmin: posibles clientes y agenda de visitas; restaurante demo; ver en vivo cualquier local; eliminar clientes con copia de seguridad.
- Costos y gastos, stock en dos modos (simple y por ingredientes) y mermas.
- Delivery propio, plano de mesas, rango de días en analíticas, impresoras.
- Inconvenientes, suscripción del local y facturación de Datta.

## 2026-10-05 y 2026-10-06
- Paso de Lovable/Supabase a backend propio (Postgres + Fastify) con todas sus funciones: carta pública por QR, AFIP, IA (Gemini/Claude), cobranzas, reportes.
- Página de presentación comercial (/presentacion).

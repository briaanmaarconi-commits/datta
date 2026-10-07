export type SectionHelp = {
  title: string;
  what: string;
  bullets: string[];
  note?: string;
};

/**
 * Textos de ayuda por sección. La clave es la ruta.
 * Se resuelve primero por coincidencia exacta y luego por el prefijo más largo.
 */
export const SECTION_HELP: Record<string, SectionHelp> = {
  // ---------------- Administración ----------------
  '/admin': {
    title: 'Dashboard',
    what: 'Resumen del día: ventas, pedidos, ticket promedio y mesas en uso.',
    bullets: [
      'Mirá cómo viene la jornada de un vistazo.',
      'Detectá si hay muchas mesas ocupadas o pocas ventas.',
      'Usá el asistente para preguntar sobre tus números.',
    ],
    note: 'Los datos son del día en curso, con horario de Argentina.',
  },
  '/admin/menu': {
    title: 'Menú',
    what: 'Acá se arma la carta: categorías, platos, precios, fotos y promociones.',
    bullets: [
      'Creá o editá categorías y productos con foto y descripción.',
      'Marcá platos como Menú del día y armá combos con precio especial.',
      'Activá o desactivá un producto cuando no hay stock.',
      'Generá los códigos QR de la carta.',
    ],
    note: 'Todo lo que publiques acá se ve al instante en la carta del QR.',
  },
  '/admin/tables': {
    title: 'Mesas y sectores',
    what: 'Definí los sectores del salón y ubicá las mesas en el plano.',
    bullets: [
      'Creá sectores (adentro, vereda, barra) y agregá mesas.',
      'Arrastrá las mesas para armar el plano real del local.',
      'Cada mesa se pinta según su estado en tiempo real.',
    ],
    note: 'Verde libre, amarillo en preparación, azul listo para entregar, rojo ocupada.',
  },
  '/admin/reservations': {
    title: 'Reservas',
    what: 'Agenda de reservas por día, con datos del cliente y cantidad de personas.',
    bullets: [
      'Cargá una reserva con nombre, teléfono, horario y personas.',
      'Marcá si llegó, no vino o se canceló.',
      'Al marcar que llegó, la mesa queda ocupada automáticamente.',
    ],
  },
  '/admin/staff': {
    title: 'Personal',
    what: 'Usuarios del sistema: mozos, caja, cocina y administración.',
    bullets: [
      'Creá usuarios y asignales su rol.',
      'Restablecé la contraseña cuando alguien la olvida.',
      'Desactivá el acceso de quien ya no trabaja en el local.',
    ],
    note: 'Cada rol ve solo las pantallas que necesita para su tarea.',
  },
  '/admin/monitor': {
    title: 'Monitoreo',
    what: 'Vista en vivo del salón y de los pedidos en curso.',
    bullets: [
      'Seguí qué mesas están libres, en preparación o ocupadas.',
      'Detectá pedidos demorados en cocina.',
      'Se actualiza solo, sin recargar la página.',
    ],
  },
  '/admin/analytics': {
    title: 'Analíticas',
    what: 'Historial de ventas para entender qué funciona y qué no.',
    bullets: [
      'Comparás dos meses o dos períodos entre sí.',
      'Ves los platos y las bebidas más y menos pedidos.',
      'Analizás horarios, días fuertes y ticket promedio.',
    ],
    note: 'Las propinas no se incluyen: no son venta ni ganancia del local.',
  },
  '/admin/cash': {
    title: 'Caja',
    what: 'Control del efectivo: apertura, movimientos, arqueo y cierre de turno.',
    bullets: [
      'Registrá ingresos y salidas de caja con su forma de pago.',
      'Al cerrar, compará el efectivo contado con el esperado.',
      'Consultá turnos anteriores y su reporte imprimible.',
    ],
    note: 'No se puede cerrar el turno si quedan mesas abiertas.',
  },
  '/admin/billing': {
    title: 'Facturación',
    what: 'Emisión de comprobantes fiscales ante ARCA y consulta de lo ya facturado.',
    bullets: [
      'Facturá una mesa, varias juntas en una sola factura, o de forma manual.',
      'Filtrá por fecha para facturar días anteriores.',
      'Imprimí el ticket o descargá el PDF cuando quieras.',
    ],
    note: 'ARCA permite hasta 10 días atrás y la fecha no puede ser anterior al último comprobante emitido.',
  },
  '/admin/costs': {
    title: 'Precios y márgenes',
    what: 'Calculás el precio de venta a partir del costo y el margen, o el margen a partir del precio.',
    bullets: [
      'Cargá el costo de cada producto, agrupado por categoría.',
      'Definí el margen y mirá el precio final que resulta.',
      'Aplicá ajustes masivos cuando suben los costos.',
    ],
    note: 'Cargar costos acá no genera movimientos de caja: es solo para calcular.',
  },
  '/admin/stock': {
    title: 'Stock',
    what: 'Control del inventario en uno de dos modos: simple (por porciones o unidades) o avanzado (por ingredientes).',
    bullets: [
      'Simple: cargás cuántas porciones o unidades tenés y cada venta descuenta 1.',
      'Avanzado: cargás ingredientes y recetas; cada venta descuenta lo que lleva el plato.',
      'Bebidas, postres o empanadas se cuentan por unidad en los dos modos.',
      'Registrá las mermas con su motivo para ver cuánta plata se pierde por mes.',
    ],
    note: 'El stock se descuenta solo cuando se cobra el pedido (mesa, delivery o caja).',
  },
  '/admin/audit': {
    title: 'Historial',
    what: 'Registro de quién hizo cada cambio y cuándo.',
    bullets: [
      'Revisá cambios de precios, productos y usuarios.',
      'Usalo para aclarar diferencias o errores de carga.',
    ],
  },
  '/admin/delivery': {
    title: 'Delivery',
    what: 'Configuración de los pedidos de delivery y su integración con plataformas.',
    bullets: [
      'Activá o desactivá el módulo de delivery.',
      'Cargá las credenciales de la plataforma y probá la conexión.',
      'Los pedidos entran a cocina como comanda de delivery.',
    ],
  },
  '/admin/impresoras': {
    title: 'Impresoras',
    what: 'Configuración guiada de la impresora de cada computadora del local.',
    bullets: [
      'Datta imprime en la impresora predeterminada de Windows de cada PC.',
      'Seguí los pasos en cada computadora que imprime: qué imprime, papel, prueba y acceso directo.',
      'El acceso directo hace que los tickets salgan solos, sin el cuadro de impresión.',
    ],
  },
  '/admin/delivery-propio': {
    title: 'Delivery propio',
    what: 'Pedidos por teléfono con tu propio repartidor. Van a cocina y se cobran como una mesa.',
    bullets: [
      'Escribí primero el teléfono: si el cliente ya pidió, sus datos se completan solos.',
      'Si es departamento, cargá piso y depto. Anotá con cuánto paga para llevar el vuelto.',
      'Al volver el repartidor, tocá "Entregado y cobrado": entra a la caja y descuenta stock.',
      'En Clientes ves a quién le podés mandar promociones por WhatsApp y exportás la lista.',
    ],
  },
  '/admin/suscripcion': {
    title: 'Suscripción',
    what: 'Tu plan de Datta: estado, próximo vencimiento, monto, pagos y facturas.',
    bullets: [
      'Mirá cuándo vence el servicio y cuánto tenés que pagar.',
      'Descargá en PDF las facturas que te emitió Datta.',
      'Si tenés un link de pago, podés pagar desde acá con Mercado Pago.',
    ],
  },
  '/admin/inconvenientes': {
    title: 'Inconvenientes',
    what: 'Reportá al equipo de Datta cualquier problema con el sistema y seguí la respuesta.',
    bullets: [
      'Tocá "Nuevo inconveniente", poné un título y explicá en detalle qué pasó.',
      'Cuando Datta responde, el inconveniente se marca con un punto y lo ves en la barra lateral.',
      'Podés seguir la conversación agregando información.',
    ],
  },

  // ---------------- Caja ----------------
  '/cashier': {
    title: 'Mesas',
    what: 'Pantalla principal de caja: abrir mesas, cobrar y cerrar.',
    bullets: [
      'Agregá o quitá productos antes de cobrar.',
      'Imprimí la pre-cuenta y después el ticket de cierre.',
      'El color de cada mesa muestra su estado real.',
    ],
    note: 'Al cerrar salen dos tickets: uno para el cliente y otro de control.',
  },
  '/cashier/reservations': {
    title: 'Reservas',
    what: 'Agenda del día para recibir a los clientes que reservaron.',
    bullets: [
      'Cargá reservas nuevas por teléfono.',
      'Marcá si llegó, no vino o canceló.',
      'Al marcar que llegó, la mesa queda ocupada.',
    ],
  },
  '/cashier/monitor': {
    title: 'Monitoreo',
    what: 'Estado del salón y de los pedidos en curso, en vivo.',
    bullets: [
      'Mirá qué mesas están en preparación o listas para entregar.',
      'Detectá demoras antes de que el cliente reclame.',
    ],
  },
  '/cashier/invoices': {
    title: 'Facturación',
    what: 'Emisión de comprobantes fiscales y consulta de los ya emitidos.',
    bullets: [
      'Facturá mesas cerradas o usá el facturador manual.',
      'Al cargar el CUIT se completa sola la razón social.',
      'Reimprimí o descargá el PDF cuando lo necesites.',
    ],
    note: 'La factura manual no toca la caja ni las finanzas.',
  },
  '/cashier/expenses': {
    title: 'Salidas e Ingresos',
    what: 'Movimientos de dinero del turno, con gráfico de gastos de mayor a menor.',
    bullets: [
      'Cargá gastos e ingresos con su categoría y forma de pago.',
      'Podés escribir importes con coma, por ejemplo 1350,25.',
      'Leé una factura de compra con foto o PDF y se carga sola.',
    ],
    note: 'Las compras de mercadería quedan registradas pero no bajan el efectivo esperado del cajón.',
  },
  '/cashier/shift': {
    title: 'Resumen de turno',
    what: 'Cierre del turno con arqueo y reporte imprimible.',
    bullets: [
      'Contá el efectivo y comparalo con el esperado.',
      'Mirá sobrante o faltante y las ventas por forma de pago.',
      'Imprimí el reporte del turno al cerrar.',
    ],
    note: 'Cerrar el turno no factura nada: la facturación es aparte.',
  },
  '/cashier/menu': {
    title: 'Carta',
    what: 'Alta y edición de productos, precios, menú del día y combos.',
    bullets: [
      'Cambiá un precio o desactivá un plato que se terminó.',
      'Marcá platos del menú del día y armá combos.',
    ],
    note: 'Los cambios se ven al instante en la carta del QR.',
  },
  '/cashier/tables-config': {
    title: 'Mesas y sectores',
    what: 'Armado del plano del salón: sectores y ubicación de las mesas.',
    bullets: [
      'Agregá o quitá mesas y movelas en el plano.',
      'Cada mesa se pinta según su estado en vivo.',
    ],
  },
  '/cashier/staff': {
    title: 'Personal',
    what: 'Usuarios del local y sus accesos.',
    bullets: [
      'Creá mozos y usuarios de cocina.',
      'Restablecé contraseñas cuando alguien la olvida.',
    ],
  },
  '/cashier/cash': {
    title: 'Caja',
    what: 'Apertura, movimientos de caja y control del efectivo.',
    bullets: [
      'Registrá entradas y salidas del cajón.',
      'Revisá el detalle de cada movimiento del turno.',
    ],
    note: 'Las propinas entran y salen a la vez: no cambian el balance.',
  },
  '/cashier/costs': {
    title: 'Precios y márgenes',
    what: 'Calculás precio de venta según costo y margen, por categoría.',
    bullets: [
      'Cargá costos y definí el margen deseado.',
      'Mirá el precio final o el margen resultante.',
    ],
    note: 'No genera movimientos de caja: es solo cálculo.',
  },
  '/cashier/stock': {
    title: 'Stock',
    what: 'Inventario del local (simple por porciones o avanzado por ingredientes).',
    bullets: [
      'Sumá stock cuando entra mercadería y hacé el conteo físico cada tanto.',
      'Registrá las mermas con su motivo.',
      'Se descuenta solo cuando se cobra el pedido.',
    ],
  },
  '/cashier/audit': {
    title: 'Auditoría',
    what: 'Historial de cambios hechos en el sistema.',
    bullets: [
      'Revisá quién cambió un precio o un producto.',
      'Sirve para aclarar diferencias.',
    ],
  },
  '/cashier/delivery': {
    title: 'Delivery',
    what: 'Pedidos de delivery que entran al local.',
    bullets: [
      'Cargá pedidos y mandalos a cocina.',
      'Se imprimen como comanda de delivery.',
    ],
  },
  '/cashier/impresoras': {
    title: 'Impresoras',
    what: 'Configuración guiada de la impresora de esta computadora.',
    bullets: [
      'Seguí los pasos: qué imprime, papel, prueba y acceso directo.',
      'El acceso directo hace que los tickets salgan solos, sin el cuadro de impresión.',
    ],
  },
  '/cashier/delivery-propio': {
    title: 'Delivery propio',
    what: 'Pedidos por teléfono: van a cocina y se cobran como una mesa.',
    bullets: [
      'Escribí primero el teléfono: si el cliente ya pidió, sus datos se completan solos.',
      'Al volver el repartidor, tocá "Entregado y cobrado".',
    ],
  },
  '/cashier/suscripcion': {
    title: 'Suscripción',
    what: 'El plan de Datta del local: vencimiento, monto, pagos y facturas.',
    bullets: [
      'Mirá cuándo vence el servicio y cuánto hay que pagar.',
      'Descargá en PDF las facturas de Datta.',
    ],
  },
  '/cashier/inconvenientes': {
    title: 'Inconvenientes',
    what: 'Reportá al equipo de Datta cualquier problema con el sistema.',
    bullets: [
      'Poné un título y explicá en detalle qué pasó.',
      'Las respuestas de Datta aparecen acá.',
    ],
  },

  // ---------------- Mozo ----------------
  '/waiter': {
    title: 'Mis Mesas',
    what: 'Tus mesas asignadas y su estado, en vivo.',
    bullets: [
      'Abrí una mesa y tomá el pedido.',
      'Mirá el color para saber si el pedido está en cocina o listo.',
    ],
    note: 'Verde libre, amarillo en preparación, azul listo para entregar, rojo ocupada.',
  },
  '/waiter/orders': {
    title: 'Pedidos',
    what: 'Pedidos en curso de tus mesas.',
    bullets: [
      'Agregá productos a un pedido ya abierto.',
      'Marcá lo entregado y avisá cuando la mesa pide la cuenta.',
    ],
  },
  '/waiter/reservations': {
    title: 'Reservas',
    what: 'Reservas del día para recibir a los clientes.',
    bullets: [
      'Cargá una reserva nueva desde el celular.',
      'Marcá si llegó, no vino o canceló.',
      'Al marcar que llegó, la mesa queda ocupada con la cantidad de personas.',
    ],
  },
};

/** Resuelve la ayuda de una ruta: exacta y si no, el prefijo más largo. */
export function getSectionHelp(pathname: string): SectionHelp | null {
  if (SECTION_HELP[pathname]) return SECTION_HELP[pathname];

  let best: string | null = null;
  for (const key of Object.keys(SECTION_HELP)) {
    if (pathname === key || pathname.startsWith(key + '/')) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ? SECTION_HELP[best] : null;
}

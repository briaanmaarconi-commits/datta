# Dos tickets al cerrar la mesa (cliente + control)

Cuando caja cierra una mesa, se imprimen automáticamente **dos tickets iguales** en la comandera de 80mm, en una sola impresión (uno tras otro, con corte entre ambos):

- **COPIA CLIENTE** — la que se entrega en la mesa.
- **COPIA CONTROL** — la que queda archivada en caja.

## Cómo funciona

1. El cajero cierra la mesa como siempre (medio de pago, propina, ajustes).
2. Apenas se registra el cierre, se abre solo el diálogo de impresión con las dos copias listas.
3. Si la impresión falla o se traba el papel, queda un botón **"Reimprimir ticket"** en el diálogo de la mesa cerrada / desde Facturación, y sale marcado como REIMPRESIÓN.

## Contenido de cada ticket

```text
        BODEGON 65
      COPIA CLIENTE
--------------------------------
 Mesa 7          Ticket #1042
 07/08/2026 20:35
--------------------------------
 Milanesa napolitana  2   $9.000
 Papas fritas         1   $2.500
--------------------------------
 TOTAL                   $11.500
 Propina                  $1.000
 Pago: Efectivo
 Recibido $15.000  Vuelto $2.500
--------------------------------
   Documento no fiscal
```

La segunda copia es idéntica salvo el encabezado **COPIA CONTROL** y una línea para firma/observaciones.

## Detalles técnicos

- Nuevo componente `src/components/cashier/CloseTicket.tsx`: recibe mesa, ítems (incluye ajustes manuales), total, propina, medio de pago, recibido/vuelto, número de ticket y una prop `copy: 'cliente' | 'control'`; renderiza el bloque `print-ticket` con las reglas 80mm ya existentes en `src/index.css`.
- Nuevo contenedor que renderiza las dos copias en el mismo bloque de impresión, separadas por `break-after: page` para forzar el corte entre tickets.
- `src/pages/cashier/Tables.tsx`: en `onSuccess` de `closeAllOrders`, guardar el snapshot del cierre en estado y disparar `window.print()` con las dos copias montadas; hoy la mutación ya arma `itemsSnapshot` e inserta en `invoices`, se reutiliza esa data. Para tener el número de ticket, el insert pasa a usar `.select('invoice_number').single()`.
- Botón "Reimprimir" desde `src/pages/cashier/Invoices.tsx` reutilizando el mismo componente.
- Para que no aparezca el diálogo de Chrome en cada cierre, se usa el acceso directo con `--kiosk-printing` en la PC de caja.
- Sin cambios de base de datos.

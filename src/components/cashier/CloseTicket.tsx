import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface CloseTicketItem {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  manual?: boolean;
}

export interface CloseTicketData {
  tableNumber: number;
  invoiceNumber?: number | null;
  items: CloseTicketItem[];
  total: number;
  tipAmount?: number;
  paymentMethod: string;
  amountPaid?: number;
  changeAmount?: number;
  createdAt?: string;
  establishmentName?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

function TicketCopy({
  data,
  copy,
  reprint,
  pageBreak,
}: {
  data: CloseTicketData;
  copy: 'cliente' | 'control';
  reprint?: boolean;
  pageBreak?: boolean;
}) {
  const ts = data.createdAt || new Date().toISOString();
  const isCash = data.paymentMethod === 'cash';

  return (
    <div style={pageBreak ? { breakAfter: 'page', pageBreakAfter: 'always' } : undefined}>
      <div className="text-center mb-2">
        <p className="font-bold text-base">{data.establishmentName || 'Establecimiento'}</p>
        <p className="font-bold text-sm border-y border-dashed border-foreground py-0.5 my-1">
          {copy === 'cliente' ? 'COPIA CLIENTE' : 'COPIA CONTROL'}
        </p>
        {reprint && <p className="text-xs font-bold">*** REIMPRESIÓN ***</p>}
        <p className="text-xs">
          Mesa {data.tableNumber}
          {data.invoiceNumber ? `   Ticket #${data.invoiceNumber}` : ''}
        </p>
        <p className="text-xs">{format(new Date(ts), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
      </div>

      <div className="border-t border-dashed border-foreground my-1" />

      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left">Prod.</th>
            <th className="text-center">Cant.</th>
            <th className="text-right">Subt.</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td className="text-left">{item.name}{item.manual ? ' *' : ''}</td>
              <td className="text-center">{item.qty}</td>
              <td className="text-right">${item.subtotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-foreground my-1" />

      <div className="text-xs space-y-0.5">
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>${data.total.toFixed(2)}</span>
        </div>
        {data.tipAmount && data.tipAmount > 0 ? (
          <div className="flex justify-between">
            <span>Propina</span>
            <span>${data.tipAmount.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>Pago</span>
          <span>{PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}</span>
        </div>
        {isCash && (
          <>
            <div className="flex justify-between">
              <span>Recibido</span>
              <span>${(data.amountPaid ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vuelto</span>
              <span>${(data.changeAmount ?? 0).toFixed(2)}</span>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-dashed border-foreground my-2" />
      {copy === 'cliente' ? (
        <p className="text-center text-[10px]">¡Gracias por su visita!</p>
      ) : (
        <>
          <p className="text-center text-[10px]">Copia de control interno</p>
          <p className="text-[10px] mt-3">Firma: ______________________</p>
          <p className="text-[10px] mt-1">Obs.: _______________________</p>
        </>
      )}
      <p className="text-center text-[10px] mt-1">*** DOCUMENTO NO FISCAL ***</p>
      {data.items.some(i => i.manual) && (
        <p className="text-center text-[10px] mt-1">* Ítem agregado manualmente</p>
      )}
    </div>
  );
}

/**
 * Print-only area: renders both copies (cliente + control) in a single print job.
 * Rendered through a portal on <body> so it never coexists with another
 * `.print-ticket` node (e.g. the pre-bill) in the same print job.
 */
export default function CloseTicket({ data, reprint }: { data: CloseTicketData; reprint?: boolean }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="print-portal print-ticket">
      <TicketCopy data={data} copy="cliente" reprint={reprint} pageBreak />
      <TicketCopy data={data} copy="control" reprint={reprint} />
    </div>,
    document.body
  );
}

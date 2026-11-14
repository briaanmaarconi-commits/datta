import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PAYMENT_LABELS, type PaymentPart } from '@/lib/payments';
import { printTicketPortal } from '@/lib/print';

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
  /** Detalle del pago combinado (paymentMethod = 'mixed'). */
  payments?: PaymentPart[];
  amountPaid?: number;
  changeAmount?: number;
  createdAt?: string;
  establishmentName?: string;
}


function TicketCopy({
  data,
  copy,
  reprint,
}: {
  data: CloseTicketData;
  copy: 'cliente' | 'control';
  reprint?: boolean;
}) {
  const ts = data.createdAt || new Date().toISOString();
  const isCash = data.paymentMethod === 'cash';

  return (
    <div>
      <div className="text-center mb-2">
        <p className="font-bold text-base">{data.establishmentName || 'Establecimiento'}</p>
        <p className="font-bold text-sm border-y border-dashed border-foreground py-0.5 my-1">
          {copy === 'cliente' ? 'COPIA CLIENTE' : 'COPIA CONTROL'}
        </p>
        {reprint && <p className="text-xs font-bold">*** REIMPRESIÓN ***</p>}
        {data.invoiceNumber ? <p className="text-xl font-bold leading-tight">RECIBO Nº {data.invoiceNumber}</p> : null}
        <p className="text-xs">Mesa {data.tableNumber}</p>
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
        {data.payments?.map((p, i) => (
          <div key={i} className="flex justify-between pl-2">
            <span>{PAYMENT_LABELS[p.method] || p.method}</span>
            <span>${p.amount.toFixed(2)}</span>
          </div>
        ))}
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

export type CloseTicketCopy = 'cliente' | 'control';

/**
 * Print-only area: una copia del recibo (cliente o control).
 * Rendered through a portal on <body> so it never coexists with another
 * `.print-ticket` node (e.g. the pre-bill) in the same print job.
 */
export default function CloseTicket({ data, reprint, copy }: { data: CloseTicketData; reprint?: boolean; copy: CloseTicketCopy }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="print-portal print-ticket">
      <TicketCopy key={copy} data={data} copy={copy} reprint={reprint} />
    </div>,
    document.body
  );
}

/**
 * Imprime el duplicado como DOS impresiones seguidas (primero cliente, después control):
 * así la comandera corta el papel entre una copia y la otra, sin depender de su configuración.
 * Devuelve qué copia montar mientras `active`; al terminar la segunda llama a `onFinished`.
 */
export function useTwoCopyPrint(active: boolean, onFinished: () => void): CloseTicketCopy {
  const [copy, setCopy] = useState<CloseTicketCopy>('cliente');
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    if (!active) {
      setCopy('cliente');
      return;
    }
    return printTicketPortal(() => {
      if (copy === 'cliente') {
        setCopy('control');
      } else {
        setCopy('cliente');
        finishedRef.current();
      }
    }, copy === 'control' ? 600 : 250);
  }, [active, copy]);
  return copy;
}

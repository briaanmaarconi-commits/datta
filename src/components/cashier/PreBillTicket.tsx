import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { printTicketPortal } from '@/lib/print';

interface PreBillItem {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  manual?: boolean;
}

interface PreBillTicketProps {
  tableNumber: number;
  items: PreBillItem[];
  total: number;
  establishmentName?: string;
  generatedAt?: string;
}

export default function PreBillTicket({
  tableNumber,
  items,
  total,
  establishmentName,
  generatedAt,
}: PreBillTicketProps) {
  const [printing, setPrinting] = useState(false);
  const ts = generatedAt || new Date().toISOString();

  useEffect(() => {
    if (!printing) return;
    return printTicketPortal(() => setPrinting(false));
  }, [printing]);

  return (
    <div>
      {/* Print-only ticket, rendered through a portal so it is the only
          `.print-ticket` node in the document during the print job. */}
      {printing &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="print-portal print-ticket">
            <div className="text-center mb-2">
              <p className="font-bold text-base">{establishmentName || 'Establecimiento'}</p>
              <p className="font-bold text-sm border-y border-dashed border-foreground py-0.5 my-1">
                PRE-CUENTA
              </p>
              <p className="text-xs">Mesa {tableNumber}</p>
              <p className="text-xs">{format(new Date(ts), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
            </div>

            <div className="border-t border-dashed border-foreground my-1" />

            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left">Prod.</th>
                  <th className="text-center">Cant.</th>
                  <th className="text-right">P. unit.</th>
                  <th className="text-right">Subt.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="text-left">
                      {item.name}
                      {item.manual ? ' *' : ''}
                    </td>
                    <td className="text-center">{item.qty}</td>
                    <td className="text-right">${item.unit_price.toFixed(2)}</td>
                    <td className="text-right">${item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-foreground my-1" />

            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>${total.toFixed(2)}</span>
            </div>

            <div className="border-t border-dashed border-foreground my-2" />
            <p className="text-center text-[10px] font-bold">
              *** NO VÁLIDO COMO COMPROBANTE FISCAL ***
            </p>
            <p className="text-center text-[10px]">Documento informativo previo al pago</p>
            {items.some(i => i.manual) && (
              <p className="text-center text-[10px] mt-1">* Ítem agregado manualmente</p>
            )}
          </div>,
          document.body
        )}

      {/* Screen preview */}
      <div className="print:hidden space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-3 border">
          <div className="text-center space-y-1">
            <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground border-b border-dashed pb-2 mb-2">
              Pre-cuenta
            </p>
            <p className="font-bold text-base">{establishmentName || 'Establecimiento'}</p>
            <p className="text-muted-foreground">Mesa {tableNumber}</p>
            <p className="text-muted-foreground text-xs">
              {format(new Date(ts), 'dd/MM/yyyy HH:mm', { locale: es })}
            </p>
          </div>

          <div className="border-t border-dashed" />

          <div className="space-y-1">
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">Sin consumos registrados</p>
            )}
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="flex-1 truncate">
                  {item.name}
                  {item.manual ? ' *' : ''}
                </span>
                <span className="w-8 text-center">{item.qty}</span>
                <span className="w-16 text-right">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed" />

          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>${total.toFixed(2)}</span>
          </div>

          <div className="border-t border-dashed pt-2 text-center text-[10px] text-muted-foreground">
            <p className="font-semibold">NO VÁLIDO COMO COMPROBANTE FISCAL</p>
            <p>Documento informativo previo al pago</p>
            {items.some(i => i.manual) && <p className="mt-1">* Ítem agregado manualmente</p>}
          </div>
        </div>

        <Button onClick={() => setPrinting(true)} disabled={printing} className="w-full gap-2">
          <Printer className="h-4 w-4" />
          {printing ? 'Imprimiendo…' : 'Imprimir pre-cuenta'}
        </Button>
      </div>
    </div>
  );
}

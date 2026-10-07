import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer } from 'lucide-react';
import { tableLabel } from '@/lib/ownDelivery';

interface InvoiceItem {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

interface FiscalData {
  tipo_cbte: number;
  punto_venta: number;
  cbte_numero: number;
  cae: string;
  cae_vto: string;
  neto_gravado?: number;
  iva_amount?: number;
  receptor_cuit?: string;
  receptor_razon_social?: string;
  receptor_condicion_iva?: string;
  is_credit_note?: boolean;
}

interface InvoiceTicketProps {
  invoice: {
    invoice_number: number;
    table_number: number;
    items: InvoiceItem[];
    total: number;
    payment_method: string;
    amount_paid: number;
    change_amount: number;
    created_at: string;
    tip_amount?: number;
  };
  establishmentName?: string;
  establishmentCuit?: string;
  fiscalData?: FiscalData | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

const TIPO_LABELS: Record<number, string> = {
  1: 'FACTURA A',
  3: 'NOTA DE CRÉDITO A',
  6: 'FACTURA B',
  8: 'NOTA DE CRÉDITO B',
  11: 'FACTURA C',
  13: 'NOTA DE CRÉDITO C',
};

const CONDICION_LABELS: Record<string, string> = {
  consumidor_final: 'Consumidor Final',
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributista',
  exento: 'Exento',
};

function formatCbteNumero(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`;
}

export default function InvoiceTicket({ invoice, establishmentName, establishmentCuit, fiscalData }: InvoiceTicketProps) {
  const handlePrint = () => {
    window.print();
  };

  const tipoLabel = fiscalData ? TIPO_LABELS[fiscalData.tipo_cbte] || `TIPO ${fiscalData.tipo_cbte}` : null;
  const isFacturaA = fiscalData && (fiscalData.tipo_cbte === 1 || fiscalData.tipo_cbte === 3);

  return (
    <div>
      {/* Print-only ticket */}
      <div className="hidden print:block print-ticket">
        <div className="text-center mb-2">
          {fiscalData && (
            <p className="font-bold text-sm border-b border-dashed border-foreground pb-1 mb-1">
              {tipoLabel}
            </p>
          )}
          <p className="font-bold text-base">{establishmentName || 'Establecimiento'}</p>
          {establishmentCuit && <p className="text-xs">CUIT: {establishmentCuit}</p>}
          {fiscalData ? (
            <>
              <p className="text-xs">Comp. Nº {formatCbteNumero(fiscalData.punto_venta, fiscalData.cbte_numero)}</p>
              <p className="text-xs">
                {format(new Date(invoice.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs">Comprobante #{invoice.invoice_number}</p>
              <p className="text-xs">
                {format(new Date(invoice.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
              </p>
            </>
          )}
          <p className="text-xs">{tableLabel(invoice.table_number)}</p>
        </div>

        {fiscalData?.receptor_cuit && (
          <div className="text-xs mb-1">
            <p>CUIT Receptor: {fiscalData.receptor_cuit}</p>
            {fiscalData.receptor_razon_social && <p>{fiscalData.receptor_razon_social}</p>}
            <p>{CONDICION_LABELS[fiscalData.receptor_condicion_iva || 'consumidor_final']}</p>
          </div>
        )}

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
            {invoice.items.map((item, i) => (
              <tr key={i}>
                <td className="text-left">{item.name}</td>
                <td className="text-center">{item.qty}</td>
                <td className="text-right">${item.subtotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-foreground my-1" />

        <div className="text-xs space-y-0.5">
          {isFacturaA && fiscalData.neto_gravado != null && (
            <>
              <div className="flex justify-between">
                <span>Neto Gravado</span>
                <span>${Number(fiscalData.neto_gravado).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA 21%</span>
                <span>${Number(fiscalData.iva_amount ?? 0).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>${invoice.total.toFixed(2)}</span>
          </div>
          {invoice.tip_amount && invoice.tip_amount > 0 ? (
            <div className="flex justify-between">
              <span>Propina</span>
              <span>${Number(invoice.tip_amount).toFixed(2)}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span>Pago</span>
            <span>{PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method}</span>
          </div>
          {invoice.payment_method === 'cash' && (
            <>
              <div className="flex justify-between">
                <span>Recibido</span>
                <span>${invoice.amount_paid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Vuelto</span>
                <span>${invoice.change_amount.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        {fiscalData && (
          <>
            <div className="border-t border-dashed border-foreground my-1" />
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between">
                <span>CAE</span>
                <span className="font-mono">{fiscalData.cae}</span>
              </div>
              <div className="flex justify-between">
                <span>Vto. CAE</span>
                <span>{fiscalData.cae_vto}</span>
              </div>
            </div>
          </>
        )}

        <div className="border-t border-dashed border-foreground my-2" />
        <p className="text-center text-xs">¡Gracias por su visita!</p>
      </div>

      {/* Screen preview */}
      <div className="print:hidden space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-3 border">
          <div className="text-center space-y-1">
            {fiscalData && (
              <Badge variant={fiscalData.is_credit_note ? 'destructive' : 'default'} className="mb-2">
                {tipoLabel}
              </Badge>
            )}
            <p className="font-bold text-base">{establishmentName || 'Establecimiento'}</p>
            {establishmentCuit && <p className="text-muted-foreground text-xs">CUIT: {establishmentCuit}</p>}
            {fiscalData ? (
              <p className="text-muted-foreground">
                Nº {formatCbteNumero(fiscalData.punto_venta, fiscalData.cbte_numero)}
              </p>
            ) : (
              <p className="text-muted-foreground">Comprobante #{invoice.invoice_number}</p>
            )}
            <p className="text-muted-foreground">
              {format(new Date(invoice.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
            </p>
            <p className="text-muted-foreground">{tableLabel(invoice.table_number)}</p>
          </div>

          {fiscalData?.receptor_cuit && (
            <div className="border-t border-dashed pt-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">CUIT Receptor</span>
                <span>{fiscalData.receptor_cuit}</span>
              </div>
              {fiscalData.receptor_razon_social && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Razón Social</span>
                  <span>{fiscalData.receptor_razon_social}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Condición IVA</span>
                <span>{CONDICION_LABELS[fiscalData.receptor_condicion_iva || 'consumidor_final']}</span>
              </div>
            </div>
          )}

          <div className="border-t border-dashed" />

          <div className="space-y-1">
            {invoice.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="flex-1 truncate">{item.name}</span>
                <span className="w-8 text-center">{item.qty}</span>
                <span className="w-16 text-right">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed" />

          <div className="space-y-1">
            {isFacturaA && fiscalData.neto_gravado != null && (
              <>
                <div className="flex justify-between text-xs">
                  <span>Neto Gravado</span>
                  <span>${Number(fiscalData.neto_gravado).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>IVA 21%</span>
                  <span>${Number(fiscalData.iva_amount ?? 0).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span>${invoice.total.toFixed(2)}</span>
            </div>
            {invoice.tip_amount && invoice.tip_amount > 0 ? (
              <div className="flex justify-between text-xs">
                <span>Propina</span>
                <span>${Number(invoice.tip_amount).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-xs">
              <span>Método</span>
              <span>{PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method}</span>
            </div>
            {invoice.payment_method === 'cash' && (
              <>
                <div className="flex justify-between text-xs">
                  <span>Recibido</span>
                  <span>${invoice.amount_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Vuelto</span>
                  <span>${invoice.change_amount.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          {fiscalData && (
            <>
              <div className="border-t border-dashed" />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CAE</span>
                  <span className="font-mono">{fiscalData.cae}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vto. CAE</span>
                  <span>{fiscalData.cae_vto}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <Button onClick={handlePrint} className="w-full gap-2">
          <Printer className="h-4 w-4" />
          Imprimir comprobante
        </Button>
      </div>
    </div>
  );
}

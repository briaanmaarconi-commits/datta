import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { invokeAfip } from '@/lib/afipInvoke';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { toast } from 'sonner';
import { Loader2, FileText, Plus, Trash2 } from 'lucide-react';
import { parseAmount } from '@/lib/parseAmount';
import CuitReceptorFields from '@/components/shared/CuitReceptorFields';
import type { FacturaTicketData } from './FacturaTicket80mm';

interface Line {
  name: string;
  quantity: string;
  price: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  condicionIvaEmisor: string;
  onAuthorized?: (ticket: FacturaTicketData) => void;
}

function getTipoComprobante(emisor: string, receptor: string): { tipo: number; label: string } {
  if (emisor === 'monotributo') return { tipo: 11, label: 'Factura C' };
  if (receptor === 'responsable_inscripto') return { tipo: 1, label: 'Factura A' };
  return { tipo: 6, label: 'Factura B' };
}

const todayAr = () => {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
};

export default function ManualInvoiceDialog({ open, onOpenChange, condicionIvaEmisor, onAuthorized }: Props) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Line[]>([{ name: '', quantity: '1', price: '' }]);
  const [receptorCondicion, setReceptorCondicion] = useState('consumidor_final');
  const [receptorCuit, setReceptorCuit] = useState('');
  const [receptorRazonSocial, setReceptorRazonSocial] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [fecha, setFecha] = useState(todayAr());

  const comprobante = getTipoComprobante(condicionIvaEmisor, receptorCondicion);
  const needsReceptorData = comprobante.tipo === 1;

  const parsedLines = lines.map(l => {
    const qty = Math.max(1, Math.round(parseAmount(l.quantity) || 0) || 1);
    const price = parseAmount(l.price) || 0;
    return { name: l.name.trim(), quantity: qty, price, subtotal: qty * price };
  });
  const total = parsedLines.reduce((s, l) => s + l.subtotal, 0);

  const reset = () => {
    setLines([{ name: '', quantity: '1', price: '' }]);
    setReceptorCondicion('consumidor_final');
    setReceptorCuit('');
    setReceptorRazonSocial('');
    setPaymentMethod('cash');
    setFecha(todayAr());
  };

  const emitir = useMutation({
    mutationFn: async () => {
      const validLines = parsedLines.filter(l => l.name && l.subtotal > 0);
      if (validLines.length === 0) throw new Error('Cargá al menos un detalle con descripción y monto');
      if (total <= 0) throw new Error('El total debe ser mayor a cero');
      if (needsReceptorData && (!receptorCuit || !receptorRazonSocial)) {
        throw new Error('CUIT y Razón Social son obligatorios para Factura A');
      }

      const items = validLines.map(l => ({
        name: l.name,
        qty: l.quantity,
        quantity: l.quantity,
        unit_price: l.price,
        price: l.price,
        subtotal: l.subtotal,
      }));

      const res: any = await invokeAfip({
        action: 'authorize',
        establishment_id: establishmentId,
        invoice_id: null,
        total: Number(total.toFixed(2)),
        items,
        payment_method: paymentMethod,
        receptor_condicion_iva: receptorCondicion,
        receptor_cuit: receptorCuit || null,
        receptor_razon_social: receptorRazonSocial || null,
        is_credit_note: false,
        fecha_emision: fecha,
        created_by: session?.user?.id,
      });
      return { res, items };
    },
    onSuccess: ({ res, items }) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing-fiscal'] });
      toast.success(`Factura emitida — CAE: ${res.cae}`);
      onOpenChange(false);
      onAuthorized?.({
        tipo_cbte: res.tipo_cbte,
        punto_venta: res.punto_venta,
        cbte_numero: res.cbte_numero,
        cae: res.cae,
        cae_vto: res.cae_vto,
        created_at: `${fecha}T12:00:00-03:00`,
        total: Number(res.total ?? total),
        neto_gravado: res.neto_gravado,
        iva_amount: res.iva_amount,
        payment_method: paymentMethod,
        receptor_cuit: receptorCuit || null,
        receptor_razon_social: receptorRazonSocial || null,
        receptor_condicion_iva: receptorCondicion,
        items,
      } as FacturaTicketData);
      reset();
    },
    onError: (err: any) => toast.error(err?.message || 'Error al emitir factura'),
  });

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Factura manual
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Detalle */}
          <div className="space-y-2">
            <Label>Detalle</Label>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  className="flex-1"
                  placeholder="Ej: 1 comida mesa 3"
                  value={l.name}
                  onChange={e => updateLine(i, { name: e.target.value })}
                />
                <Input
                  className="w-16"
                  inputMode="numeric"
                  placeholder="Cant."
                  value={l.quantity}
                  onChange={e => updateLine(i, { quantity: e.target.value })}
                />
                <Input
                  className="w-28"
                  inputMode="decimal"
                  placeholder="Precio"
                  value={l.price}
                  onChange={e => updateLine(i, { price: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines(prev => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setLines(prev => [...prev, { name: '', quantity: '1', price: '' }])}
            >
              <Plus className="h-4 w-4" /> Agregar línea
            </Button>
          </div>

          <div className="flex justify-between font-bold border-t pt-2">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>

          {/* Receptor */}
          {condicionIvaEmisor === 'responsable_inscripto' ? (
            <div className="space-y-1.5">
              <Label>¿A quién se factura?</Label>
              <Select value={receptorCondicion} onValueChange={setReceptorCondicion}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                  <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                  <SelectItem value="monotributo">Monotributista</SelectItem>
                  <SelectItem value="exento">Exento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Como Monotributista, siempre se emite Factura C.</p>
          )}

          {needsReceptorData && (
            <div className="space-y-3 border-t pt-3">
              <CuitReceptorFields
                cuit={receptorCuit}
                razonSocial={receptorRazonSocial}
                onCuitChange={setReceptorCuit}
                onRazonSocialChange={setReceptorRazonSocial}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de emisión</Label>
              <Input type="date" value={fecha} max={todayAr()} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tipo de comprobante:</span>
            <Badge variant={comprobante.tipo === 1 ? 'default' : 'secondary'}>{comprobante.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Esta factura no genera movimientos de caja: sólo emite el comprobante fiscal.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => emitir.mutate()} disabled={emitir.isPending} className="gap-2">
            {emitir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Emitir factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

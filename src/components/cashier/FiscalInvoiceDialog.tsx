import { useState } from 'react';
import { invokeAfip } from '@/lib/afipInvoke';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, FileText } from 'lucide-react';
import CuitReceptorFields from '@/components/shared/CuitReceptorFields';

interface FiscalInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  condicionIvaEmisor: string;
  onAuthorized?: (ticket: {
    tipo_cbte: number;
    punto_venta: number;
    cbte_numero: number;
    cae: string;
    cae_vto: string;
    created_at: string;
    total: number;
    neto_gravado?: number | null;
    iva_amount?: number | null;
    payment_method?: string | null;
    receptor_cuit?: string | null;
    receptor_razon_social?: string | null;
    receptor_condicion_iva?: string | null;
    items: any[];
  }) => void;
}

function getTipoComprobante(emisor: string, receptor: string): { tipo: number; label: string } {
  if (emisor === 'monotributo') return { tipo: 11, label: 'Factura C' };
  // Responsable inscripto
  if (receptor === 'responsable_inscripto') return { tipo: 1, label: 'Factura A' };
  return { tipo: 6, label: 'Factura B' };
}

export default function FiscalInvoiceDialog({ open, onOpenChange, invoice, condicionIvaEmisor, onAuthorized }: FiscalInvoiceDialogProps) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();

  const [receptorCondicion, setReceptorCondicion] = useState('consumidor_final');
  const [receptorCuit, setReceptorCuit] = useState('');
  const [receptorRazonSocial, setReceptorRazonSocial] = useState('');

  const comprobante = getTipoComprobante(condicionIvaEmisor, receptorCondicion);
  const needsReceptorData = comprobante.tipo === 1; // Factura A

  const emitirFactura = useMutation({
    mutationFn: async () => {
      if (needsReceptorData && (!receptorCuit || !receptorRazonSocial)) {
        throw new Error('CUIT y Razón Social son obligatorios para Factura A');
      }

      return await invokeAfip({
        action: 'authorize',
        establishment_id: establishmentId,
        invoice_id: invoice.id,
        total: invoice.total,
        items: invoice.items,
        payment_method: invoice.payment_method,
        receptor_condicion_iva: receptorCondicion,
        receptor_cuit: receptorCuit || null,
        receptor_razon_social: receptorRazonSocial || null,
        is_credit_note: false,
        created_by: session?.user?.id,
      });

    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      toast.success(`Factura emitida — CAE: ${data.cae}`);
      onOpenChange(false);
      onAuthorized?.({
        tipo_cbte: data.tipo_cbte,
        punto_venta: data.punto_venta,
        cbte_numero: data.cbte_numero,
        cae: data.cae,
        cae_vto: data.cae_vto,
        created_at: new Date().toISOString(),
        total: Number(data.total ?? invoice.total),
        neto_gravado: data.neto_gravado,
        iva_amount: data.iva_amount,
        payment_method: invoice.payment_method,
        receptor_cuit: receptorCuit || null,
        receptor_razon_social: receptorRazonSocial || null,
        receptor_condicion_iva: receptorCondicion,
        items: invoice.items || [],
      });
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || 'Error al emitir factura'),
  });

  const resetForm = () => {
    setReceptorCondicion('consumidor_final');
    setReceptorCuit('');
    setReceptorRazonSocial('');
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Emitir factura fiscal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice summary */}
          <div className="rounded-lg border p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comprobante</span>
              <span>#{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mesa</span>
              <span>{invoice.table_number}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>${Number(invoice.total).toFixed(2)}</span>
            </div>
          </div>

          {/* Receptor type (only for RI emitters) */}
          {condicionIvaEmisor === 'responsable_inscripto' ? (
            <div className="space-y-1.5">
              <Label>¿A quién se factura?</Label>
              <Select value={receptorCondicion} onValueChange={setReceptorCondicion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                  <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                  <SelectItem value="monotributo">Monotributista</SelectItem>
                  <SelectItem value="exento">Exento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Como Monotributista, siempre se emite Factura C.
            </p>
          )}

          {/* Receptor data for Factura A */}
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

          {/* Comprobante type badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tipo de comprobante:</span>
            <Badge variant={comprobante.tipo === 1 ? 'default' : 'secondary'}>
              {comprobante.label}
            </Badge>
          </div>
          {condicionIvaEmisor === 'responsable_inscripto' && comprobante.tipo === 6 && (
            <p className="text-xs text-muted-foreground">
              Un emisor Responsable Inscripto factura B tanto a Consumidor Final como a Monotributista.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => emitirFactura.mutate()}
            disabled={emitirFactura.isPending}
            className="gap-2"
          >
            {emitirFactura.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Emitir factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

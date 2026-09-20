import { useState } from 'react';
import { invokeAfip } from '@/lib/afipInvoke';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Loader2, FileX } from 'lucide-react';

interface CreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fiscalInvoice: any; // fiscal_invoices row
}

const NC_CODES: Record<number, { code: number; label: string }> = {
  1: { code: 3, label: 'Nota de Crédito A' },
  6: { code: 8, label: 'Nota de Crédito B' },
  11: { code: 13, label: 'Nota de Crédito C' },
};

export default function CreditNoteDialog({ open, onOpenChange, fiscalInvoice }: CreditNoteDialogProps) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'total' | 'partial'>('total');
  const [partialAmount, setPartialAmount] = useState('');
  const [reason, setReason] = useState('');

  const ncInfo = fiscalInvoice ? NC_CODES[fiscalInvoice.tipo_cbte] : null;

  const emitirNC = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error('El motivo es obligatorio');
      const amount = mode === 'total' ? Number(fiscalInvoice.total) : Number(partialAmount);
      if (amount <= 0 || amount > Number(fiscalInvoice.total)) {
        throw new Error('Monto inválido');
      }

      return await invokeAfip({
        action: 'authorize',
        establishment_id: establishmentId,
        invoice_id: fiscalInvoice.invoice_id,
        total: amount,
        payment_method: fiscalInvoice.payment_method,
        receptor_condicion_iva: fiscalInvoice.receptor_condicion_iva,
        receptor_cuit: fiscalInvoice.receptor_cuit,
        receptor_razon_social: fiscalInvoice.receptor_razon_social,
        is_credit_note: true,
        related_fiscal_invoice_id: fiscalInvoice.id,
        credit_note_reason: reason,
        original_tipo_cbte: fiscalInvoice.tipo_cbte,
        original_punto_venta: fiscalInvoice.punto_venta,
        original_cbte_numero: fiscalInvoice.cbte_numero,
        created_by: session?.user?.id,
      });

    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      toast.success(`Nota de Crédito emitida — CAE: ${data.cae}`);
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || 'Error al emitir NC'),
  });

  const resetForm = () => {
    setMode('total');
    setPartialAmount('');
    setReason('');
  };

  if (!fiscalInvoice) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileX className="h-5 w-5" />
            Emitir Nota de Crédito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original invoice info */}
          <div className="rounded-lg border p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Factura original</span>
              <span>{String(fiscalInvoice.punto_venta).padStart(4, '0')}-{String(fiscalInvoice.cbte_numero).padStart(8, '0')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CAE</span>
              <span className="font-mono text-xs">{fiscalInvoice.cae}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total original</span>
              <span>${Number(fiscalInvoice.total).toFixed(2)}</span>
            </div>
          </div>

          {ncInfo && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tipo:</span>
              <Badge variant="destructive">{ncInfo.label}</Badge>
            </div>
          )}

          {/* Total or partial */}
          <div className="space-y-2">
            <Label>Tipo de nota de crédito</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="total" id="nc-total" />
                <Label htmlFor="nc-total">Total (${Number(fiscalInvoice.total).toFixed(2)})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="nc-partial" />
                <Label htmlFor="nc-partial">Parcial</Label>
              </div>
            </RadioGroup>
          </div>

          {mode === 'partial' && (
            <div className="space-y-1.5">
              <Label htmlFor="partial-amount">Monto a acreditar</Label>
              <Input
                id="partial-amount"
                type="number"
                min="0.01"
                max={Number(fiscalInvoice.total)}
                step="0.01"
                placeholder="0.00"
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nc-reason">Motivo (obligatorio)</Label>
            <Textarea
              id="nc-reason"
              placeholder="Describí el motivo de la nota de crédito..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={() => emitirNC.mutate()}
            disabled={emitirNC.isPending || !reason.trim()}
            className="gap-2"
          >
            {emitirNC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileX className="h-4 w-4" />}
            Emitir NC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

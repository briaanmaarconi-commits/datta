import { useState, useMemo } from 'react';
import { invokeAfip } from '@/lib/afipInvoke';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { FileText, Loader2, CheckCircle, SkipForward } from 'lucide-react';
import { tableCell } from '@/lib/ownDelivery';

interface ShiftFiscalStepProps {
  onComplete: () => void;
  onSkip: () => void;
  shiftOpenedAt: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

export default function ShiftFiscalStep({ onComplete, onSkip, shiftOpenedAt }: ShiftFiscalStepProps) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get establishment fiscal info
  const { data: establishment } = useQuery({
    queryKey: ['establishment-fiscal-shift', establishmentId],
    queryFn: async () => {
      const { data } = await db
        .from('establishments')
        .select('condicion_iva, cuit, punto_venta_afip')
        .eq('id', establishmentId!)
        .single();
      return data;
    },
    enabled: !!establishmentId,
  });

  // Get invoices from this shift that don't have a fiscal invoice
  const { data: unfiscaledInvoices = [] } = useQuery({
    queryKey: ['unfiscaled-invoices', establishmentId, shiftOpenedAt],
    queryFn: async () => {
      const { data: invoices, error } = await db
        .from('invoices')
        .select('id, invoice_number, table_number, total, payment_method, created_at')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', shiftOpenedAt)
        .order('created_at');
      if (error) throw error;

      // Check which already have fiscal invoices
      const { data: fiscals } = await db
        .from('fiscal_invoices')
        .select('invoice_id')
        .eq('establishment_id', establishmentId!)
        .eq('is_credit_note', false)
        .in('status', ['authorized', 'pending']);

      const fiscaledIds = new Set((fiscals || []).map((f: any) => f.invoice_id));
      return (invoices || []).map((inv: any) => ({
        ...inv,
        hasFiscal: fiscaledIds.has(inv.id),
      }));
    },
    enabled: !!establishmentId,
  });

  const pendingInvoices = unfiscaledInvoices.filter((inv: any) => !inv.hasFiscal);
  const filteredInvoices = paymentFilter === 'all'
    ? pendingInvoices
    : pendingInvoices.filter((inv: any) => inv.payment_method === paymentFilter);

  const hasFiscalConfig = establishment?.cuit && establishment?.punto_venta_afip;

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredInvoices.map((inv: any) => inv.id)));
    } else {
      setSelected(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const selectedTotal = pendingInvoices
    .filter((inv: any) => selected.has(inv.id))
    .reduce((sum: number, inv: any) => sum + Number(inv.total), 0);

  const handleBulkInvoice = async () => {
    if (selected.size === 0) return;
    setIsProcessing(true);
    setProgress(0);

    const toProcess = pendingInvoices.filter((inv: any) => selected.has(inv.id));
    let completed = 0;

    for (const inv of toProcess) {
      try {
        await invokeAfip({
          action: 'authorize',
          establishment_id: establishmentId,
          invoice_id: inv.id,
          total: inv.total,
          payment_method: inv.payment_method,
          receptor_condicion_iva: 'consumidor_final',
          receptor_cuit: null,
          receptor_razon_social: null,
          is_credit_note: false,
          created_by: session?.user?.id,
        });
      } catch (err: any) {
        toast.error(`Error en comprobante #${inv.invoice_number}: ${err?.message ?? ''}`);
      }

      completed++;
      setProgress(Math.round((completed / toProcess.length) * 100));
    }

    queryClient.invalidateQueries({ queryKey: ['unfiscaled-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
    setIsProcessing(false);
    toast.success(`${completed} factura(s) emitida(s)`);
    onComplete();
  };

  if (!hasFiscalConfig) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-muted-foreground">
            No hay datos fiscales configurados. Podés saltear este paso.
          </p>
          <Button onClick={onSkip} variant="outline" className="gap-2">
            <SkipForward className="h-4 w-4" />
            Omitir y cerrar turno
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Facturación fiscal antes de cerrar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingInvoices.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <CheckCircle className="h-8 w-8 mx-auto text-green-600" />
            <p className="text-muted-foreground">Todas las ventas del turno ya están facturadas.</p>
            <Button onClick={onComplete}>Continuar con el cierre</Button>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              {['all', 'cash', 'card', 'transfer'].map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={paymentFilter === f ? 'default' : 'outline'}
                  onClick={() => setPaymentFilter(f)}
                >
                  {f === 'all' ? 'Todos' : PAYMENT_LABELS[f]}
                </Button>
              ))}
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={filteredInvoices.length > 0 && filteredInvoices.every((inv: any) => selected.has(inv.id))}
                        onCheckedChange={(checked) => toggleAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Mesa</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(inv.id)}
                          onCheckedChange={(checked) => toggleOne(inv.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell>{tableCell(inv.table_number)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{PAYMENT_LABELS[inv.payment_method] || inv.payment_method}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">${Number(inv.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary and actions */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selected.size} seleccionados — Total: ${selectedTotal.toFixed(2)}
              </span>
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-center text-muted-foreground">Emitiendo facturas... {progress}%</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onSkip} disabled={isProcessing} className="gap-2">
                <SkipForward className="h-4 w-4" />
                Omitir
              </Button>
              <Button
                onClick={handleBulkInvoice}
                disabled={isProcessing || selected.size === 0}
                className="gap-2"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Facturar seleccionados a Cons. Final
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

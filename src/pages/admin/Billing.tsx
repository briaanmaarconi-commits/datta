import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { invokeAfip } from '@/lib/afipInvoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, Loader2, AlertTriangle } from 'lucide-react';
import FiscalInvoiceDialog from '@/components/cashier/FiscalInvoiceDialog';
import ManualInvoiceDialog from '@/components/cashier/ManualInvoiceDialog';
import CuitReceptorFields from '@/components/shared/CuitReceptorFields';
import FiscalTicketDialog from '@/components/cashier/FiscalTicketDialog';
import type { FacturaTicketData } from '@/components/cashier/FacturaTicket80mm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };

export default function AdminBilling() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [onlyPending, setOnlyPending] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [singleInvoice, setSingleInvoice] = useState<any>(null);
  const [fiscalTicket, setFiscalTicket] = useState<FacturaTicketData | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'per_table' | 'single'>('per_table');
  const [bulkCondicion, setBulkCondicion] = useState('consumidor_final');
  const [bulkCuit, setBulkCuit] = useState('');
  const [bulkRazonSocial, setBulkRazonSocial] = useState('');
  const [bulkFecha, setBulkFecha] = useState(today);
  const [manualOpen, setManualOpen] = useState(false);
  const minFecha = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);


  const { data: establishment } = useQuery({
    queryKey: ['establishment-fiscal', establishmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('establishments')
        .select('name, razon_social, domicilio_comercial, condicion_iva, cuit, punto_venta_afip')
        .eq('id', establishmentId!)
        .single();
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['admin-billing-invoices', establishmentId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, table_number, total, payment_method, items, created_at')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', `${dateFrom}T00:00:00-03:00`)
        .lte('created_at', `${dateTo}T23:59:59.999-03:00`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!establishmentId,
    staleTime: 0,
  });

  const { data: fiscalInvoices = [] } = useQuery({
    queryKey: ['admin-billing-fiscal', establishmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('fiscal_invoices')
        .select('invoice_id, is_credit_note, status, cae')
        .eq('establishment_id', establishmentId!);
      return data || [];
    },
    enabled: !!establishmentId,
    staleTime: 0,
  });

  const { data: coveredLinks = [] } = useQuery({
    queryKey: ['admin-billing-covered', establishmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('fiscal_invoice_covered_invoices')
        .select('invoice_id')
        .eq('establishment_id', establishmentId!);
      return data || [];
    },
    enabled: !!establishmentId,
    staleTime: 0,
  });

  const fiscaledIds = useMemo(
    () => new Set([
      ...fiscalInvoices
        .filter((f: any) => !f.is_credit_note && ['authorized', 'pending'].includes(f.status))
        .map((f: any) => f.invoice_id),
      ...coveredLinks.map((c: any) => c.invoice_id),
    ]),
    [fiscalInvoices, coveredLinks]
  );

  const rows = useMemo(
    () => invoices
      .map((inv: any) => ({ ...inv, hasFiscal: fiscaledIds.has(inv.id) }))
      .filter((inv: any) => (onlyPending ? !inv.hasFiscal : true)),
    [invoices, fiscaledIds, onlyPending]
  );

  const selectable = rows.filter((r: any) => !r.hasFiscal);
  const selectedRows = selectable.filter((r: any) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((s: number, r: any) => s + Number(r.total), 0);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(selectable.map((r: any) => r.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const hasFiscalConfig = !!establishment?.cuit && !!establishment?.punto_venta_afip;

  const emisorRI = (establishment?.condicion_iva || 'monotributo') === 'responsable_inscripto';
  const bulkTipoLabel = !emisorRI
    ? 'Factura C'
    : bulkCondicion === 'responsable_inscripto'
      ? 'Factura A'
      : 'Factura B';
  const bulkNeedsReceptor = emisorRI && bulkCondicion === 'responsable_inscripto';

  const handleBulk = async () => {
    if (selectedRows.length === 0) return;
    if (bulkNeedsReceptor && (!bulkCuit || !bulkRazonSocial)) {
      toast.error('CUIT y Razón Social son obligatorios para Factura A');
      return;
    }
    setBulkOpen(false);
    setIsProcessing(true);
    setProgress(0);
    let ok = 0;
    let fail = 0;

    const finish = () => {
      setIsProcessing(false);
      setSelected(new Set());
      setBulkCuit('');
      setBulkRazonSocial('');
      setBulkCondicion('consumidor_final');
      queryClient.invalidateQueries({ queryKey: ['admin-billing-fiscal'] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing-covered'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
    };

    if (bulkMode === 'single') {
      // Una sola factura que agrupa todas las mesas seleccionadas
      const mergedItems = selectedRows.flatMap((inv: any) =>
        (Array.isArray(inv.items) ? inv.items : []).map((it: any) => ({
          ...it,
          name: `Mesa ${inv.table_number} - ${it?.name ?? it?.product_name ?? 'Item'}`,
        }))
      );
      try {
        const res: any = await invokeAfip({
          action: 'authorize',
          establishment_id: establishmentId,
          invoice_id: selectedRows[0].id,
          total: Number(selectedTotal.toFixed(2)),
          items: mergedItems,
          payment_method: selectedRows[0].payment_method,
          receptor_condicion_iva: bulkCondicion,
          receptor_cuit: bulkCuit || null,
          receptor_razon_social: bulkRazonSocial || null,
          is_credit_note: false,
          fecha_emision: bulkFecha,
          created_by: session?.user?.id,
        });
        setProgress(100);
        const fiscalId = res?.fiscal_invoice_id;
        if (fiscalId) {
          await supabase.from('fiscal_invoice_covered_invoices').insert(
            selectedRows.map((inv: any) => ({
              fiscal_invoice_id: fiscalId,
              invoice_id: inv.id,
              establishment_id: establishmentId!,
            }))
          );
        }
        setFiscalTicket({
          tipo_cbte: res.tipo_cbte,
          punto_venta: res.punto_venta,
          cbte_numero: res.cbte_numero,
          cae: res.cae,
          cae_vto: res.cae_vto,
          created_at: `${bulkFecha}T12:00:00-03:00`,
          total: Number(res.total ?? selectedTotal),
          neto_gravado: res.neto_gravado,
          iva_amount: res.iva_amount,
          payment_method: selectedRows[0].payment_method,
          receptor_cuit: bulkCuit || null,
          receptor_razon_social: bulkRazonSocial || null,
          receptor_condicion_iva: bulkCondicion,
          items: mergedItems,
        });
        toast.success(`Factura única emitida por ${selectedRows.length} mesa(s) — $${selectedTotal.toFixed(2)}`);
      } catch (err: any) {
        toast.error(err?.message ?? 'Error al emitir la factura');
      }
      finish();
      return;
    }

    for (let i = 0; i < selectedRows.length; i++) {
      const inv = selectedRows[i];
      try {
        await invokeAfip({
          action: 'authorize',
          establishment_id: establishmentId,
          invoice_id: inv.id,
          total: inv.total,
          items: inv.items,
          payment_method: inv.payment_method,
          receptor_condicion_iva: bulkCondicion,
          receptor_cuit: bulkCuit || null,
          receptor_razon_social: bulkRazonSocial || null,
          is_credit_note: false,
          fecha_emision: bulkFecha,
          created_by: session?.user?.id,
        });
        ok++;
      } catch (err: any) {
        fail++;
        toast.error(`Comprobante #${inv.invoice_number}: ${err?.message ?? 'error'}`);
      }
      setProgress(Math.round(((i + 1) / selectedRows.length) * 100));
    }

    finish();
    if (ok > 0) toast.success(`${ok} factura(s) emitida(s)${fail ? ` — ${fail} con error` : ''}`);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <Button className="gap-2" onClick={() => setManualOpen(true)}>
          <FileText className="h-4 w-4" />
          Factura manual
        </Button>
      </div>

      {!hasFiscalConfig && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Faltan datos fiscales (CUIT y punto de venta) para poder facturar.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Facturación masiva por período
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox id="only-pending" checked={onlyPending} onCheckedChange={v => setOnlyPending(!!v)} />
              <Label htmlFor="only-pending" className="text-sm">Solo sin facturar</Label>
            </div>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Cargando comprobantes...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No hay comprobantes en el período seleccionado.
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={selectable.length > 0 && selectable.every((r: any) => selected.has(r.id))}
                        onCheckedChange={c => toggleAll(!!c)}
                      />
                    </TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Mesa</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Fiscal</TableHead>
                    <TableHead className="text-center">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        {!inv.hasFiscal && (
                          <Checkbox
                            checked={selected.has(inv.id)}
                            onCheckedChange={c => toggleOne(inv.id, !!c)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(inv.created_at), "dd/MM HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell>{inv.table_number}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{PAYMENT_LABELS[inv.payment_method] || inv.payment_method}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">${Number(inv.total).toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        {inv.hasFiscal ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">CAE ✓</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Sin facturar</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {!inv.hasFiscal && (
                          <Button size="sm" variant="ghost" onClick={() => setSingleInvoice(inv)}>
                            Facturar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">Emitiendo facturas... {progress}%</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedRows.length} seleccionados — Total: ${selectedTotal.toFixed(2)}
            </span>
            <Button
              onClick={() => setBulkOpen(true)}
              disabled={isProcessing || selectedRows.length === 0 || !hasFiscalConfig}
              className="gap-2"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Facturar seleccionados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Facturar {selectedRows.length} comprobante(s)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm flex justify-between font-semibold">
              <span>Total seleccionado</span>
              <span>${selectedTotal.toFixed(2)}</span>
            </div>

            <div className="space-y-1.5">
              <Label>¿Cómo querés emitir?</Label>
              <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_table">Una factura por cada mesa</SelectItem>
                  <SelectItem value="single">Una sola factura con todas las mesas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {bulkMode === 'single'
                  ? `Se emite 1 comprobante por $${selectedTotal.toFixed(2)} con el detalle de las ${selectedRows.length} mesas.`
                  : `Se emiten ${selectedRows.length} comprobantes, uno por mesa.`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-fecha">Fecha de emisión de la factura</Label>
              <Input
                id="bulk-fecha"
                type="date"
                value={bulkFecha}
                min={minFecha}
                max={today}
                onChange={e => setBulkFecha(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ARCA permite emitir hasta 10 días hacia atrás. Si elegís más de 5 días atrás,
                el comprobante se emite como servicio (única forma permitida por ARCA).
              </p>
            </div>



            {emisorRI ? (
              <div className="space-y-1.5">
                <Label>¿A quién se factura?</Label>
                <Select value={bulkCondicion} onValueChange={setBulkCondicion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
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

            {bulkNeedsReceptor && (
              <div className="space-y-3 border-t pt-3">
                <CuitReceptorFields
                  cuit={bulkCuit}
                  razonSocial={bulkRazonSocial}
                  onCuitChange={setBulkCuit}
                  onRazonSocialChange={setBulkRazonSocial}
                />
                <p className="text-xs text-muted-foreground">
                  Se emitirá una Factura A por cada comprobante seleccionado, todas al mismo receptor.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tipo de comprobante:</span>
              <Badge variant={bulkTipoLabel === 'Factura A' ? 'default' : 'secondary'}>{bulkTipoLabel}</Badge>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulk} className="gap-2">
              <FileText className="h-4 w-4" />
              {bulkMode === 'single' ? 'Emitir 1 factura total' : `Emitir ${selectedRows.length} factura(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <FiscalInvoiceDialog
        open={!!singleInvoice}
        onOpenChange={(v) => { if (!v) setSingleInvoice(null); }}
        invoice={singleInvoice}
        condicionIvaEmisor={establishment?.condicion_iva || 'monotributo'}
        onAuthorized={(t) => {
          queryClient.invalidateQueries({ queryKey: ['admin-billing-fiscal'] });
          setFiscalTicket(t as FacturaTicketData);
        }}
      />

      <ManualInvoiceDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        condicionIvaEmisor={establishment?.condicion_iva || 'monotributo'}
        onAuthorized={(t) => setFiscalTicket(t)}
      />

      <FiscalTicketDialog
        open={!!fiscalTicket}
        onOpenChange={(v) => { if (!v) setFiscalTicket(null); }}
        data={fiscalTicket}
        emisor={{
          nombre: (establishment as any)?.name,
          razon_social: (establishment as any)?.razon_social,
          cuit: (establishment as any)?.cuit,
          domicilio: (establishment as any)?.domicilio_comercial,
          condicion_iva: establishment?.condicion_iva,
        }}
      />
    </div>
  );
}

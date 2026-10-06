import { useMemo, useState } from 'react';
import InvoiceScanDialog, { type ParsedInvoice } from '@/components/shared/InvoiceScanDialog';
import InvoiceItemsReviewDialog from '@/components/shared/InvoiceItemsReviewDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, X, ShoppingCart, Trash2, Pencil, TrendingDown, Truck, Package, ScanLine } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import UnitCombobox from './UnitCombobox';
import DuplicatePurchaseDialog from '@/components/shared/DuplicatePurchaseDialog';
import { findSimilarPurchases, type SimilarPurchase } from '@/lib/duplicatePurchase';


const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'check', label: 'Cheque' },
  { value: 'account', label: 'Cuenta corriente / A pagar' },
];
const paymentLabel = (v?: string | null) => PAYMENT_METHODS.find(p => p.value === v)?.label ?? 'Otro';

const DEFAULT_UNITS = ['kg', 'g', 'Lt', 'ml', 'unidad', 'bulto', 'docena', 'caja'];
const PERIODS = [
  { value: 'month', label: 'Este mes' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo' },
];

interface Line {
  item_name: string;
  quantity: string;
  unit: string;
  unit_price: string;
  line_total: string;
  lastEdited: 'unit' | 'total';
}

const emptyLine: Line = { item_name: '', quantity: '', unit: 'kg', unit_price: '', line_total: '', lastEdited: 'unit' };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mantiene sincronizados cantidad, precio unitario y monto total de la línea. */
function syncLine(line: Line, changed: 'quantity' | 'unit_price' | 'line_total'): Line {
  const qty = Number(line.quantity) || 0;
  if (changed === 'unit_price') {
    const price = Number(line.unit_price) || 0;
    return { ...line, lastEdited: 'unit', line_total: line.unit_price === '' ? '' : String(round2(qty * price)) };
  }
  if (changed === 'line_total') {
    const total = Number(line.line_total) || 0;
    return { ...line, lastEdited: 'total', unit_price: line.line_total === '' || qty <= 0 ? '' : String(round2(total / qty)) };
  }
  // cambió la cantidad: recalculamos el campo que NO editó la persona
  if (line.lastEdited === 'total') {
    const total = Number(line.line_total) || 0;
    return { ...line, unit_price: qty > 0 && line.line_total !== '' ? String(round2(total / qty)) : '' };
  }
  const price = Number(line.unit_price) || 0;
  return { ...line, line_total: line.unit_price === '' ? '' : String(round2(qty * price)) };
}

const lineAmount = (l: Line) => {
  const total = Number(l.line_total);
  if (l.line_total !== '' && !Number.isNaN(total)) return total;
  return (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
};

const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

function periodStart(period: string): string | null {
  const now = new Date();
  if (period === 'all') return null;
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const d = new Date(now);
  d.setDate(d.getDate() - Number(period));
  return d.toISOString().split('T')[0];
}

export default function SimplePurchasesTab() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState('month');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Gasto espejo generado automáticamente por esta compra (no es un duplicado). */
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [showScan, setShowScan] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [parsedInvoices, setParsedInvoices] = useState<ParsedInvoice[]>([]);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [dupMatches, setDupMatches] = useState<SimilarPurchase[]>([]);
  const [checkingDup, setCheckingDup] = useState(false);


  const from = periodStart(period);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['simple-purchases', establishmentId, period],
    queryFn: async () => {
      let q = db
        .from('purchase_invoices')
        .select('id, supplier, invoice_date, total, notes, payment_method, finance_transaction_id, purchase_invoice_items(id, item_name, quantity, unit, unit_price, ingredients(name, unit))')
        .eq('establishment_id', establishmentId!)
        .order('invoice_date', { ascending: false })
        .limit(200);
      if (from) q = q.gte('invoice_date', from);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const suppliers = useMemo(
    () => Array.from(new Set<string>(invoices.map((i: any) => i.supplier).filter(Boolean))),
    [invoices]
  );

  const summary = useMemo(() => {
    const total = invoices.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
    const bySupplier: Record<string, number> = {};
    const byItem: Record<string, number> = {};
    invoices.forEach((inv: any) => {
      bySupplier[inv.supplier] = (bySupplier[inv.supplier] || 0) + Number(inv.total || 0);
      (inv.purchase_invoice_items || []).forEach((it: any) => {
        const name = it.item_name || it.ingredients?.name || 'Sin detalle';
        byItem[name] = (byItem[name] || 0) + Number(it.quantity || 0) * Number(it.unit_price || 0);
      });
    });
    const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    return { total, topSupplier: top(bySupplier), topItem: top(byItem), count: invoices.length };
  }, [invoices]);

  const usedUnits = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv: any) =>
      (inv.purchase_invoice_items || []).forEach((it: any) => {
        const u = it.unit || it.ingredients?.unit;
        if (u) set.add(u);
      })
    );
    return Array.from(set);
  }, [invoices]);

  const unitOptions = useMemo(() => {
    const seen = new Map<string, string>();
    [...DEFAULT_UNITS, ...usedUnits, ...customUnits].forEach(u => {
      const key = u.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, u.trim());
    });
    return Array.from(seen.values());
  }, [usedUnits, customUnits]);

  const updateLine = (idx: number, patch: Partial<Line>, changed?: 'quantity' | 'unit_price' | 'line_total') =>
    setLines(prev => prev.map((x, i) => (i === idx ? (changed ? syncLine({ ...x, ...patch }, changed) : { ...x, ...patch }) : x)));

  const linesTotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  const resetForm = () => {
    setEditingId(null);
    setEditingTxId(null);
    setSupplier('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setPaymentMethod('cash');
    setLines([{ ...emptyLine }]);
    setReceiptPath(null);
  };

  const { data: establishment } = useQuery({
    queryKey: ['establishment-ai-invoice-reader', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('establishments')
        .select('id, ai_invoice_reader')
        .eq('id', establishmentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });
  const aiReaderEnabled = !!(establishment as any)?.ai_invoice_reader;

  /** Abre la revisión de ítems con lo leído de las facturas. */
  const handleParsedInvoice = (invs: ParsedInvoice[]) => {
    setParsedInvoices(invs);
    setShowReview(true);
  };

  const openNew = () => { resetForm(); setOpen(true); };

  const openEdit = (inv: any) => {
    setEditingId(inv.id);
    setEditingTxId(inv.finance_transaction_id ?? null);
    setSupplier(inv.supplier || '');
    setInvoiceDate(inv.invoice_date);
    setNotes(inv.notes || '');
    setPaymentMethod(inv.payment_method || 'cash');
    setLines(
      (inv.purchase_invoice_items || []).length
        ? inv.purchase_invoice_items.map((it: any) => ({
            item_name: it.item_name || it.ingredients?.name || '',
            quantity: String(it.quantity ?? ''),
            unit: it.unit || it.ingredients?.unit || 'kg',
            unit_price: String(it.unit_price ?? ''),
            line_total: String(round2(Number(it.quantity || 0) * Number(it.unit_price || 0))),
            lastEdited: 'unit' as const,
          }))
        : [{ ...emptyLine }]
    );
    setOpen(true);
  };

  /** Antes de guardar avisa si la misma compra ya fue cargada (Stock o Movimientos). */
  const attemptSave = async () => {
    const valid = lines.filter(l => l.item_name.trim() && Number(l.quantity) > 0);
    const total = round2(valid.reduce((s, l) => s + lineAmount(l), 0));
    if (supplier.trim() && total > 0 && establishmentId) {
      setCheckingDup(true);
      try {
        const matches = await findSimilarPurchases({
          establishmentId,
          supplier,
          date: invoiceDate,
          amount: total,
          excludePurchaseId: editingId,
          excludeTransactionId: editingTxId,
        });
        if (matches.length > 0) {
          setDupMatches(matches);
          return;
        }
      } catch (e) {
        console.error('findSimilarPurchases', e);
      } finally {
        setCheckingDup(false);
      }
    }
    saveMutation.mutate();
  };

  const saveMutation = useMutation({

    mutationFn: async () => {
      const valid = lines.filter(l => l.item_name.trim() && Number(l.quantity) > 0);
      if (!supplier.trim()) throw new Error('Ingresá el proveedor');
      if (valid.length === 0) throw new Error('Agregá al menos un ítem con nombre y cantidad');
      const total = round2(valid.reduce((s, l) => s + lineAmount(l), 0));

      let invoiceId = editingId;
      if (editingId) {
        const { error } = await db
          .from('purchase_invoices')
          .update({ supplier: supplier.trim(), invoice_date: invoiceDate, total, notes: notes || null, payment_method: paymentMethod })
          .eq('id', editingId);
        if (error) throw error;
        const { error: delErr } = await db.from('purchase_invoice_items').delete().eq('invoice_id', editingId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await db
          .from('purchase_invoices')
          .insert({
            establishment_id: establishmentId!,
            supplier: supplier.trim(),
            invoice_date: invoiceDate,
            total,
            notes: notes || null,
            payment_method: paymentMethod,
            auto_expense: true,
            receipt_url: receiptPath,
            created_by: session?.user?.id ?? null,
          })
          .select('id')
          .single();
        if (error) throw error;
        invoiceId = data.id;
      }

      const { error: itemsErr } = await db.from('purchase_invoice_items').insert(
        valid.map(l => {
          const qty = Number(l.quantity);
          return {
            invoice_id: invoiceId!,
            ingredient_id: null,
            item_name: l.item_name.trim(),
            unit: l.unit,
            quantity: qty,
            unit_price: qty > 0 ? round2(lineAmount(l) / qty) : 0,
          };
        })
      );
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      toast({ title: editingId ? 'Compra actualizada' : 'Compra registrada', description: 'El gasto se cargó como costo de mercadería.' });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await db.from('purchase_invoice_items').delete().eq('invoice_id', id);
      const { error } = await db.from('purchase_invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      toast({ title: 'Compra eliminada', description: 'También se quitó el gasto asociado.' });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: 'No se pudo eliminar', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Cargar compra
          </Button>
          {aiReaderEnabled && (
            <Button variant="secondary" className="gap-2" onClick={() => setShowScan(true)}>
              <ScanLine className="h-4 w-4" /> Leer factura con IA
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4" />Total comprado</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(summary.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.count} compras en el período</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Truck className="h-4 w-4" />Mayor proveedor</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold truncate">{summary.topSupplier?.[0] ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.topSupplier ? fmt(summary.topSupplier[1]) : 'Sin datos'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Package className="h-4 w-4" />Insumo con más gasto</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold truncate">{summary.topItem?.[0] ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.topItem ? fmt(summary.topItem[1]) : 'Sin datos'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Compras de materia prima</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Todavía no hay compras cargadas en este período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1 flex-wrap">
                        {inv.supplier}
                        <Badge variant="outline" className="font-normal text-[10px]">{paymentLabel(inv.payment_method)}</Badge>
                      </div>
                      {inv.notes && <p className="text-xs text-muted-foreground mt-0.5">{inv.notes}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(inv.purchase_invoice_items || []).map((it: any) => (
                          <Badge key={it.id} variant="secondary" className="font-normal">
                            {(it.item_name || it.ingredients?.name || 'Ítem')} · {Number(it.quantity)}{it.unit || it.ingredients?.unit || ''}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(Number(inv.total))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(inv)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(inv.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar compra' : 'Cargar compra de materia prima'}</DialogTitle>
            <DialogDescription>
              Se registra automáticamente como gasto de "Costo de mercadería" en la fecha de la compra. No afecta el arqueo de caja: el dinero no sale del cajón.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Proveedor</Label>
                <Input
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  placeholder="Ej: Carnicería Don José"
                  list="simple-suppliers"
                />
                <datalist id="simple-suppliers">
                  {suppliers.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Qué se compró</Label>
              <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                <span className="col-span-4">Ítem</span>
                <span className="col-span-2">Cantidad</span>
                <span className="col-span-2">Unidad</span>
                <span className="col-span-2">$ x unidad</span>
                <span className="col-span-2">Monto total</span>
              </div>
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-4"
                    placeholder="Carne picada"
                    value={l.item_name}
                    onChange={e => updateLine(idx, { item_name: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    inputMode="decimal"
                    placeholder="Cant."
                    value={l.quantity}
                    onChange={e => updateLine(idx, { quantity: e.target.value }, 'quantity')}
                  />
                  <UnitCombobox
                    className="col-span-2 w-full"
                    units={unitOptions}
                    value={l.unit}
                    onChange={v => updateLine(idx, { unit: v })}
                    onCreate={u => setCustomUnits(p => [...p, u])}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    inputMode="decimal"
                    placeholder="$ x unidad"
                    value={l.unit_price}
                    onChange={e => updateLine(idx, { unit_price: e.target.value }, 'unit_price')}
                  />
                  <Input
                    className="col-span-1"
                    type="number"
                    inputMode="decimal"
                    placeholder="Total"
                    value={l.line_total}
                    onChange={e => updateLine(idx, { line_total: e.target.value }, 'line_total')}
                  />
                  <Button

                    size="icon"
                    variant="ghost"
                    className="col-span-1 h-9 w-9 text-muted-foreground"
                    onClick={() => setLines(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setLines(p => [...p, { ...emptyLine }])}>
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Aclaración / notas (opcional)</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">Total de la compra</span>
              <span className="text-xl font-bold">{fmt(linesTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={attemptSave} disabled={saveMutation.isPending || checkingDup}>
              {saveMutation.isPending ? 'Guardando…' : checkingDup ? 'Verificando…' : 'Guardar compra'}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar compra</DialogTitle>
            <DialogDescription>También se elimina el gasto asociado en Caja. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DuplicatePurchaseDialog
        open={dupMatches.length > 0}
        onOpenChange={v => { if (!v) setDupMatches([]); }}
        matches={dupMatches}
        pending={saveMutation.isPending}
        onConfirm={() => { setDupMatches([]); saveMutation.mutate(); }}
      />
      <InvoiceScanDialog open={showScan} onOpenChange={setShowScan} onParsed={handleParsedInvoice} />
      <InvoiceItemsReviewDialog
        open={showReview}
        onOpenChange={setShowReview}
        invoices={parsedInvoices}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['simple-purchases'] })}
      />

    </div>
  );
}

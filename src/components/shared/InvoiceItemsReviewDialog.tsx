import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2, PackagePlus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ParsedInvoice } from './InvoiceScanDialog';

type Destination = 'link' | 'create' | 'expense';

interface Line {
  key: string;
  item_name: string;
  quantity: string;
  unit: string;
  unit_price: string;
  destination: Destination;
  product_id: string | null;
}

interface Group {
  key: string;
  supplier: string;
  invoice_number: string;
  invoice_date: string;
  total: string;
  receipt_path?: string | null;
  lines: Line[];
}

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n || 0);

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function matchProduct(name: string, products: { id: string; name: string }[]) {
  const n = norm(name);
  if (!n) return null;
  const exact = products.find(p => norm(p.name) === n);
  if (exact) return exact;
  const inc = products.find(p => {
    const pn = norm(p.name);
    return pn.length > 3 && (n.includes(pn) || pn.includes(n));
  });
  if (inc) return inc;
  const words = n.split(' ').filter(w => w.length > 3);
  if (words.length) {
    const scored = products
      .map(p => {
        const pn = norm(p.name);
        return { p, score: words.filter(w => pn.includes(w)).length };
      })
      .sort((a, b) => b.score - a.score)[0];
    if (scored && scored.score >= Math.min(2, words.length)) return scored.p;
  }
  return null;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'account', label: 'Cuenta corriente' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoices: ParsedInvoice[];
  onSaved?: () => void;
}

export default function InvoiceItemsReviewDialog({ open, onOpenChange, invoices, onSaved }: Props) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-invoice-review', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, direct_stock, cost')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId && open,
  });

  useEffect(() => {
    if (!open) return;
    setGroups(
      invoices.map((inv, gi) => ({
        key: `g${gi}`,
        supplier: inv.supplier || '',
        invoice_number: inv.invoice_number || '',
        invoice_date: inv.invoice_date || new Date().toISOString().slice(0, 10),
        total: inv.total ? String(inv.total) : '',
        receipt_path: inv.receipt_path,
        lines: (inv.items || []).map((it, li) => ({
          key: `g${gi}l${li}`,
          item_name: it.item_name || '',
          quantity: it.quantity ? String(it.quantity) : '1',
          unit: it.unit || 'unidad',
          unit_price: it.unit_price
            ? String(it.unit_price)
            : String(it.quantity ? (it.line_total || 0) / it.quantity : it.line_total || 0),
          destination: 'expense' as Destination,
          product_id: null,
        })),
      }))
    );
  }, [open, invoices]);

  // Auto-vinculación cuando llegan los productos
  useEffect(() => {
    if (!open || !products.length) return;
    setGroups(prev =>
      prev.map(g => ({
        ...g,
        lines: g.lines.map(l => {
          if (l.product_id || l.destination !== 'expense') return l;
          const m = matchProduct(l.item_name, products as any);
          return m ? { ...l, destination: 'link' as Destination, product_id: m.id } : l;
        }),
      }))
    );
  }, [products, open]);

  const updateLine = (gk: string, lk: string, patch: Partial<Line>) =>
    setGroups(prev => prev.map(g => g.key !== gk ? g : { ...g, lines: g.lines.map(l => l.key === lk ? { ...l, ...patch } : l) }));

  const removeLine = (gk: string, lk: string) =>
    setGroups(prev => prev.map(g => g.key !== gk ? g : { ...g, lines: g.lines.filter(l => l.key !== lk) }));

  const lineAmount = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
  const groupSum = (g: Group) => g.lines.reduce((s, l) => s + lineAmount(l), 0);

  const totals = useMemo(() => {
    const items = groups.reduce((s, g) => s + g.lines.length, 0);
    const amount = groups.reduce((s, g) => s + (Number(g.total) || groupSum(g)), 0);
    return { invoices: groups.length, items, amount };
  }, [groups]);

  const bulkLinkSuggested = () =>
    setGroups(prev => prev.map(g => ({
      ...g,
      lines: g.lines.map(l => {
        if (l.destination === 'link' && l.product_id) return l;
        const m = matchProduct(l.item_name, products as any);
        return m ? { ...l, destination: 'link' as Destination, product_id: m.id } : l;
      }),
    })));

  const bulkExpenseOnly = () =>
    setGroups(prev => prev.map(g => ({ ...g, lines: g.lines.map(l => ({ ...l, destination: 'expense' as Destination, product_id: null })) })));

  const saveMutation = useMutation({
    mutationFn: async () => {
      let stockApplied = 0;
      for (const g of groups) {
        const valid = g.lines.filter(l => l.item_name.trim() && Number(l.quantity) > 0);
        if (!valid.length) continue;
        const total = Number(g.total) || groupSum(g);

        const { data: inv, error } = await supabase
          .from('purchase_invoices')
          .insert({
            establishment_id: establishmentId!,
            supplier: g.supplier.trim() || 'Proveedor',
            invoice_number: g.invoice_number || null,
            invoice_date: g.invoice_date,
            total: Math.round(total * 100) / 100,
            notes: 'Cargada con lector de facturas IA',
            payment_method: paymentMethod,
            auto_expense: true,
            receipt_url: g.receipt_path ?? null,
            created_by: session?.user?.id ?? null,
          })
          .select('id')
          .single();
        if (error) throw error;

        const { error: itemsErr } = await supabase.from('purchase_invoice_items').insert(
          valid.map(l => ({
            invoice_id: inv.id,
            ingredient_id: null,
            item_name: l.item_name.trim(),
            unit: l.unit,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price) || 0,
          }))
        );
        if (itemsErr) throw itemsErr;

        const stockLines = valid
          .filter(l => l.destination !== 'expense')
          .map(l => ({
            item_name: l.item_name.trim(),
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price) || 0,
            product_id: l.destination === 'link' ? l.product_id : null,
            create_product: l.destination === 'create' ? 'true' : 'false',
          }));

        if (stockLines.length) {
          const { data: res, error: rpcErr } = await supabase.rpc('apply_purchase_stock', {
            _invoice_id: inv.id,
            _lines: stockLines as any,
          });
          if (rpcErr) throw rpcErr;
          stockApplied += Number((res as any)?.applied ?? 0);
        }
      }
      return stockApplied;
    },
    onSuccess: (stockApplied) => {
      ['simple-purchases', 'finance-transactions', 'cashier-finance-transactions', 'products', 'stock-movements', 'ingredients', 'cash-summary']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(
        stockApplied
          ? `Compra registrada · ${stockApplied} producto(s) actualizados en stock y costo`
          : 'Compra registrada'
      );
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudo guardar la compra'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Revisar lectura de facturas</DialogTitle>
          <DialogDescription>
            Revisá los ítems y elegí a qué producto se carga cada uno. Al confirmar se registra la salida de dinero, se suma el stock y se recalcula el costo.
          </DialogDescription>
        </DialogHeader>

        {/* Resumen + acciones masivas */}
        <div className="flex flex-wrap items-center gap-2 justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <div className="text-sm font-medium tabular-nums">
            {totals.invoices} factura{totals.invoices === 1 ? '' : 's'} · {totals.items} ítems · {money(totals.amount)}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={bulkLinkSuggested}>Vincular sugeridos</Button>
            <Button size="sm" variant="ghost" onClick={bulkExpenseOnly}>Todos solo gasto</Button>
          </div>
        </div>

        <div className="space-y-4">
          {groups.map(g => {
            const sum = groupSum(g);
            const declared = Number(g.total) || 0;
            const ok = !declared || Math.abs(declared - sum) <= Math.max(1, declared * 0.02);
            return (
              <div key={g.key} className="rounded-lg border overflow-hidden">
                <div className="flex flex-wrap items-end gap-3 bg-muted/50 px-3 py-2 border-b">
                  <div className="flex-1 min-w-[160px]">
                    <Label className="text-xs text-muted-foreground">Proveedor</Label>
                    <Input value={g.supplier} onChange={e => setGroups(p => p.map(x => x.key === g.key ? { ...x, supplier: e.target.value } : x))} className="h-8" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs text-muted-foreground">N.º</Label>
                    <Input value={g.invoice_number} onChange={e => setGroups(p => p.map(x => x.key === g.key ? { ...x, invoice_number: e.target.value } : x))} className="h-8" />
                  </div>
                  <div className="w-36">
                    <Label className="text-xs text-muted-foreground">Fecha</Label>
                    <Input type="date" value={g.invoice_date} onChange={e => setGroups(p => p.map(x => x.key === g.key ? { ...x, invoice_date: e.target.value } : x))} className="h-8" />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs text-muted-foreground">Total</Label>
                    <Input value={g.total} onChange={e => setGroups(p => p.map(x => x.key === g.key ? { ...x, total: e.target.value.replace(',', '.') } : x))} className="h-8 text-right tabular-nums" />
                  </div>
                  <Badge variant={ok ? 'secondary' : 'destructive'} className="mb-1">
                    {ok ? 'Coincide' : `Revisar · ítems ${money(sum)}`}
                  </Badge>
                </div>

                <div className="divide-y">
                  {g.lines.map((l, idx) => (
                    <div key={l.key} className={`px-3 py-2 grid gap-2 md:grid-cols-[1fr_70px_90px_110px_1fr_32px] items-center ${idx % 2 ? 'bg-muted/20' : ''}`}>
                      <Input value={l.item_name} onChange={e => updateLine(g.key, l.key, { item_name: e.target.value })} className="h-8" placeholder="Ítem" />
                      <Input value={l.quantity} onChange={e => updateLine(g.key, l.key, { quantity: e.target.value.replace(',', '.') })} className="h-8 text-right tabular-nums" />
                      <Input value={l.unit} onChange={e => updateLine(g.key, l.key, { unit: e.target.value })} className="h-8" />
                      <Input value={l.unit_price} onChange={e => updateLine(g.key, l.key, { unit_price: e.target.value.replace(',', '.') })} className="h-8 text-right tabular-nums" />
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm tabular-nums text-muted-foreground w-24 text-right shrink-0">{money(lineAmount(l))}</span>
                        <DestinationPicker
                          line={l}
                          products={products as any}
                          onChange={patch => updateLine(g.key, l.key, patch)}
                        />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(g.key, l.key)} aria-label="Quitar ítem">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {!g.lines.length && <p className="px-3 py-4 text-sm text-muted-foreground">Sin ítems leídos en esta factura.</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Label className="text-sm">Forma de pago</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !totals.items}>
            {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</> : 'Confirmar y cargar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinationPicker({
  line, products, onChange,
}: {
  line: Line;
  products: { id: string; name: string }[];
  onChange: (patch: Partial<Line>) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.id === line.product_id);

  const label =
    line.destination === 'link' && selected ? selected.name
      : line.destination === 'create' ? 'Crear producto'
      : 'Solo gasto';

  const tone =
    line.destination === 'link' && selected ? 'text-emerald-600 border-emerald-600/40'
      : line.destination === 'create' ? 'text-sky-600 border-sky-600/40'
      : 'text-muted-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-8 flex-1 min-w-0 justify-between ${tone}`}>
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 z-50 bg-popover" align="end">
        <Command>
          <CommandInput placeholder="Buscar producto..." />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onChange({ destination: 'expense', product_id: null }); setOpen(false); }}>
                Solo gasto (no va a stock)
                {line.destination === 'expense' && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
              <CommandItem onSelect={() => { onChange({ destination: 'create', product_id: null }); setOpen(false); }}>
                <PackagePlus className="mr-2 h-4 w-4" /> Crear producto nuevo
                {line.destination === 'create' && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Productos">
              {products.map(p => (
                <CommandItem key={p.id} value={p.name} onSelect={() => { onChange({ destination: 'link', product_id: p.id }); setOpen(false); }}>
                  <span className="truncate">{p.name}</span>
                  {line.product_id === p.id && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

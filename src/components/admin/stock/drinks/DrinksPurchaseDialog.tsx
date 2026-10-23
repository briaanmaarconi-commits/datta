import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { toArgDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtMoney, itemKey, type DrinkItem } from './useDrinksInventory';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'account', label: 'Cuenta corriente / A pagar' },
];

interface Line { key: string; quantity: string; price: string }
const emptyLine: Line = { key: '', quantity: '', price: '' };
const num = (s: string) => Number(s.replace(',', '.')) || 0;

/** Compra de bebidas: suma las unidades o botellas al stock y queda como gasto en Costos. */
export default function DrinksPurchaseDialog({ open, onOpenChange, items, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: DrinkItem[];
  onSaved: () => void;
}) {
  const { establishmentId } = useAuth();
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(() => toArgDate(new Date()));
  const [payment, setPayment] = useState('cash');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine]);

  useEffect(() => {
    if (!open) return;
    setSupplier('');
    setDate(toArgDate(new Date()));
    setPayment('cash');
    setNotes('');
    setLines([emptyLine]);
  }, [open]);

  const byKey = new Map(items.map(i => [itemKey(i), i]));
  const valid = lines.filter(l => byKey.has(l.key) && num(l.quantity) > 0);
  const total = valid.reduce((s, l) => s + num(l.quantity) * num(l.price), 0);
  const setLine = (n: number, patch: Partial<Line>) => setLines(ls => ls.map((l, i) => (i === n ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: async () => {
      if (!supplier.trim()) throw new Error('Ingresá el proveedor');
      if (valid.length === 0) throw new Error('Agregá al menos una bebida con cantidad');
      const { error } = await db.rpc('register_drinks_purchase', {
        _est: establishmentId,
        _supplier: supplier.trim(),
        _date: date,
        _payment_method: payment,
        _notes: notes.trim() || null,
        _lines: valid.map(l => {
          const it = byKey.get(l.key)!;
          return { kind: it.kind, id: it.id, quantity: num(l.quantity), unit_price: num(l.price) };
        }),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Compra registrada: el stock ya se sumó y el gasto quedó en Costos');
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo registrar la compra'),
  });

  const products = items.filter(i => i.kind === 'product');
  const bottles = items.filter(i => i.kind === 'bottle');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar compra de bebidas</DialogTitle>
          <DialogDescription>Las unidades o botellas se suman al inventario y el total se carga como gasto.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Proveedor</Label>
            <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Ej.: Distribuidora Norte" />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Forma de pago</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Qué compraste</Label>
          {lines.map((l, n) => {
            const it = byKey.get(l.key);
            const unit = it?.kind === 'bottle' ? 'botellas' : 'unidades';
            return (
              <div key={n} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-center">
                <Select value={l.key} onValueChange={v => setLine(n, { key: v })}>
                  <SelectTrigger className="col-span-2 sm:col-span-1"><SelectValue placeholder="Elegí la bebida" /></SelectTrigger>
                  <SelectContent>
                    {products.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Bebidas por unidad</SelectLabel>
                        {products.map(p => <SelectItem key={itemKey(p)} value={itemKey(p)}>{p.name}</SelectItem>)}
                      </SelectGroup>
                    )}
                    {bottles.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Botellas para tragos</SelectLabel>
                        {bottles.map(b => <SelectItem key={itemKey(b)} value={itemKey(b)}>{b.name} ({b.bottle_ml} ml)</SelectItem>)}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <Input inputMode="decimal" placeholder={unit} value={l.quantity} onChange={e => setLine(n, { quantity: e.target.value })} />
                <Input inputMode="decimal" placeholder={it?.kind === 'bottle' ? '$ por botella' : '$ por unidad'} value={l.price} onChange={e => setLine(n, { price: e.target.value })} />
                <Button variant="ghost" size="icon" className="justify-self-end" disabled={lines.length === 1}
                  onClick={() => setLines(ls => ls.filter((_, i) => i !== n))} aria-label="Quitar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLines(ls => [...ls, emptyLine])}>
            <Plus className="h-4 w-4" /> Agregar otra bebida
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Notas (opcional)</Label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: factura 0001-0000123" />
        </div>

        <DialogFooter className="items-center">
          <span className="mr-auto text-sm">Total: <strong>{fmtMoney(total)}</strong></span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar compra</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

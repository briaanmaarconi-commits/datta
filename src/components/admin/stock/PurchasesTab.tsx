import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, X, ShoppingCart } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface InvoiceItem {
  ingredient_id: string;
  quantity: number;
  unit_price: number;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'check', label: 'Cheque' },
  { value: 'account', label: 'Cuenta corriente / A pagar' },
];
const paymentLabel = (v?: string | null) => PAYMENT_METHODS.find(p => p.value === v)?.label ?? 'Otro';

export default function PurchasesTab() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplier: '', invoice_number: '', notes: '', payment_method: 'cash' });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [newItem, setNewItem] = useState<InvoiceItem>({ ingredient_id: '', quantity: 0, unit_price: 0 });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('ingredients').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['purchase_invoices', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('purchase_invoices').select('*, purchase_invoice_items(*, ingredients(name, unit))')
        .eq('establishment_id', establishmentId!).order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const addItem = () => {
    if (!newItem.ingredient_id || !newItem.quantity) return;
    setItems(prev => [...prev, { ...newItem }]);
    setNewItem({ ingredient_id: '', quantity: 0, unit_price: 0 });
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Create invoice
      const { data: inv, error: invErr } = await db.from('purchase_invoices').insert({
        establishment_id: establishmentId!, supplier: form.supplier,
        invoice_number: form.invoice_number || null, notes: form.notes || null,
        payment_method: form.payment_method,
        total, created_by: session?.user?.id ?? null,
      }).select().single();
      if (invErr) throw invErr;

      // Create items
      const itemsData = items.map(i => ({ invoice_id: inv.id, ingredient_id: i.ingredient_id, quantity: i.quantity, unit_price: i.unit_price }));
      const { error: itemsErr } = await db.from('purchase_invoice_items').insert(itemsData);
      if (itemsErr) throw itemsErr;

      // Update stock & create movements
      for (const item of items) {
        // Update current_stock
        const ing = ingredients.find((ig: any) => ig.id === item.ingredient_id);
        if (ing) {
          await db.from('ingredients').update({ current_stock: Number(ing.current_stock) + item.quantity, cost_per_unit: item.unit_price }).eq('id', item.ingredient_id);
        }
        // Create movement
        await db.from('stock_movements').insert({
          establishment_id: establishmentId!, ingredient_id: item.ingredient_id,
          type: 'entry' as any, quantity: item.quantity, reason: `Compra - ${form.supplier}`,
          reference_id: inv.id, created_by: session?.user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Compra registrada y stock actualizado' });
      setOpen(false);
      setForm({ supplier: '', invoice_number: '', notes: '', payment_method: 'cash' });
      setItems([]);
    },
    onError: () => toast({ title: 'Error al registrar compra', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">Registrá compras de mercadería para actualizar el stock</p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Nueva compra</Button>
      </div>

      {/* Recent purchases */}
      {invoices.length > 0 ? (
        <div className="space-y-3">
          {invoices.map((inv: any) => (
            <Card key={inv.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{inv.supplier}</CardTitle>
                  <div className="flex items-center gap-2">
                    {inv.invoice_number && <Badge variant="outline">#{inv.invoice_number}</Badge>}
                    <Badge variant="outline">{paymentLabel(inv.payment_method)}</Badge>
                    <span className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString('es-AR')}</span>
                    <Badge>${Number(inv.total).toFixed(2)}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(inv.purchase_invoice_items || []).map((item: any) => (
                    <Badge key={item.id} variant="secondary">
                      {item.quantity} {item.ingredients?.unit} {item.ingredients?.name} (${Number(item.unit_price).toFixed(2)}/u)
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay compras registradas</p>
          </CardContent>
        </Card>
      )}

      {/* New purchase dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar compra</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Proveedor</Label>
                <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Nombre del proveedor" />
              </div>
              <div>
                <Label>Nro. factura (opcional)</Label>
                <Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
              </div>
            </div>

            {/* Add items */}
            <div className="border rounded-md p-3 space-y-3">
              <Label className="font-medium">Ítems de la compra</Label>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select value={newItem.ingredient_id} onValueChange={v => setNewItem(n => ({ ...n, ingredient_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Ingrediente" /></SelectTrigger>
                    <SelectContent>{ingredients.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Input className="w-24" type="number" placeholder="Cant." value={newItem.quantity || ''} onChange={e => setNewItem(n => ({ ...n, quantity: Number(e.target.value) }))} />
                <Input className="w-28" type="number" step="0.01" placeholder="$/u" value={newItem.unit_price || ''} onChange={e => setNewItem(n => ({ ...n, unit_price: Number(e.target.value) }))} />
                <Button size="sm" onClick={addItem} disabled={!newItem.ingredient_id || !newItem.quantity}><Plus className="h-4 w-4" /></Button>
              </div>

              {items.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ingrediente</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">$/u</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const ing = ingredients.find((i: any) => i.id === item.ingredient_id) as any;
                      return (
                        <TableRow key={idx}>
                          <TableCell>{ing?.name} ({ing?.unit})</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">${item.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(idx)}><X className="h-3 w-3" /></Button></TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">${total.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <Label>Forma de pago</Label>
              <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Aclaración / notas (opcional)</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.supplier.trim() || items.length === 0 || saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : 'Registrar compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

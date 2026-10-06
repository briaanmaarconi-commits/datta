import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, X, ShoppingCart, Trash2, Wrench, Pencil } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import IngredientCombobox from './IngredientCombobox';

const WASTE_REASONS = ['Vencimiento', 'Se quemó', 'Se cayó / derramó', 'Mala calidad', 'Sobrante del día', 'Otro'];
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  entry: { label: 'Entrada', color: 'bg-green-500/20 text-green-700 border-green-500/30' },
  sale: { label: 'Venta', color: 'bg-blue-500/20 text-blue-700 border-blue-500/30' },
  waste: { label: 'Merma', color: 'bg-red-500/20 text-red-700 border-red-500/30' },
  adjustment: { label: 'Ajuste', color: 'bg-purple-500/20 text-purple-700 border-purple-500/30' },
  consumption: { label: 'Cortesía', color: 'bg-pink-500/20 text-pink-700 border-pink-500/30' },
};

export default function MovementsTab() {
  const [subTab, setSubTab] = useState('purchases');

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="purchases" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" />Compras</TabsTrigger>
          <TabsTrigger value="waste" className="gap-1.5"><Trash2 className="h-3.5 w-3.5" />Mermas</TabsTrigger>
          <TabsTrigger value="adjustments" className="gap-1.5"><Wrench className="h-3.5 w-3.5" />Ajustes</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases"><PurchasesSection /></TabsContent>
        <TabsContent value="waste"><WasteSection /></TabsContent>
        <TabsContent value="adjustments"><AdjustmentsSection /></TabsContent>
        <TabsContent value="history"><HistorySection /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---- PURCHASES ----
interface InvoiceItem { ingredient_id: string; quantity: number; unit_price: number; purchase_unit: string; }

// Conversion factor from purchase unit -> base unit (the ingredient's unit)
function getConversionFactor(purchaseUnit: string, baseUnit: string): number | null {
  if (purchaseUnit === baseUnit) return 1;
  const map: Record<string, Record<string, number>> = {
    kg: { g: 1000 },
    g: { kg: 0.001 },
    l: { ml: 1000 },
    ml: { l: 0.001 },
  };
  return map[purchaseUnit]?.[baseUnit] ?? null;
}

// Available purchase units for a given base unit
function getPurchaseUnits(baseUnit: string): string[] {
  if (baseUnit === 'g' || baseUnit === 'kg') return ['kg', 'g'];
  if (baseUnit === 'ml' || baseUnit === 'l') return ['l', 'ml'];
  return [baseUnit];
}

function PurchasesSection() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [form, setForm] = useState({ supplier: '', invoice_number: '', notes: '' });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [priceMode, setPriceMode] = useState<'total' | 'unit'>('total');
  const [priceInput, setPriceInput] = useState<number>(0);
  const [newItem, setNewItem] = useState<InvoiceItem>({ ingredient_id: '', quantity: 0, unit_price: 0, purchase_unit: '' });

  const resetForm = () => {
    setEditingInvoice(null);
    setForm({ supplier: '', invoice_number: '', notes: '' });
    setItems([]);
    setNewItem({ ingredient_id: '', quantity: 0, unit_price: 0, purchase_unit: '' });
    setPriceInput(0);
    setPriceMode('total');
  };

  const openNew = () => { resetForm(); setOpen(true); };

  const openEdit = (inv: any) => {
    setEditingInvoice(inv);
    setForm({ supplier: inv.supplier || '', invoice_number: inv.invoice_number || '', notes: inv.notes || '' });
    setItems((inv.purchase_invoice_items || []).map((it: any) => ({
      ingredient_id: it.ingredient_id,
      quantity: Number(it.purchase_quantity ?? it.quantity),
      unit_price: Number(it.purchase_quantity ? it.unit_price * (Number(it.quantity) / Number(it.purchase_quantity)) : it.unit_price),
      purchase_unit: it.purchase_unit ?? it.ingredients?.unit ?? '',
    })));
    setOpen(true);
  };

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

  const selectedNewIng = ingredients.find((i: any) => i.id === newItem.ingredient_id) as any;
  const purchaseUnits = selectedNewIng ? getPurchaseUnits(selectedNewIng.unit) : [];

  const addItem = () => {
    if (!newItem.ingredient_id || !newItem.quantity || !newItem.purchase_unit || !priceInput) return;
    const unitPrice = priceMode === 'total' ? priceInput / newItem.quantity : priceInput;
    setItems(prev => [...prev, { ...newItem, unit_price: unitPrice }]);
    setNewItem({ ingredient_id: '', quantity: 0, unit_price: 0, purchase_unit: '' });
    setPriceInput(0);
  };

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  // Helper: revert stock changes from a saved invoice (subtract previously added base quantities)
  const revertInvoiceStock = async (inv: any) => {
    const oldItems = inv.purchase_invoice_items || [];
    for (const it of oldItems) {
      const ing = ingredients.find((ig: any) => ig.id === it.ingredient_id) as any;
      if (ing) {
        const newStock = Math.max(0, Number(ing.current_stock) - Number(it.quantity));
        await db.from('ingredients').update({ current_stock: newStock }).eq('id', it.ingredient_id);
      }
    }
    // Delete old movements & items linked to this invoice
    await db.from('stock_movements').delete().eq('reference_id', inv.id);
    await db.from('purchase_invoice_items').delete().eq('invoice_id', inv.id);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let invoiceId: string;

      if (editingInvoice) {
        // Revert previous stock changes
        await revertInvoiceStock(editingInvoice);
        // Update invoice header
        const { error: updErr } = await db.from('purchase_invoices').update({
          supplier: form.supplier,
          invoice_number: form.invoice_number || null,
          notes: form.notes || null,
          total,
        }).eq('id', editingInvoice.id);
        if (updErr) throw updErr;
        invoiceId = editingInvoice.id;
      } else {
        const { data: inv, error: invErr } = await db.from('purchase_invoices').insert({
          establishment_id: establishmentId!, supplier: form.supplier,
          invoice_number: form.invoice_number || null, notes: form.notes || null,
          total, created_by: session?.user?.id ?? null,
        }).select().single();
        if (invErr) throw invErr;
        invoiceId = inv.id;
      }

      // Convert each item's purchased qty to the ingredient's base unit before storing/updating
      const itemsData = items.map(i => {
        const ing = ingredients.find((ig: any) => ig.id === i.ingredient_id) as any;
        const factor = ing ? (getConversionFactor(i.purchase_unit, ing.unit) ?? 1) : 1;
        const baseQty = i.quantity * factor;
        const baseUnitPrice = factor > 0 ? i.unit_price / factor : i.unit_price;
        return {
          invoice_id: invoiceId,
          ingredient_id: i.ingredient_id,
          quantity: baseQty,
          unit_price: baseUnitPrice,
          purchase_quantity: i.quantity,
          purchase_unit: i.purchase_unit,
        };
      });
      const { error: itemsErr } = await db.from('purchase_invoice_items').insert(itemsData);
      if (itemsErr) throw itemsErr;

      // Re-fetch fresh ingredient stock to apply additions correctly
      const { data: freshIng } = await db.from('ingredients').select('id, current_stock')
        .in('id', items.map(i => i.ingredient_id));
      const stockMap = new Map((freshIng || []).map((r: any) => [r.id, Number(r.current_stock)]));

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const baseRow = itemsData[idx];
        const currentStock = Number(stockMap.get(item.ingredient_id) ?? 0);
        // Solo actualizamos stock; el cost_per_unit lo recalcula el trigger SQL como promedio ponderado
        await db.from('ingredients').update({
          current_stock: currentStock + Number(baseRow.quantity),
        }).eq('id', item.ingredient_id);
        stockMap.set(item.ingredient_id, currentStock + Number(baseRow.quantity));

        await db.from('stock_movements').insert({
          establishment_id: establishmentId!, ingredient_id: item.ingredient_id,
          type: 'entry' as any, quantity: baseRow.quantity,
          reason: `Compra - ${form.supplier} (${item.quantity} ${item.purchase_unit})`,
          reference_id: invoiceId, created_by: session?.user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: editingInvoice ? 'Compra actualizada y stock recalculado' : 'Compra registrada y stock actualizado' });
      setOpen(false);
      resetForm();
    },
    onError: () => toast({ title: 'Error al guardar compra', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (inv: any) => {
      await revertInvoiceStock(inv);
      const { error } = await db.from('purchase_invoices').delete().eq('id', inv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Compra eliminada y stock revertido' });
    },
    onError: () => toast({ title: 'Error al eliminar', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Registrá compras de mercadería para actualizar el stock</p>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Nueva compra</Button>
      </div>

      {invoices.length > 0 ? invoices.map((inv: any) => (
        <Card key={inv.id}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">{inv.supplier}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {inv.invoice_number && <Badge variant="outline" className="text-xs">#{inv.invoice_number}</Badge>}
                <span className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString('es-AR')}</span>
                <Badge className="text-xs">${Number(inv.total).toFixed(0)}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(inv)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Estás seguro que querés eliminar la compra de {inv.supplier}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará la compra del {new Date(inv.created_at).toLocaleDateString('es-AR')} por ${Number(inv.total).toFixed(2)} y se revertirá el stock sumado a los ingredientes. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate(inv)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {(inv.purchase_invoice_items || []).map((item: any) => {
                const qty = item.purchase_quantity ?? item.quantity;
                const unit = item.purchase_unit ?? item.ingredients?.unit;
                return (
                  <Badge key={item.id} variant="secondary" className="text-xs">
                    {Number(qty).toLocaleString('es-AR')} {unit} {item.ingredients?.name}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )) : (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No hay compras registradas</CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingInvoice ? 'Editar compra' : 'Registrar compra'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Proveedor</Label><Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} /></div>
              <div><Label>Nro. factura (opcional)</Label><Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} /></div>
            </div>
            <div className="border rounded-md p-3 space-y-3">
              <Label className="font-medium">Ítems</Label>
              <div className="space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <Label className="text-xs text-muted-foreground">Ingrediente</Label>
                    <IngredientCombobox
                      ingredients={ingredients}
                      value={newItem.ingredient_id}
                      onChange={(v) => {
                        const ing = ingredients.find((i: any) => i.id === v) as any;
                        const defaultUnit = ing ? getPurchaseUnits(ing.unit)[0] : '';
                        setNewItem(n => ({ ...n, ingredient_id: v, purchase_unit: defaultUnit }));
                      }}
                    />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs text-muted-foreground">Cantidad</Label>
                    <Input type="number" placeholder="0" value={newItem.quantity || ''} onChange={e => setNewItem(n => ({ ...n, quantity: Number(e.target.value) }))} />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs text-muted-foreground">Unidad</Label>
                    <Select value={newItem.purchase_unit} onValueChange={v => setNewItem(n => ({ ...n, purchase_unit: v }))} disabled={!selectedNewIng}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{purchaseUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="w-36">
                    <div className="flex items-center justify-between gap-1">
                      <Label className="text-xs text-muted-foreground">Precio</Label>
                      <button
                        type="button"
                        onClick={() => setPriceMode(m => m === 'total' ? 'unit' : 'total')}
                        className="text-[10px] text-primary hover:underline"
                      >
                        {priceMode === 'total' ? 'Total' : `Por ${newItem.purchase_unit || 'u'}`}
                      </button>
                    </div>
                    <Input type="number" step="0.01" placeholder="0" value={priceInput || ''} onChange={e => setPriceInput(Number(e.target.value))} />
                  </div>
                  <Button size="sm" onClick={addItem} disabled={!newItem.ingredient_id || !newItem.quantity || !newItem.purchase_unit || !priceInput}><Plus className="h-4 w-4" /></Button>
                </div>
                {selectedNewIng && newItem.purchase_unit && newItem.quantity > 0 && (
                  <div className="text-xs text-muted-foreground pl-1 space-y-0.5">
                    {newItem.purchase_unit !== selectedNewIng.unit && (
                      <p>= {(newItem.quantity * (getConversionFactor(newItem.purchase_unit, selectedNewIng.unit) ?? 1)).toLocaleString('es-AR')} {selectedNewIng.unit} en stock</p>
                    )}
                    {priceInput > 0 && (
                      <p>
                        {priceMode === 'total'
                          ? `≈ $${(priceInput / newItem.quantity).toFixed(2)} por ${newItem.purchase_unit}`
                          : `≈ $${(priceInput * newItem.quantity).toFixed(2)} total`}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {items.length > 0 && (
                <Table>
                  <TableHeader><TableRow><TableHead>Ingrediente</TableHead><TableHead className="text-right">Comprado</TableHead><TableHead className="text-right">$/u</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const ing = ingredients.find((i: any) => i.id === item.ingredient_id) as any;
                      const factor = ing ? (getConversionFactor(item.purchase_unit, ing.unit) ?? 1) : 1;
                      const baseQty = item.quantity * factor;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            {ing?.name}
                            {item.purchase_unit !== ing?.unit && (
                              <span className="text-xs text-muted-foreground block">→ {baseQty.toLocaleString('es-AR')} {ing?.unit}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">{item.quantity} {item.purchase_unit}</TableCell>
                          <TableCell className="text-right text-sm">${item.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-sm">${(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button></TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow><TableCell colSpan={3} className="text-right font-bold text-sm">Total</TableCell><TableCell className="text-right font-bold text-sm">${total.toFixed(2)}</TableCell><TableCell /></TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
            <div><Label>Notas (opcional)</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.supplier.trim() || items.length === 0 || saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : (editingInvoice ? 'Guardar cambios' : 'Registrar compra')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- WASTE ----
function WasteSection() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ingredient_id: '', quantity: 0, unit: '', reason: '' });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('ingredients').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: recentWastes = [] } = useQuery({
    queryKey: ['stock_movements', 'waste', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('stock_movements').select('*, ingredients(name, unit)')
        .eq('establishment_id', establishmentId!).eq('type', 'waste')
        .order('created_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const selectedIng = ingredients.find((i: any) => i.id === form.ingredient_id) as any;
  const wasteUnits = selectedIng ? getPurchaseUnits(selectedIng.unit) : [];
  const factor = selectedIng ? (getConversionFactor(form.unit, selectedIng.unit) ?? 1) : 1;
  const baseQty = form.quantity * factor;

  const wasteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIng) throw new Error('No encontrado');
      await db.from('ingredients').update({ current_stock: Math.max(0, Number(selectedIng.current_stock) - baseQty) }).eq('id', form.ingredient_id);
      await db.from('stock_movements').insert({
        establishment_id: establishmentId!, ingredient_id: form.ingredient_id,
        type: 'waste' as any, quantity: -baseQty,
        reason: form.unit !== selectedIng.unit ? `${form.reason} (${form.quantity} ${form.unit})` : form.reason,
        created_by: session?.user?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Merma registrada' });
      setForm({ ingredient_id: '', quantity: 0, unit: '', reason: '' });
    },
    onError: () => toast({ title: 'Error al registrar merma', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Ingrediente</Label>
              <IngredientCombobox
                ingredients={ingredients}
                value={form.ingredient_id}
                onChange={v => {
                  const ing = ingredients.find((i: any) => i.id === v) as any;
                  const defaultUnit = ing ? getPurchaseUnits(ing.unit)[0] : '';
                  setForm(f => ({ ...f, ingredient_id: v, unit: defaultUnit }));
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Cantidad</Label>
              <div className="flex gap-1">
                <Input type="number" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="flex-1" />
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))} disabled={!selectedIng}>
                  <SelectTrigger className="w-20"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{wasteUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
                <SelectContent>{WASTE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {selectedIng && form.quantity > 0 && form.unit && form.unit !== selectedIng.unit && (
            <p className="text-xs text-muted-foreground">= {baseQty.toLocaleString('es-AR')} {selectedIng.unit} se descontarán del stock</p>
          )}
          <Button onClick={() => wasteMutation.mutate()} disabled={!form.ingredient_id || !form.quantity || !form.unit || !form.reason || wasteMutation.isPending} variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-1" />{wasteMutation.isPending ? 'Registrando...' : 'Registrar merma'}
          </Button>
        </CardContent>
      </Card>

      {recentWastes.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Mermas recientes</h3>
          {recentWastes.map((w: any) => (
            <div key={w.id} className="flex items-center justify-between p-2 rounded border text-sm">
              <span><span className="font-medium">{w.ingredients?.name}</span> <span className="text-muted-foreground">{Math.abs(w.quantity)} {w.ingredients?.unit}</span></span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{w.reason}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString('es-AR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- ADJUSTMENTS ----
function AdjustmentsSection() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ingredient_id: '', real_stock: 0, reason: '' });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('ingredients').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const ing = ingredients.find((i: any) => i.id === form.ingredient_id) as any;
      if (!ing) throw new Error('No encontrado');
      const diff = form.real_stock - Number(ing.current_stock);
      await db.from('ingredients').update({ current_stock: form.real_stock }).eq('id', form.ingredient_id);
      await db.from('stock_movements').insert({
        establishment_id: establishmentId!, ingredient_id: form.ingredient_id,
        type: 'adjustment' as any, quantity: diff,
        reason: form.reason || `Ajuste manual: ${ing.current_stock} → ${form.real_stock}`,
        created_by: session?.user?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Stock ajustado' });
      setForm({ ingredient_id: '', real_stock: 0, reason: '' });
    },
    onError: () => toast({ title: 'Error al ajustar', variant: 'destructive' }),
  });

  const selectedIng = ingredients.find((i: any) => i.id === form.ingredient_id) as any;
  const diff = selectedIng ? form.real_stock - Number(selectedIng.current_stock) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Corregí diferencias entre el stock registrado y el real</p>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ingrediente</Label>
              <IngredientCombobox
                ingredients={ingredients}
                value={form.ingredient_id}
                showStock
                onChange={v => {
                  const ing = ingredients.find((i: any) => i.id === v);
                  setForm(f => ({ ...f, ingredient_id: v, real_stock: ing ? Number(ing.current_stock) : 0 }));
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Stock real contado {selectedIng ? `(${selectedIng.unit})` : ''}</Label>
              <Input type="number" value={form.real_stock || ''} onChange={e => setForm(f => ({ ...f, real_stock: Number(e.target.value) }))} />
            </div>
          </div>
          {selectedIng && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Registrado: {selectedIng.current_stock} {selectedIng.unit}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">Real: {form.real_stock} {selectedIng.unit}</span>
              {diff !== 0 && (
                <Badge className={diff > 0 ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700'}>
                  {diff > 0 ? '+' : ''}{diff} {selectedIng.unit}
                </Badge>
              )}
            </div>
          )}
          <div>
            <Label className="text-xs">Motivo (opcional)</Label>
            <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ej: Conteo físico semanal" />
          </div>
          <Button onClick={() => adjustMutation.mutate()} disabled={!form.ingredient_id || diff === 0 || adjustMutation.isPending} size="sm">
            <Wrench className="h-4 w-4 mr-1" />{adjustMutation.isPending ? 'Ajustando...' : 'Aplicar ajuste'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- HISTORY ----
function HistorySection() {
  const { establishmentId } = useAuth();
  const [filterType, setFilterType] = useState('all');

  const { data: movements = [] } = useQuery({
    queryKey: ['stock_movements', establishmentId, filterType],
    queryFn: async () => {
      let q = db.from('stock_movements').select('*, ingredients(name, unit)')
        .eq('establishment_id', establishmentId!).order('created_at', { ascending: false }).limit(100);
      if (filterType !== 'all') q = q.eq('type', filterType as any);
      const { data } = await q;
      return data || [];
    },
    enabled: !!establishmentId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Todos los movimientos de stock</p>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="entry">Entradas</SelectItem>
            <SelectItem value="sale">Ventas</SelectItem>
            <SelectItem value="waste">Mermas</SelectItem>
            <SelectItem value="adjustment">Ajustes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Ingrediente</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
          <TableBody>
            {movements.map((m: any) => {
              const t = TYPE_LABELS[m.type] || { label: m.type, color: '' };
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell className="text-sm font-medium">{m.ingredients?.name}</TableCell>
                  <TableCell><Badge className={`text-xs ${t.color}`}>{t.label}</Badge></TableCell>
                  <TableCell className={`text-right text-sm font-mono ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity} {m.ingredients?.unit}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.reason || '-'}</TableCell>
                </TableRow>
              );
            })}
            {movements.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No hay movimientos</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

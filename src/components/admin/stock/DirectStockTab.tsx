import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, ClipboardCheck, ListChecks, AlertTriangle, Wallet, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import ResaleProductsDialog from './ResaleProductsDialog';
import DirectStockCountDialog from './DirectStockCountDialog';

const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

function statusOf(stock: number, min: number) {
  if (stock <= 0 || stock < min) return { label: 'Reponer', variant: 'destructive' as const };
  if (min > 0 && stock <= min * 1.25) return { label: 'Justo', variant: 'secondary' as const };
  return { label: 'OK', variant: 'outline' as const };
}

/**
 * Productos que se cuentan por unidad o porción. En modo simple es todo el inventario;
 * en avanzado, lo que se vende tal cual se compra (bebidas, postres, empanadas).
 */
export default function DirectStockTab({ advanced = false }: { advanced?: boolean }) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<{ id: string; name: string } | null>(null);
  const [addQty, setAddQty] = useState('');
  const [addNote, setAddNote] = useState('');

  const addStock = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('add_product_stock' as any, {
        _product_id: adding!.id, _quantity: Number(addQty.replace(',', '.')), _note: addNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: `Se sumaron ${addQty} a ${adding?.name}` });
      setAdding(null);
      setAddQty('');
      setAddNote('');
      queryClient.invalidateQueries({ queryKey: ['direct-stock-products'] });
      queryClient.invalidateQueries({ queryKey: ['waste-items'] });
    },
    onError: (e: Error) => toast({ title: e.message || 'No se pudo sumar el stock', variant: 'destructive' }),
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['direct-stock-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('id, name, direct_stock, direct_min_stock, cost, price, categories(name)')
        .eq('establishment_id', establishmentId!)
        .eq('stock_mode', 'direct')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const updateMin = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await db.from('products').update({ direct_min_stock: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['direct-stock-products'] }),
    onError: () => toast({ title: 'No se pudo actualizar el mínimo', variant: 'destructive' }),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? products.filter((p: any) => p.name.toLowerCase().includes(term)) : products;
  }, [products, search]);

  const summary = useMemo(() => {
    const value = products.reduce((s: number, p: any) => s + Number(p.direct_stock) * Number(p.cost || 0), 0);
    const low = products.filter((p: any) => Number(p.direct_stock) < Number(p.direct_min_stock) || Number(p.direct_stock) <= 0).length;
    const noCost = products.filter((p: any) => !Number(p.cost)).length;
    return { value, low, noCost, count: products.length };
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Buscar producto…"
          className="w-full sm:w-64"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowPicker(true)}>
            <ListChecks className="h-4 w-4" /> Elegir qué productos se cuentan
          </Button>
          <Button className="gap-2" onClick={() => setShowCount(true)}>
            <ClipboardCheck className="h-4 w-4" /> Conteo físico
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {advanced
          ? 'Acá van los productos que se venden tal cual se compran o ya vienen porcionados: bebidas, postres, empanadas. Cada venta descuenta 1.'
          : 'Cargá cuántas porciones o unidades tenés de cada producto (ej.: 200 medallones, 50 porciones de ojo de bife). Cada venta descuenta 1. Tocá "Sumar" cuando entra mercadería o porcionás.'}
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="h-4 w-4" />Valor del stock</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(summary.value)}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.count} productos con control</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Para reponer</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.low}</div>
            <p className="text-xs text-muted-foreground mt-1">Por debajo del mínimo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Package className="h-4 w-4" />Sin costo cargado</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.noCost}</div>
            <p className="text-xs text-muted-foreground mt-1">Cargalos en Precios y márgenes</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Package className="h-4 w-4" />Productos en stock</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>
          ) : products.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {advanced
                  ? 'Todavía no hay productos por unidad. Marcá las bebidas y todo lo que se vende tal cual se compra.'
                  : 'Todavía no hay productos con stock. Elegí los productos que querés controlar y después cargá cuántos tenés.'}
              </p>
              <Button variant="outline" className="gap-2" onClick={() => setShowPicker(true)}>
                <ListChecks className="h-4 w-4" /> Elegir qué productos se cuentan
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="hidden md:table-cell">Categoría</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Costo</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Precio</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Margen</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => {
                    const stock = Number(p.direct_stock);
                    const min = Number(p.direct_min_stock);
                    const cost = Number(p.cost || 0);
                    const price = Number(p.price || 0);
                    const margin = price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
                    const st = statusOf(stock, min);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{p.categories?.name ?? '—'}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${stock <= 0 ? 'text-destructive' : ''}`}>{stock}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="h-8 w-20 ml-auto text-right"
                            type="number"
                            defaultValue={min}
                            onBlur={e => {
                              const v = Number(e.target.value) || 0;
                              if (v !== min) updateMin.mutate({ id: p.id, value: v });
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell">{cost ? fmt(cost) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell">{fmt(price)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden lg:table-cell">
                          {margin === null ? '—' : `${margin.toFixed(0)}%`}
                        </TableCell>
                        <TableCell className="text-right"><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdding({ id: p.id, name: p.name })}>
                            <Plus className="h-3.5 w-3.5" />Sumar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!adding} onOpenChange={o => { if (!o) setAdding(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sumar a {adding?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>¿Cuántas porciones o unidades entraron?</Label>
              <Input autoFocus inputMode="decimal" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Ej: 24" />
            </div>
            <div className="space-y-1.5">
              <Label>Aclaración (opcional)</Label>
              <Input value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="Ej: llegó el pedido del proveedor" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)}>Cancelar</Button>
            <Button disabled={!(Number(addQty.replace(',', '.')) > 0) || addStock.isPending} onClick={() => addStock.mutate()}>Sumar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResaleProductsDialog open={showPicker} onOpenChange={setShowPicker} />
      <DirectStockCountDialog
        open={showCount}
        onOpenChange={setShowCount}
        products={products.map((p: any) => ({ id: p.id, name: p.name, direct_stock: Number(p.direct_stock) }))}
      />
    </div>
  );
}

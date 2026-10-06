import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, ClipboardCheck, ListChecks, AlertTriangle, Wallet } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ResaleProductsDialog from './ResaleProductsDialog';
import DirectStockCountDialog from './DirectStockCountDialog';

const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

function statusOf(stock: number, min: number) {
  if (stock <= 0 || stock < min) return { label: 'Reponer', variant: 'destructive' as const };
  if (min > 0 && stock <= min * 1.25) return { label: 'Justo', variant: 'secondary' as const };
  return { label: 'OK', variant: 'outline' as const };
}

export default function DirectStockTab() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['direct-stock-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
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
      const { error } = await supabase.from('products').update({ direct_min_stock: value }).eq('id', id);
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
            <ListChecks className="h-4 w-4" /> Elegir productos de reventa
          </Button>
          <Button className="gap-2" onClick={() => setShowCount(true)}>
            <ClipboardCheck className="h-4 w-4" /> Recuento de stock
          </Button>
        </div>
      </div>

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
                Todavía no hay productos con control de stock. Marcá las bebidas y todo lo que se vende tal cual se compra.
              </p>
              <Button variant="outline" className="gap-2" onClick={() => setShowPicker(true)}>
                <ListChecks className="h-4 w-4" /> Elegir productos de reventa
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ResaleProductsDialog open={showPicker} onOpenChange={setShowPicker} />
      <DirectStockCountDialog
        open={showCount}
        onOpenChange={setShowCount}
        products={products.map((p: any) => ({ id: p.id, name: p.name, direct_stock: Number(p.direct_stock) }))}
      />
    </div>
  );
}

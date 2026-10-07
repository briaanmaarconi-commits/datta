import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Permite marcar qué productos se venden tal cual se compran (reventa) y por
 * lo tanto entran al control de stock directo.
 */
export default function ResaleProductsDialog({ open, onOpenChange }: Props) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['resale-products-picker', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('id, name, stock_mode, categories(name)')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId && open,
  });

  useEffect(() => {
    if (open && products.length) {
      setSelected(new Set(products.filter((p: any) => p.stock_mode === 'direct').map((p: any) => p.id)));
    }
  }, [open, products]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, any[]>();
    products
      .filter((p: any) => !term || p.name.toLowerCase().includes(term))
      .forEach((p: any) => {
        const cat = p.categories?.name || 'Sin categoría';
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(p);
      });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products, search]);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroup = (items: any[], on: boolean) =>
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(p => (on ? next.add(p.id) : next.delete(p.id)));
      return next;
    });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toDirect = products.filter((p: any) => selected.has(p.id) && p.stock_mode !== 'direct').map((p: any) => p.id);
      const toNone = products.filter((p: any) => !selected.has(p.id) && p.stock_mode === 'direct').map((p: any) => p.id);
      if (toDirect.length) {
        const { error } = await db.from('products').update({ stock_mode: 'direct' }).in('id', toDirect);
        if (error) throw error;
      }
      if (toNone.length) {
        const { error } = await db.from('products').update({ stock_mode: 'none' }).in('id', toNone);
        if (error) throw error;
      }
      return { added: toDirect.length, removed: toNone.length };
    },
    onSuccess: ({ added, removed }) => {
      queryClient.invalidateQueries({ queryKey: ['direct-stock-products'] });
      queryClient.invalidateQueries({ queryKey: ['resale-products-picker'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Productos actualizados', description: `${added} agregados, ${removed} quitados del control de stock.` });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Elegir qué productos se cuentan por unidad o porción</DialogTitle>
          <DialogDescription>
            Marcá los productos que se venden tal cual se compran (gaseosas, agua, vinos, cervezas). Solo esos llevan
            control de stock; los platos elaborados quedan afuera.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)} />
        <ScrollArea className="h-[50vh] pr-3">
          <div className="space-y-4">
            {groups.map(([cat, items]) => {
              const all = items.every(p => selected.has(p.id));
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Checkbox checked={all} onCheckedChange={v => toggleGroup(items, !!v)} id={`cat-${cat}`} />
                    <label htmlFor={`cat-${cat}`} className="text-sm font-semibold cursor-pointer">
                      {cat} <span className="text-muted-foreground font-normal">({items.length})</span>
                    </label>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 pl-6">
                    {items.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <Checkbox id={p.id} checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                        <label htmlFor={p.id} className="text-sm cursor-pointer truncate">{p.name}</label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {groups.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin resultados.</p>}
          </div>
        </ScrollArea>
        <DialogFooter>
          <span className="text-xs text-muted-foreground mr-auto self-center">{selected.size} productos seleccionados</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

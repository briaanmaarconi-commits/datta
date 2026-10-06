import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

export interface CountableProduct {
  id: string;
  name: string;
  direct_stock: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: CountableProduct[];
}

/** Recuento masivo de existencias de los productos de reventa. */
export default function DirectStockCountDialog({ open, onOpenChange, products }: Props) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setCounts({});
  }, [open]);

  const changed = products
    .map(p => ({ p, raw: counts[p.id] }))
    .filter(({ raw }) => raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)))
    .map(({ p, raw }) => ({ product: p, counted: Number(raw), diff: Number(raw) - Number(p.direct_stock) }))
    .filter(c => c.diff !== 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (changed.length === 0) throw new Error('No hay diferencias para guardar');
      for (const c of changed) {
        const { error } = await db
          .from('products')
          .update({ direct_stock: c.counted })
          .eq('id', c.product.id);
        if (error) throw error;
        const { error: movErr } = await db.from('stock_movements').insert({
          establishment_id: establishmentId!,
          product_id: c.product.id,
          ingredient_id: null,
          type: 'adjustment',
          quantity: c.diff,
          reason: `Recuento de stock (sistema: ${c.product.direct_stock}, contado: ${c.counted})`,
          created_by: session?.user?.id ?? null,
        } as any);
        if (movErr) throw movErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['direct-stock-products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Recuento guardado', description: `${changed.length} productos ajustados.` });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Recuento de stock</DialogTitle>
          <DialogDescription>
            Anotá lo que contaste de cada producto. Los que dejes vacíos quedan como están. La diferencia se registra
            como ajuste en el historial.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[50vh] pr-3">
          <div className="space-y-1.5">
            {products.map(p => {
              const raw = counts[p.id];
              const diff = raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) - Number(p.direct_stock) : null;
              return (
                <div key={p.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Sistema: {Number(p.direct_stock)} u</div>
                  </div>
                  {diff !== null && diff !== 0 && (
                    <span className={`text-xs font-medium ${diff > 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      {diff > 0 ? '+' : ''}{diff}
                    </span>
                  )}
                  <Input
                    className="w-24 h-9"
                    type="number"
                    inputMode="decimal"
                    placeholder="contado"
                    value={raw ?? ''}
                    onChange={e => setCounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
              );
            })}
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Todavía no marcaste productos de reventa.
              </p>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <span className="text-xs text-muted-foreground mr-auto self-center">{changed.length} con diferencia</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || changed.length === 0}>
            Guardar recuento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

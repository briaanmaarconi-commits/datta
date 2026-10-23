import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { bottlesOf, fmtNum, itemKey, type DrinkItem } from './useDrinksInventory';

const parse = (raw: string | undefined) => {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Recuento físico: se anota lo que hay en el depósito y la barra. Sirve para la carga inicial y para
 * los controles periódicos. Lo que se deja vacío no cambia.
 */
export default function DrinksCountDialog({ open, onOpenChange, items, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: DrinkItem[];
  onSaved: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  useEffect(() => { if (open) setCounts({}); }, [open]);

  const current = (i: DrinkItem) => (i.kind === 'product' ? i.stock : bottlesOf(i));
  const lines = items
    .map(i => ({ i, counted: parse(counts[itemKey(i)]) }))
    .filter((l): l is { i: DrinkItem; counted: number } => l.counted !== null && Math.abs(l.counted - current(l.i)) > 0.001);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('register_drinks_count', {
        _lines: lines.map(l => ({ kind: l.i.kind, id: l.i.id, counted: l.counted })),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`Recuento guardado: ${lines.length} ${lines.length === 1 ? 'bebida actualizada' : 'bebidas actualizadas'}`);
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar el recuento'),
  });

  const section = (title: string, list: DrinkItem[], hint: string) => list.length > 0 && (
    <div className="space-y-1">
      <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {list.map(i => {
        const k = itemKey(i);
        const counted = parse(counts[k]);
        const diff = counted === null ? null : counted - current(i);
        return (
          <div key={k} className="flex items-center gap-3 border-b py-1.5 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{i.name}</div>
              <div className="text-xs text-muted-foreground">
                Sistema: {fmtNum(current(i), 2)} {i.kind === 'product' ? 'u' : 'botellas'}
                {i.kind === 'bottle' && ` de ${fmtNum(i.bottle_ml, 0)} ml`}
              </div>
            </div>
            {diff !== null && Math.abs(diff) > 0.001 && (
              <span className={`text-xs font-medium ${diff > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {diff > 0 ? '+' : ''}{fmtNum(diff, 2)}
              </span>
            )}
            <Input
              className="h-9 w-24"
              inputMode="decimal"
              placeholder={i.kind === 'product' ? 'unidades' : 'botellas'}
              value={counts[k] ?? ''}
              onChange={e => setCounts(prev => ({ ...prev, [k]: e.target.value }))}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Recuento físico</DialogTitle>
          <DialogDescription>
            Contá lo que hay en la barra y el depósito y anotalo. Lo que dejes vacío queda como está. La diferencia
            queda registrada en el historial.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[55vh] pr-3">
          {section('Bebidas por unidad', items.filter(i => i.kind === 'product'), 'Latas, botellas de cerveza o vino: cantidad de unidades.')}
          {section('Botellas para tragos', items.filter(i => i.kind === 'bottle'),
            'Botellas: las abiertas se anotan con decimales (media botella = 0,5).')}
          {items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Primero agregá las bebidas y botellas del inventario.</p>
          )}
        </ScrollArea>
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">{lines.length} con cambios</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0}>Guardar recuento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

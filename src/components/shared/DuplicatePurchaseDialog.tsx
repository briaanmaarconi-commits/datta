import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { SimilarPurchase } from '@/lib/duplicatePurchase';

const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  matches: SimilarPurchase[];
  onConfirm: () => void;
  pending?: boolean;
}

export default function DuplicatePurchaseDialog({ open, onOpenChange, matches, onConfirm, pending }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            ¿Esta compra ya está cargada?
          </DialogTitle>
          <DialogDescription>
            Encontramos {matches.length === 1 ? 'un movimiento parecido' : 'movimientos parecidos'} del mismo proveedor,
            fecha y monto. Si es la misma compra, cargarla de nuevo la contaría dos veces.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {matches.map(m => (
            <div key={`${m.source}-${m.id}`} className="rounded-md border p-3 text-sm">
              <div className="font-medium truncate">{m.label}</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {fmtDate(m.date)} · {fmt(m.amount)} · cargada en {m.source === 'stock' ? 'Stock' : 'Movimientos de caja'}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={pending}>Es otra compra, cargar igual</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

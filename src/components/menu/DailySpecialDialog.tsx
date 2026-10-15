import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { useDailySpecials, getLastDailySpecialPrice } from '@/hooks/useDailySpecials';

interface DailySpecialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId?: string | null;
  /** Plato a editar; sin él, se carga uno nuevo. */
  product?: { id: string; name: string; price: number } | null;
}

export default function DailySpecialDialog({ open, onOpenChange, establishmentId, product }: DailySpecialDialogProps) {
  const { save, remove } = useDailySpecials(establishmentId);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? '');
    const last = product ? Number(product.price) : getLastDailySpecialPrice(establishmentId);
    setPrice(last ? String(last) : '');
    setConfirmDelete(false);
  }, [open, product, establishmentId]);

  const priceNum = Number(price.replace(',', '.'));
  const canSave = name.trim().length > 0 && priceNum > 0 && !save.isPending;

  const handleSave = () => {
    save.mutate(
      { id: product?.id, name, price: priceNum },
      {
        onSuccess: () => {
          toast.success(product ? 'Plato del día actualizado' : 'Plato del día agregado');
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.message || 'No se pudo guardar el plato del día'),
      },
    );
  };

  const handleDelete = () => {
    if (!product) return;
    remove.mutate(product.id, {
      onSuccess: () => {
        toast.success('Plato del día quitado');
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e?.message || 'No se pudo quitar el plato del día'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar plato del día' : 'Nuevo plato del día'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="daily-name">Plato</Label>
            <Input
              id="daily-name"
              placeholder="Ej: Tallarines con estofado"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daily-price">Precio</Label>
            <Input
              id="daily-price"
              inputMode="decimal"
              placeholder="12500"
              value={price}
              onChange={e => setPrice(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave(); }}
            />
          </div>

          <Button className="w-full h-11" disabled={!canSave} onClick={handleSave}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>

          {product && (
            confirmDelete ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" className="flex-1" disabled={remove.isPending} onClick={handleDelete}>
                  Sí, quitar
                </Button>
              </div>
            ) : (
              <Button variant="ghost" className="w-full gap-2 text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Quitar de platos del día
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

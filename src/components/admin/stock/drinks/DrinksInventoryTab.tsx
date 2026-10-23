import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ClipboardCheck, GlassWater, ListChecks, Plus, ShoppingCart, Wine } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ResaleProductsDialog from '../ResaleProductsDialog';
import DrinksCountDialog from './DrinksCountDialog';
import DrinksPurchaseDialog from './DrinksPurchaseDialog';
import { bottlesOf, fmtMoney, fmtNum, OZ_ML, stockStatus, useDrinksInventory, type Bottle, type DrinkProduct } from './useDrinksInventory';

const num = (s: string) => Number(s.replace(',', '.'));

/** Inventario del modo "Bebidas y tragos": qué hay, recuento físico y compras. */
export default function DrinksInventoryTab() {
  const { establishmentId } = useAuth();
  const { products, bottles, isLoading, refresh } = useDrinksInventory();
  const [picker, setPicker] = useState(false);
  const [counting, setCounting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [bottleForm, setBottleForm] = useState<{ id?: string; name: string; ml: string; min: string } | null>(null);
  const items = [...products, ...bottles];
  const empty = items.length > 0 && items.every(i => (i.kind === 'product' ? i.stock : i.stock_ml) === 0);

  const saveBottle = useMutation({
    mutationFn: async () => {
      const f = bottleForm!;
      const ml = num(f.ml);
      if (!f.name.trim()) throw new Error('Poné el nombre de la bebida');
      if (!(ml > 0)) throw new Error('Poné cuántos ml trae la botella');
      const min = f.min.trim() ? num(f.min) * ml : 0;
      const values = { name: f.name.trim(), bottle_ml: ml, min_stock: min };
      const { error } = f.id
        ? await db.from('ingredients').update(values as any).eq('id', f.id)
        : await db.from('ingredients').insert({ ...values, establishment_id: establishmentId!, unit: 'ml', current_stock: 0 } as any);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(bottleForm?.id ? 'Botella actualizada' : 'Botella agregada: cargá cuántas tenés con el recuento');
      setBottleForm(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const minOf = (i: DrinkProduct | Bottle) => (i.kind === 'product' ? i.min : i.min_ml / i.bottle_ml);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button className="gap-2" onClick={() => setCounting(true)} disabled={items.length === 0}>
          <ClipboardCheck className="h-4 w-4" /> Recuento físico
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => setBuying(true)} disabled={items.length === 0}>
          <ShoppingCart className="h-4 w-4" /> Registrar compra
        </Button>
      </div>

      {!isLoading && (items.length === 0 || empty) && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-semibold">Cómo empezar</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Elegí de la carta las <strong>bebidas que se venden por unidad</strong> (latas, cervezas, vinos).</li>
            <li>Agregá las <strong>botellas para tragos</strong> (fernet, gin, gaseosa de 1,5 L…) con cuántos ml trae cada una.</li>
            <li>Hacé un <strong>recuento físico</strong>: contá lo que tenés hoy y anotalo.</li>
            <li>Desde ahí, cada compra se carga en <strong>Registrar compra</strong> y cada venta se descuenta sola.</li>
          </ol>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg"><GlassWater className="h-5 w-5" /> Bebidas por unidad</CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPicker(true)}>
            <ListChecks className="h-4 w-4" /> Elegir de la carta
          </Button>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no elegiste bebidas por unidad. Cada venta descuenta 1.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Bebida</TableHead><TableHead className="text-right">Hay</TableHead><TableHead className="text-right">Mínimo</TableHead><TableHead className="text-right">Costo</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {products.map(p => {
                  const s = stockStatus(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}{p.category && <span className="block text-xs text-muted-foreground">{p.category}</span>}</TableCell>
                      <TableCell className="text-right font-medium">{fmtNum(p.stock, 2)} u</TableCell>
                      <TableCell className="text-right">{fmtNum(minOf(p))}</TableCell>
                      <TableCell className="text-right">{p.cost ? fmtMoney(p.cost) : '—'}</TableCell>
                      <TableCell className="text-right"><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg"><Wine className="h-5 w-5" /> Botellas para tragos</CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBottleForm({ name: '', ml: '750', min: '' })}>
            <Plus className="h-4 w-4" /> Agregar botella
          </Button>
        </CardHeader>
        <CardContent>
          {bottles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Agregá las botellas que usan los tragos. Cada trago descuenta las onzas que lleva (1 oz = {OZ_ML} ml).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Botella</TableHead><TableHead className="text-right">Hay</TableHead><TableHead className="text-right">Onzas</TableHead><TableHead className="text-right">Mínimo</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {bottles.map(b => {
                  const s = stockStatus(b);
                  return (
                    <TableRow key={b.id} className="cursor-pointer" onClick={() =>
                      setBottleForm({ id: b.id, name: b.name, ml: String(b.bottle_ml), min: b.min_ml ? String(b.min_ml / b.bottle_ml) : '' })}>
                      <TableCell>{b.name}<span className="block text-xs text-muted-foreground">Botella de {fmtNum(b.bottle_ml, 0)} ml</span></TableCell>
                      <TableCell className="text-right font-medium">{fmtNum(bottlesOf(b), 1)} bot.</TableCell>
                      <TableCell className="text-right">{fmtNum(b.stock_ml / OZ_ML, 0)} oz</TableCell>
                      <TableCell className="text-right">{fmtNum(minOf(b))} bot.</TableCell>
                      <TableCell className="text-right"><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ResaleProductsDialog open={picker} onOpenChange={(v) => { setPicker(v); if (!v) refresh(); }} />
      <DrinksCountDialog open={counting} onOpenChange={setCounting} items={items} onSaved={refresh} />
      <DrinksPurchaseDialog open={buying} onOpenChange={setBuying} items={items} onSaved={refresh} />

      <Dialog open={!!bottleForm} onOpenChange={(v) => !v && setBottleForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bottleForm?.id ? 'Editar botella' : 'Agregar botella para tragos'}</DialogTitle>
            <DialogDescription>Las cantidades se cargan después con el recuento físico o con las compras.</DialogDescription>
          </DialogHeader>
          {bottleForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Bebida</Label>
                <Input autoFocus value={bottleForm.name} onChange={e => setBottleForm({ ...bottleForm, name: e.target.value })} placeholder="Ej.: Fernet Branca" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ml por botella</Label>
                  <Input inputMode="decimal" value={bottleForm.ml} onChange={e => setBottleForm({ ...bottleForm, ml: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Avisar con menos de (botellas)</Label>
                  <Input inputMode="decimal" value={bottleForm.min} onChange={e => setBottleForm({ ...bottleForm, min: e.target.value })} placeholder="Ej.: 2" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBottleForm(null)}>Cancelar</Button>
            <Button onClick={() => saveBottle.mutate()} disabled={saveBottle.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

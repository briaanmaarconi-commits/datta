import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Martini, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fmtMoney, fmtNum, OZ_ML, useDrinksInventory } from './useDrinksInventory';

interface Product { id: string; name: string; price: number; stock_mode: string; categories?: { name?: string; prep_area?: string | null } | null }
interface RecipeLine { id: string; ingredient_id: string; quantity: number }

/** Tragos: cuántas onzas de cada botella lleva cada uno. Al venderse se descuentan solas. */
export default function CocktailsTab() {
  const { establishmentId } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['cocktail-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('products').select('id, name, price, stock_mode, categories(name, prep_area)')
        .eq('establishment_id', establishmentId!).order('name');
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!establishmentId,
  });

  // Se muestran las categorías de bebidas (sector "Bebidas" en Carta); el resto, a pedido. Las bebidas por
  // unidad no van acá: ya están en el inventario.
  const isDrink = (p: Product) => p.categories?.prep_area === 'bebida';
  const hasDrinkCategories = products.some(isDrink);
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, Product[]>();
    for (const p of products) {
      if (p.stock_mode === 'direct') continue;
      if (term ? !p.name.toLowerCase().includes(term) : hasDrinkCategories && !showAll && !isDrink(p)) continue;
      const cat = p.categories?.name ?? 'Sin categoría';
      map.set(cat, [...(map.get(cat) ?? []), p]);
    }
    return [...map.entries()].sort(([, a], [, b]) => Number(isDrink(b[0])) - Number(isDrink(a[0])));
  }, [products, search, showAll, hasDrinkCategories]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tocá un trago de la carta y anotá cuántas onzas lleva de cada botella (1 oz = {OZ_ML} ml). Cuando se cobra la
        mesa, se descuentan solas del inventario.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar en la carta" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {hasDrinkCategories && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showAll} onCheckedChange={setShowAll} /> Ver toda la carta
          </label>
        )}
      </div>
      {!hasDrinkCategories && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          Tip: en Carta, poné el sector «Bebidas» a las categorías de tragos y acá vas a ver solo esas.
        </p>
      )}
      {groups.map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map(p => (
              <Card key={p.id} className="cursor-pointer transition-colors hover:border-primary" onClick={() => setSelected(p)}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Martini className={`h-5 w-5 shrink-0 ${p.stock_mode === 'recipe' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1 text-sm font-medium">{p.name}</div>
                  {p.stock_mode === 'recipe'
                    ? <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">Con medidas</Badge>
                    : <Badge variant="secondary" className="shrink-0">Sin medidas</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No hay productos que coincidan.</p>}
      <CocktailSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CocktailSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { bottles } = useDrinksInventory();
  const [bottleId, setBottleId] = useState('');
  const [oz, setOz] = useState('');
  const byId = new Map(bottles.map(b => [b.id, b]));

  const { data: lines = [] } = useQuery({
    queryKey: ['cocktail-recipe', product?.id],
    queryFn: async () => {
      const { data, error } = await db.from('product_recipes').select('id, ingredient_id, quantity').eq('product_id', product!.id);
      if (error) throw error;
      return (data ?? []) as RecipeLine[];
    },
    enabled: !!product,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cocktail-recipe', product?.id] });
    queryClient.invalidateQueries({ queryKey: ['cocktail-products'] });
    queryClient.invalidateQueries({ queryKey: ['products-stock'] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const q = Number(oz.replace(',', '.'));
      if (!bottleId) throw new Error('Elegí la botella');
      if (!(q > 0)) throw new Error('Poné cuántas onzas lleva');
      const existing = lines.find(l => l.ingredient_id === bottleId);
      const { error } = existing
        ? await db.from('product_recipes').update({ quantity: q * OZ_ML }).eq('id', existing.id)
        : await db.from('product_recipes').insert({ product_id: product!.id, ingredient_id: bottleId, quantity: q * OZ_ML });
      if (error) throw new Error(error.message);
      // Con la primera medida, el trago pasa a descontarse por receta.
      if (lines.length === 0) {
        const { error: e2 } = await db.from('products').update({ stock_mode: 'recipe' }).eq('id', product!.id);
        if (e2) throw new Error(e2.message);
      }
    },
    onSuccess: () => { setBottleId(''); setOz(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (line: RecipeLine) => {
      const { error } = await db.from('product_recipes').delete().eq('id', line.id);
      if (error) throw new Error(error.message);
      if (lines.length === 1) {
        await db.from('products').update({ stock_mode: 'none' }).eq('id', product!.id);
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const cost = lines.reduce((s, l) => s + (byId.get(l.ingredient_id)?.cost_per_ml ?? 0) * Number(l.quantity), 0);

  return (
    <Sheet open={!!product} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product?.name}</SheetTitle>
          <SheetDescription>Medidas de cada botella que lleva este trago.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {lines.length === 0 ? (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">Todavía no tiene medidas: no descuenta nada al venderse.</p>
          ) : (
            <div className="space-y-1">
              {lines.map(l => {
                const b = byId.get(l.ingredient_id);
                return (
                  <div key={l.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                    <span className="flex-1 text-sm">{b?.name ?? 'Botella'}</span>
                    <span className="text-sm font-medium">{fmtNum(Number(l.quantity) / OZ_ML, 2)} oz</span>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(l)} aria-label="Quitar"><X className="h-4 w-4" /></Button>
                  </div>
                );
              })}
              {cost > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Costo aproximado: {fmtMoney(cost)}{product?.price ? ` · se vende a ${fmtMoney(product.price)}` : ''}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 rounded-lg border p-3">
            <Label>Agregar botella</Label>
            {bottles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Primero agregá las botellas en la pestaña Inventario.</p>
            ) : (
              <div className="flex gap-2">
                <Select value={bottleId} onValueChange={setBottleId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Botella" /></SelectTrigger>
                  <SelectContent>
                    {bottles.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="w-20" inputMode="decimal" placeholder="oz" value={oz} onChange={e => setOz(e.target.value)} />
                <Button size="icon" onClick={() => add.mutate()} disabled={add.isPending} aria-label="Agregar"><Plus className="h-4 w-4" /></Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Ej.: Fernet con coca → Fernet 2 oz + Coca-Cola 6 oz.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

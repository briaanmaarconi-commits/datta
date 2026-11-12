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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import IngredientCombobox from '../IngredientCombobox';
import { fmtMoney, fmtNum, OZ_ML } from './useDrinksInventory';

interface Product { id: string; name: string; price: number; stock_mode: string; categories?: { name?: string; prep_area?: string | null } | null }
interface RecipeLine { id: string; ingredient_id: string; quantity: number }
interface Insumo { id: string; name: string; unit: string; bottle_ml: number | null; cost_per_unit: number }

const num = (s: string) => Number(s.replace(',', '.'));

/** Cuántos ml son 1 unidad del insumo (null si no es un líquido: unidades, kg, g…). */
function mlPerUnit(i: Pick<Insumo, 'unit' | 'bottle_ml'>): number | null {
  if (i.bottle_ml) return 1; // las botellas para tragos se guardan en ml
  const u = (i.unit || '').trim().toLowerCase();
  if (['ml', 'cc', 'cm3'].includes(u)) return 1;
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return 1000;
  return null;
}

/** Cantidad legible de una línea de receta: "60 ml (2 oz)" o "0,5 unidad". */
function fmtQty(ins: Insumo | undefined, qty: number) {
  const f = ins ? mlPerUnit(ins) : 1;
  if (f == null) return `${fmtNum(qty, 3)} ${ins?.unit ?? ''}`.trim();
  const ml = qty * f;
  return `${fmtNum(ml, 1)} ml (${fmtNum(ml / OZ_ML, 2)} oz)`;
}

/** Tragos: la receta de cada uno (cuánto lleva de cada botella o insumo). Al venderse se descuenta sola. */
export default function CocktailsTab() {
  const { establishmentId } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['cocktail-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('products').select('id, name, price, stock_mode, categories(name, prep_area)')
        .eq('establishment_id', establishmentId!).order('name');
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!establishmentId,
  });

  // Se muestran las categorías de bebidas (sector "Bebidas" en Carta); el resto, a pedido. También los productos que
  // hoy se cuentan "por unidad": si el trago quedó marcado así, se le puede cargar la receta igual.
  const isDrink = (p: Product) => p.categories?.prep_area === 'bebida';
  const hasDrinkCategories = products.some(isDrink);
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, Product[]>();
    for (const p of products) {
      if (term ? !p.name.toLowerCase().includes(term) : hasDrinkCategories && !showAll && !isDrink(p)) continue;
      const cat = p.categories?.name ?? 'Sin categoría';
      map.set(cat, [...(map.get(cat) ?? []), p]);
    }
    return [...map.entries()].sort(([, a], [, b]) => Number(isDrink(b[0])) - Number(isDrink(a[0])));
  }, [products, search, showAll, hasDrinkCategories]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tocá un trago de la carta y cargá su receta: cuánto lleva de cada bebida (en ml u onzas; 1 oz = {OZ_ML} ml).
        Cuando se cobra la mesa, se descuenta solo del inventario.
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
                    ? <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">Con receta</Badge>
                    : p.stock_mode === 'direct'
                      ? <Badge variant="secondary" className="shrink-0">Por unidad</Badge>
                      : <Badge variant="secondary" className="shrink-0">Sin receta</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando la carta…</p>}
      {!isLoading && groups.length === 0 && <p className="text-sm text-muted-foreground">No hay productos que coincidan.</p>}
      <CocktailSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CocktailSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [insumoId, setInsumoId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<'ml' | 'oz'>('ml');
  const [newBottle, setNewBottle] = useState<{ name: string; ml: string } | null>(null);

  // Insumos: primero las botellas para tragos, después el resto (limón, hielo, azúcar…).
  const { data: insumos = [] } = useQuery({
    queryKey: ['cocktail-insumos', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('ingredients').select('id, name, unit, bottle_ml, cost_per_unit, is_active')
        .eq('establishment_id', establishmentId!).order('name');
      if (error) throw error;
      return (data ?? [])
        .filter((i: any) => i.is_active !== false)
        .map((i: any) => ({ id: i.id, name: i.name, unit: i.unit ?? '', bottle_ml: i.bottle_ml ? Number(i.bottle_ml) : null, cost_per_unit: Number(i.cost_per_unit) || 0 }))
        .sort((a: Insumo, b: Insumo) => Number(!!b.bottle_ml) - Number(!!a.bottle_ml)) as Insumo[];
    },
    enabled: !!establishmentId && !!product,
  });
  const byId = new Map(insumos.map(i => [i.id, i]));
  const chosen = byId.get(insumoId);
  const chosenMl = chosen ? mlPerUnit(chosen) : 1;

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
    for (const k of ['cocktail-recipe', 'cocktail-products', 'cocktail-insumos', 'products-stock', 'drinks-products', 'drinks-bottles']) {
      queryClient.invalidateQueries({ queryKey: [k] });
    }
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new Error('Elegí la bebida o insumo');
      const q = num(qty);
      if (!(q > 0)) throw new Error(chosenMl != null ? `Poné cuántos ${unit} lleva` : `Poné cuánto lleva (en ${chosen.unit || 'unidades'})`);
      // La receta se guarda en la unidad del insumo (las botellas, en ml).
      const quantity = chosenMl != null ? (q * (unit === 'oz' ? OZ_ML : 1)) / chosenMl : q;
      const existing = lines.find(l => l.ingredient_id === chosen.id);
      const { error } = existing
        ? await db.from('product_recipes').update({ quantity }).eq('id', existing.id)
        : await db.from('product_recipes').insert({ product_id: product!.id, ingredient_id: chosen.id, quantity });
      if (error) throw new Error(error.message);
      // Con la receta cargada, el trago pasa a descontar sus insumos (aunque antes se contara por unidad).
      if (product!.stock_mode !== 'recipe' || lines.length === 0) {
        const { error: e2 } = await db.from('products').update({ stock_mode: 'recipe' }).eq('id', product!.id);
        if (e2) throw new Error(e2.message);
        product!.stock_mode = 'recipe';
      }
    },
    onSuccess: () => { setInsumoId(''); setQty(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (line: RecipeLine) => {
      const { error } = await db.from('product_recipes').delete().eq('id', line.id);
      if (error) throw new Error(error.message);
      if (lines.length === 1) {
        await db.from('products').update({ stock_mode: 'none' }).eq('id', product!.id);
        product!.stock_mode = 'none';
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  // Botella nueva sin salir del trago (p. ej. la coca de 1,5 L). La cantidad se carga después con recuento o compras.
  const createBottle = useMutation({
    mutationFn: async () => {
      const name = newBottle!.name.trim();
      const ml = num(newBottle!.ml);
      if (!name) throw new Error('Poné el nombre de la bebida');
      if (!(ml > 0)) throw new Error('Poné cuántos ml trae la botella');
      const { data, error } = await db.from('ingredients')
        .insert({ name, bottle_ml: ml, unit: 'ml', current_stock: 0, establishment_id: establishmentId! } as any)
        .select('id').single();
      if (error) throw new Error(error.message);
      return (data as any).id as string;
    },
    onSuccess: async (id) => {
      setNewBottle(null);
      await queryClient.invalidateQueries({ queryKey: ['cocktail-insumos'] });
      queryClient.invalidateQueries({ queryKey: ['drinks-bottles'] });
      setInsumoId(id);
      toast.success('Botella agregada: cargá cuántas tenés en Inventario → Recuento físico');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cost = lines.reduce((s, l) => s + (byId.get(l.ingredient_id)?.cost_per_unit ?? 0) * Number(l.quantity), 0);

  return (
    <Sheet open={!!product} onOpenChange={(v) => { if (!v) { setNewBottle(null); setInsumoId(''); setQty(''); onClose(); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product?.name}</SheetTitle>
          <SheetDescription>Receta: cuánto lleva de cada bebida o insumo.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {product?.stock_mode === 'direct' && lines.length === 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Hoy se cuenta como bebida por unidad. Si le cargás la receta, deja de contarse por unidad y al venderse
              descuenta lo que lleva.
            </p>
          )}
          {lines.length === 0 ? (
            product?.stock_mode !== 'direct' && (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">Todavía no tiene receta: no descuenta nada al venderse.</p>
            )
          ) : (
            <div className="space-y-1">
              {lines.map(l => {
                const ins = byId.get(l.ingredient_id);
                return (
                  <div key={l.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                    <span className="flex-1 text-sm">{ins?.name ?? 'Insumo'}</span>
                    <span className="text-sm font-medium">{fmtQty(ins, Number(l.quantity))}</span>
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

          <div className="space-y-3 rounded-lg border p-3">
            <Label>Agregar a la receta</Label>
            {insumos.length > 0 && (
              <IngredientCombobox
                ingredients={insumos.map(i => ({ id: i.id, name: i.bottle_ml ? `${i.name} (${fmtNum(i.bottle_ml, 0)} ml)` : i.name }))}
                value={insumoId}
                onChange={setInsumoId}
                placeholder="Elegí la bebida o insumo"
              />
            )}
            {chosen && (
              <div className="flex items-center gap-2">
                <Input className="flex-1" inputMode="decimal" autoFocus value={qty} onChange={e => setQty(e.target.value)}
                  placeholder={chosenMl != null ? `Cantidad en ${unit}` : `Cantidad en ${chosen.unit || 'unidades'}`}
                  onKeyDown={e => { if (e.key === 'Enter') add.mutate(); }} />
                {chosenMl != null ? (
                  <ToggleGroup type="single" variant="outline" size="sm" value={unit} onValueChange={(v) => v && setUnit(v as 'ml' | 'oz')}>
                    <ToggleGroupItem value="ml">ml</ToggleGroupItem>
                    <ToggleGroupItem value="oz">oz</ToggleGroupItem>
                  </ToggleGroup>
                ) : (
                  <span className="text-sm text-muted-foreground">{chosen.unit}</span>
                )}
                <Button size="icon" onClick={() => add.mutate()} disabled={add.isPending} aria-label="Agregar"><Plus className="h-4 w-4" /></Button>
              </div>
            )}
            {newBottle ? (
              <div className="space-y-2 rounded-md bg-muted/40 p-2">
                <div className="flex gap-2">
                  <Input className="flex-1" autoFocus placeholder="Ej.: Coca-Cola 1,5 L" value={newBottle.name}
                    onChange={e => setNewBottle({ ...newBottle, name: e.target.value })} />
                  <Input className="w-24" inputMode="decimal" placeholder="ml" value={newBottle.ml}
                    onChange={e => setNewBottle({ ...newBottle, ml: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setNewBottle(null)}>Cancelar</Button>
                  <Button size="sm" onClick={() => createBottle.mutate()} disabled={createBottle.isPending}>Crear botella</Button>
                </div>
              </div>
            ) : (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setNewBottle({ name: '', ml: '' })}>
                + No está en la lista: crear botella nueva
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Ej.: Fernet con coca → Fernet 60 ml + Coca-Cola 180 ml.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

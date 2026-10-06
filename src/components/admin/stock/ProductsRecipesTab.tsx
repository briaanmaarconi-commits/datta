import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Plus, X, Package, ShoppingBag, EyeOff, Search, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type StockMode = 'none' | 'direct' | 'recipe';

const MODE_CONFIG = {
  none: { label: 'Sin trackeo', icon: EyeOff, color: 'text-muted-foreground' },
  direct: { label: 'Stock directo', icon: ShoppingBag, color: 'text-blue-500' },
  recipe: { label: 'Por receta', icon: Package, color: 'text-green-500' },
};

export default function ProductsRecipesTab() {
  const { establishmentId } = useAuth();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products-stock', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('products')
        .select('*, categories(name)')
        .eq('establishment_id', establishmentId!)
        .order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const filtered = useMemo(() => products.filter((p: any) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterMode !== 'all' && p.stock_mode !== filterMode) return false;
    return true;
  }), [products, search, filterMode]);

  const grouped = useMemo(() => filtered.reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.categories?.name || 'Sin categoría';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {}), [filtered]);

  const counts = useMemo(() => ({
    total: products.length,
    none: products.filter((p: any) => p.stock_mode === 'none').length,
    direct: products.filter((p: any) => p.stock_mode === 'direct').length,
    recipe: products.filter((p: any) => p.stock_mode === 'recipe').length,
  }), [products]);

  const selectedProduct = products.find((p: any) => p.id === selectedProductId);

  return (
    <div className="space-y-4">
      {/* Stat chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filterMode === 'all'} onClick={() => setFilterMode('all')} label={`Todos (${counts.total})`} />
        <FilterChip active={filterMode === 'none'} onClick={() => setFilterMode('none')} label={`Sin configurar (${counts.none})`} icon={EyeOff} />
        <FilterChip active={filterMode === 'direct'} onClick={() => setFilterMode('direct')} label={`Directo (${counts.direct})`} icon={ShoppingBag} />
        <FilterChip active={filterMode === 'recipe'} onClick={() => setFilterMode('recipe')} label={`Receta (${counts.recipe})`} icon={Package} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Helper if all "none" */}
      {counts.none === counts.total && counts.total > 0 && (
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3 text-sm flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Empezá configurando un producto</p>
            <p className="text-muted-foreground text-xs mt-0.5">Tocá cualquier producto de la lista para definir cómo querés trackear su stock.</p>
          </div>
        </div>
      )}

      {/* Product list */}
      <div className="space-y-3">
        {Object.entries(grouped).map(([cat, prods]) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 px-1">{cat}</h3>
            <Card>
              <CardContent className="p-0 divide-y">
                {(prods as any[]).map((p: any) => (
                  <ProductListItem key={p.id} product={p} onClick={() => setSelectedProductId(p.id)} />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}

        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No se encontraron productos
            </CardContent>
          </Card>
        )}
      </div>

      {/* Side panel for editing */}
      <Sheet open={!!selectedProductId} onOpenChange={(o) => !o && setSelectedProductId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedProduct && (
            <ProductEditor product={selectedProduct} onClose={() => setSelectedProductId(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterChip({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon?: any }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'
      }`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

function ProductListItem({ product, onClick }: { product: any; onClick: () => void }) {
  const mode = product.stock_mode as StockMode;
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  let detail = '';
  if (mode === 'direct') detail = `${Number(product.direct_stock)} u en stock`;
  else if (mode === 'recipe') detail = 'Ver receta';
  else detail = 'Sin configurar';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={`h-4 w-4 flex-shrink-0 ${config.color}`} />
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{product.name}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

// ============== PRODUCT EDITOR (Side Sheet) ==============
function ProductEditor({ product, onClose }: { product: any; onClose: () => void }) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const mode = product.stock_mode as StockMode;

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('ingredients').select('*')
        .eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['product_recipes', product.id],
    queryFn: async () => {
      const { data } = await db.from('product_recipes').select('*, ingredients(name, unit)')
        .eq('product_id', product.id);
      return data || [];
    },
  });

  const modeMutation = useMutation({
    mutationFn: async (newMode: StockMode) => {
      const { error } = await db.from('products').update({ stock_mode: newMode }).eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-stock'] });
      queryClient.invalidateQueries({ queryKey: ['products-direct-stock'] });
    },
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>{product.name}</SheetTitle>
        <SheetDescription>{product.categories?.name || 'Sin categoría'}</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 mt-6">
        {/* Mode selection */}
        <div>
          <Label className="text-sm font-semibold mb-3 block">¿Cómo se trackea el stock?</Label>
          <div className="grid grid-cols-1 gap-2">
            <ModeOption
              mode="none" current={mode} title="Sin trackeo"
              description="No se controla el inventario de este producto"
              onClick={() => modeMutation.mutate('none')}
            />
            <ModeOption
              mode="direct" current={mode} title="Stock directo"
              description="Contás unidades terminadas (ej: bebidas, postres)"
              onClick={() => modeMutation.mutate('direct')}
            />
            <ModeOption
              mode="recipe" current={mode} title="Por receta"
              description="Se descuentan ingredientes al vender (ej: hamburguesa, pizza)"
              onClick={() => modeMutation.mutate('recipe')}
            />
          </div>
        </div>

        {/* Mode-specific config */}
        {mode === 'direct' && <DirectStockConfig product={product} />}
        {mode === 'recipe' && (
          <RecipeConfig
            product={product}
            recipes={recipes}
            ingredients={ingredients}
            establishmentId={establishmentId!}
          />
        )}
      </div>
    </>
  );
}

function ModeOption({ mode, current, title, description, onClick }: {
  mode: StockMode; current: StockMode; title: string; description: string; onClick: () => void;
}) {
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;
  const active = mode === current;
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
        active ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
      }`}
    >
      <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${active ? 'text-primary' : config.color}`} />
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function DirectStockConfig({ product }: { product: any }) {
  const queryClient = useQueryClient();
  const [stock, setStock] = useState(String(product.direct_stock));
  const [minStock, setMinStock] = useState(String(product.direct_min_stock));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('products').update({
        direct_stock: Number(stock) || 0,
        direct_min_stock: Number(minStock) || 0,
      }).eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-stock'] });
      queryClient.invalidateQueries({ queryKey: ['products-direct-stock'] });
      toast({ title: 'Stock guardado' });
    },
  });

  return (
    <div className="space-y-3 pt-2 border-t">
      <Label className="text-sm font-semibold">Cantidad en stock</Label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Stock actual</Label>
          <Input type="number" value={stock} onChange={e => setStock(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Mínimo (alerta)</Label>
          <Input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        Guardar stock
      </Button>
    </div>
  );
}

// ============== RECIPE CONFIG ==============
function RecipeConfig({ product, recipes, ingredients, establishmentId }: {
  product: any; recipes: any[]; ingredients: any[]; establishmentId: string;
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedIngId, setSelectedIngId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [newIng, setNewIng] = useState({ name: '', unit: 'g' });

  const usedIngIds = new Set(recipes.map((r: any) => r.ingredient_id));
  const availableIngredients = ingredients.filter((i: any) => !usedIngIds.has(i.id));

  const addIngredientMutation = useMutation({
    mutationFn: async () => {
      let ingId = selectedIngId;
      // Create new ingredient if needed
      if (creatingNew) {
        if (!newIng.name.trim()) throw new Error('El nombre es requerido');
        const { data, error } = await db.from('ingredients').insert({
          establishment_id: establishmentId,
          name: newIng.name.trim(),
          unit: newIng.unit,
        }).select().single();
        if (error) throw error;
        ingId = data.id;
      }
      if (!ingId) throw new Error('Seleccioná un ingrediente');
      if (!quantity || Number(quantity) <= 0) throw new Error('Cantidad inválida');

      const { error } = await db.from('product_recipes').insert({
        product_id: product.id,
        ingredient_id: ingId,
        quantity: Number(quantity),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_recipes', product.id] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast({ title: 'Ingrediente agregado a la receta' });
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('product_recipes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_recipes', product.id] });
    },
  });

  function resetForm() {
    setShowAdd(false);
    setCreatingNew(false);
    setSelectedIngId('');
    setQuantity('');
    setNewIng({ name: '', unit: 'g' });
  }

  const selectedUnit = creatingNew
    ? newIng.unit
    : ingredients.find((i: any) => i.id === selectedIngId)?.unit || '';

  // Costo calculado por receta
  const recipeCost = recipes.reduce((sum: number, r: any) => {
    const ing = ingredients.find((i: any) => i.id === r.ingredient_id) as any;
    return sum + Number(r.quantity) * Number(ing?.cost_per_unit ?? 0);
  }, 0);

  const costMode = (product.cost_mode || 'manual') as 'manual' | 'recipe';

  const costModeMutation = useMutation({
    mutationFn: async (newMode: 'manual' | 'recipe') => {
      const updates: any = { cost_mode: newMode };
      if (newMode === 'recipe') updates.cost = recipeCost;
      const { error } = await db.from('products').update(updates).eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-stock'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Modo de costo actualizado' });
    },
  });

  // Mantener products.cost sincronizado cuando está en modo receta
  const syncRecipeCost = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('products').update({ cost: recipeCost }).eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  return (
    <div className="space-y-3 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Receta ({recipes.length} ingrediente{recipes.length !== 1 ? 's' : ''})</Label>
      </div>

      {/* Cost mode toggle */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">Costo del plato</Label>
        <div className="flex gap-1 p-1 bg-muted rounded-md">
          <button
            onClick={() => costModeMutation.mutate('manual')}
            className={`flex-1 text-xs py-1.5 rounded ${costMode === 'manual' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
          >
            Manual
          </button>
          <button
            onClick={() => costModeMutation.mutate('recipe')}
            className={`flex-1 text-xs py-1.5 rounded ${costMode === 'recipe' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
          >
            Calculado por receta
          </button>
        </div>
        {costMode === 'recipe' ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Costo calculado:</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary">${recipeCost.toFixed(2)}</span>
              {Math.abs(Number(product.cost) - recipeCost) > 0.01 && (
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => syncRecipeCost.mutate()}>
                  Sincronizar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">El costo se carga manualmente en la sección Costos.</p>
        )}
      </div>

      {recipes.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground italic">Aún no agregaste ingredientes a esta receta.</p>
      )}

      {/* Recipe items */}
      {recipes.length > 0 && (
        <div className="space-y-1.5">
          {recipes.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
              <div className="text-sm">
                <span className="font-medium">{r.quantity} {r.ingredients?.unit}</span>
                <span className="text-muted-foreground"> · {r.ingredients?.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMutation.mutate(r.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {!showAdd ? (
        <Button variant="outline" className="w-full" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" />Agregar ingrediente
        </Button>
      ) : (
        <div className="space-y-3 p-3 rounded-lg border bg-card">
          {/* Toggle: existing vs new */}
          <div className="flex gap-1 p-1 bg-muted rounded-md">
            <button
              onClick={() => setCreatingNew(false)}
              className={`flex-1 text-xs py-1.5 rounded ${!creatingNew ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
            >
              Existente
            </button>
            <button
              onClick={() => setCreatingNew(true)}
              className={`flex-1 text-xs py-1.5 rounded ${creatingNew ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
            >
              Crear nuevo
            </button>
          </div>

          {!creatingNew ? (
            <div>
              <Label className="text-xs">Ingrediente</Label>
              {availableIngredients.length === 0 ? (
                <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                  {ingredients.length === 0
                    ? 'No hay ingredientes. Creá uno nuevo arriba.'
                    : 'Ya agregaste todos los ingredientes disponibles.'}
                </div>
              ) : (
                <Select value={selectedIngId} onValueChange={setSelectedIngId}>
                  <SelectTrigger><SelectValue placeholder="Elegir ingrediente" /></SelectTrigger>
                  <SelectContent>
                    {availableIngredients.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Nombre del ingrediente</Label>
                <Input
                  placeholder="Ej: Pan de hamburguesa"
                  value={newIng.name}
                  onChange={e => setNewIng(n => ({ ...n, name: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Unidad de medida</Label>
                <Select value={newIng.unit} onValueChange={v => setNewIng(n => ({ ...n, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">Gramos (g)</SelectItem>
                    <SelectItem value="kg">Kilos (kg)</SelectItem>
                    <SelectItem value="ml">Mililitros (ml)</SelectItem>
                    <SelectItem value="l">Litros (l)</SelectItem>
                    <SelectItem value="u">Unidades (u)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">
              Cantidad usada por plato {selectedUnit && <span className="text-muted-foreground">(en {selectedUnit})</span>}
            </Label>
            <Input
              type="number" step="0.1" min="0"
              placeholder="Ej: 150"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetForm}>Cancelar</Button>
            <Button
              className="flex-1"
              onClick={() => addIngredientMutation.mutate()}
              disabled={addIngredientMutation.isPending}
            >
              Agregar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

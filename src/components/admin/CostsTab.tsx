import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, TrendingUp, TrendingDown, Percent, DollarSign, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface RecipeIngredient {
  quantity: number;
  ingredients: { name: string; unit: string; cost_per_unit: number } | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  cost_mode?: 'manual' | 'recipe';
  tax_percentage: number;
  promo_price: number | null;
  promo_active: boolean;
  image_url: string | null;
  categories?: { name: string } | null;
  product_recipes?: RecipeIngredient[];
}

interface CostsTabProps {
  products: Product[];
  establishmentId: string;
}

export default function CostsTab({ products, establishmentId }: CostsTabProps) {
  const queryClient = useQueryClient();
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [cost, setCost] = useState('');
  const [taxPct, setTaxPct] = useState('');
  const [desiredMargin, setDesiredMargin] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [promoPrice, setPromoPrice] = useState('');
  const [promoActive, setPromoActive] = useState(false);

  // Bulk adjustment
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkType, setBulkType] = useState<'percent' | 'fixed'>('percent');
  const [bulkDirection, setBulkDirection] = useState<'up' | 'down'>('up');
  const [bulkValue, setBulkValue] = useState('');

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setCost(String(p.cost || 0));
    setTaxPct(String(p.tax_percentage || 0));
    setManualPrice(String(p.price || 0));
    setDesiredMargin('');
    setPromoPrice(p.promo_price != null ? String(p.promo_price) : '');
    setPromoActive(p.promo_active || false);
    setCostMode((p.cost_mode === 'recipe' ? 'recipe' : 'manual'));
  };


  const [costMode, setCostMode] = useState<'manual' | 'recipe'>('manual');

  const updateCost = useMutation({
    mutationFn: async () => {
      if (!editProduct) return;
      const costVal = parseFloat(cost) || 0;
      const taxVal = parseFloat(taxPct) || 0;
      const promoVal = promoPrice ? parseFloat(promoPrice) : null;
      const priceVal = parseFloat(manualPrice) || editProduct.price;

      const updateData: any = {
        tax_percentage: taxVal,
        price: priceVal,
        promo_price: promoVal,
        promo_active: promoActive && promoVal != null,
        cost_mode: costMode,
      };
      // Solo persistir el costo manual si está en modo manual
      if (costMode === 'manual') {
        updateData.cost = costVal;
      }

      const { error } = await supabase.from('products').update(updateData).eq('id', editProduct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-with-recipes'] });
      toast.success('Costos actualizados');
      setEditProduct(null);
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const bulkAdjust = useMutation({
    mutationFn: async () => {
      const val = parseFloat(bulkValue);
      if (!val || val <= 0) throw new Error('Valor inválido');

      const updates = products.map(p => {
        let newPrice = p.price;
        if (bulkType === 'percent') {
          const delta = p.price * (val / 100);
          newPrice = bulkDirection === 'up' ? p.price + delta : p.price - delta;
        } else {
          newPrice = bulkDirection === 'up' ? p.price + val : p.price - val;
        }
        newPrice = Math.max(0, Math.round(newPrice * 100) / 100);
        return { id: p.id, price: newPrice };
      });

      for (const u of updates) {
        const { error } = await supabase.from('products').update({ price: u.price }).eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Precios actualizados');
      setBulkOpen(false);
      setBulkValue('');
    },
    onError: () => toast.error('Error al ajustar precios'),
  });

  const togglePromo = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('products').update({ promo_active: !active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const getEffectiveCost = (p: Product) => {
    if (p.cost_mode === 'recipe' && p.product_recipes && p.product_recipes.length > 0) {
      return p.product_recipes.reduce((s, r) => s + Number(r.quantity) * Number(r.ingredients?.cost_per_unit ?? 0), 0);
    }
    return Number(p.cost) || 0;
  };

  const calcMargin = (p: Product) => {
    const finalPrice = p.promo_active && p.promo_price != null ? p.promo_price : p.price;
    const taxAmount = finalPrice * ((p.tax_percentage || 0) / 100);
    const netRevenue = finalPrice - taxAmount;
    const costVal = getEffectiveCost(p);
    if (costVal === 0) return { margin: 0, marginPct: 0, netRevenue, taxAmount, finalPrice, costVal };
    const margin = netRevenue - costVal;
    const marginPct = (margin / costVal) * 100;
    return { margin, marginPct: Math.round(marginPct * 10) / 10, netRevenue, taxAmount, finalPrice, costVal };
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" className="gap-2" onClick={() => setBulkOpen(true)}>
          <Percent className="h-4 w-4" /> Ajustar precios masivamente
        </Button>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuste masivo de precios</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={bulkDirection === 'up' ? 'default' : 'outline'}
                onClick={() => setBulkDirection('up')}
                className="flex-1 gap-2"
              >
                <TrendingUp className="h-4 w-4" /> Subir
              </Button>
              <Button
                variant={bulkDirection === 'down' ? 'default' : 'outline'}
                onClick={() => setBulkDirection('down')}
                className="flex-1 gap-2"
              >
                <TrendingDown className="h-4 w-4" /> Bajar
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={bulkType === 'percent' ? 'default' : 'outline'}
                onClick={() => setBulkType('percent')}
                className="flex-1 gap-2"
              >
                <Percent className="h-4 w-4" /> Porcentaje
              </Button>
              <Button
                variant={bulkType === 'fixed' ? 'default' : 'outline'}
                onClick={() => setBulkType('fixed')}
                className="flex-1 gap-2"
              >
                <DollarSign className="h-4 w-4" /> Pesos
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Valor {bulkType === 'percent' ? '(%)' : '($)'}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                placeholder={bulkType === 'percent' ? 'Ej: 10' : 'Ej: 50'}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Esto {bulkDirection === 'up' ? 'subirá' : 'bajará'} el precio de <strong>todos los productos</strong> en{' '}
              {bulkType === 'percent' ? `${bulkValue || '0'}%` : `$${bulkValue || '0'}`}
            </p>
            <Button
              className="w-full"
              onClick={() => bulkAdjust.mutate()}
              disabled={bulkAdjust.isPending || !bulkValue}
            >
              {bulkAdjust.isPending ? 'Aplicando...' : 'Aplicar ajuste'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit single product costs */}
      <Dialog open={!!editProduct} onOpenChange={(v) => { if (!v) setEditProduct(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Costos: {editProduct?.name}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); updateCost.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Modo de costo</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={costMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setCostMode('manual')}
                >
                  Manual
                </Button>
                <Button
                  type="button"
                  variant={costMode === 'recipe' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setCostMode('recipe')}
                  disabled={!editProduct?.product_recipes || editProduct.product_recipes.length === 0}
                  title={!editProduct?.product_recipes || editProduct.product_recipes.length === 0 ? 'Cargá ingredientes en Stock → Productos y Recetas' : ''}
                >
                  Calculado por receta
                </Button>
              </div>
              {(!editProduct?.product_recipes || editProduct.product_recipes.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  Para usar costo por receta, primero cargá los ingredientes del plato en <strong>Stock → Productos y Recetas</strong>.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Costo del plato ($)</Label>
              {costMode === 'recipe' ? (
                <div className="rounded-md border bg-muted/40 p-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Calculado automáticamente desde stock:</span>
                    <span className="font-bold">${(editProduct ? getEffectiveCost({ ...editProduct, cost_mode: 'recipe' }) : 0).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Suma del costo de cada ingrediente según las compras registradas (promedio ponderado).</p>
                </div>
              ) : (
                <Input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} placeholder="Ej: 500" />
              )}
            </div>
            <div className="space-y-2">
              <Label>IVA (%)</Label>
              <div className="flex gap-2 flex-wrap mb-2">
                {[0, 10.5, 21, 27].map(rate => (
                  <Button
                    key={rate}
                    type="button"
                    variant={parseFloat(taxPct) === rate ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTaxPct(String(rate))}
                  >
                    {rate === 0 ? 'Exento' : `${rate}%`}
                  </Button>
                ))}
              </div>
              <Input type="number" step="0.01" min="0" max="100" value={taxPct} onChange={e => setTaxPct(e.target.value)} placeholder="Otro %" />
            </div>
            <div className="space-y-2">
              <Label>Precio de venta ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={manualPrice}
                onChange={e => {
                  const val = e.target.value;
                  setManualPrice(val);
                  // Recalculate margin from new price
                  const priceVal = parseFloat(val) || 0;
                  const costVal = parseFloat(cost) || 0;
                  const taxVal = parseFloat(taxPct) || 0;
                  if (costVal > 0 && priceVal > 0) {
                    const net = priceVal * (1 - taxVal / 100);
                    const m = ((net - costVal) / costVal) * 100;
                    setDesiredMargin(String(Math.round(m * 10) / 10));
                  } else {
                    setDesiredMargin('');
                  }
                }}
                placeholder="Ej: 1500"
              />
            </div>
            <div className="space-y-2">
              <Label>Margen de ganancia deseado (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={desiredMargin}
                onChange={e => {
                  const val = e.target.value;
                  setDesiredMargin(val);
                  // Recalculate price from margin
                  const costVal = parseFloat(cost) || 0;
                  const taxVal = parseFloat(taxPct) || 0;
                  const marginVal = parseFloat(val) || 0;
                  if (costVal > 0) {
                    const denominator = 1 - taxVal / 100;
                    if (denominator > 0) {
                      const suggested = Math.round((costVal * (1 + marginVal / 100)) / denominator * 100) / 100;
                      setManualPrice(String(suggested));
                    }
                  }
                }}
                placeholder="Ej: 50"
              />
            </div>
            <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
              <p className="text-sm font-medium">Margen calculado:</p>
              {editProduct && (() => {
                const costVal = costMode === 'recipe' && editProduct ? getEffectiveCost({ ...editProduct, cost_mode: 'recipe' }) : (parseFloat(cost) || 0);
                const taxVal = parseFloat(taxPct) || 0;
                const activePrice = promoActive && promoPrice ? parseFloat(promoPrice) : (parseFloat(manualPrice) || 0);
                const taxAmt = activePrice * (taxVal / 100);
                const net = activePrice - taxAmt;
                const margin = net - costVal;
                const marginPct = costVal > 0 ? ((margin / costVal) * 100).toFixed(1) : '∞';
                return (
                  <>
                    <p className="text-sm">IVA: <span className="font-medium">${taxAmt.toFixed(2)}</span></p>
                    <p className="text-sm">Ingreso neto: <span className="font-medium">${net.toFixed(2)}</span></p>
                    <p className={`text-sm font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Ganancia: ${margin.toFixed(2)} ({marginPct}%)
                    </p>
                  </>
                );
              })()}
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2"><Tag className="h-4 w-4" /> Promoción</Label>
                <Switch checked={promoActive} onCheckedChange={setPromoActive} />
              </div>
              {promoActive && (
                <div className="space-y-2">
                  <Label>Precio promocional ($)</Label>
                  <Input type="number" step="0.01" min="0" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} />
                  {promoPrice && editProduct && (
                    <p className="text-xs text-muted-foreground">
                      Descuento: {((1 - parseFloat(promoPrice) / editProduct.price) * 100).toFixed(0)}% sobre precio original
                    </p>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={updateCost.isPending}>
              {updateCost.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Products list grouped by category */}
      {(() => {
        const groups = new Map<string, Product[]>();
        products.forEach((p) => {
          const key = (p as any).categories?.name || 'Sin categoría';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(p);
        });
        const sorted = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));

        return (
          <div className="space-y-6">
            {sorted.map(([catName, items]) => (
              <section key={catName} className="space-y-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h2 className="font-semibold text-base">{catName}</h2>
                  <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((p: Product) => {
                    const { margin, marginPct, costVal } = calcMargin(p);
                    const isRecipe = p.cost_mode === 'recipe';
                    return (
                      <Card key={p.id} className="overflow-hidden">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3">
                            {p.image_url && (
                              <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded object-cover flex-shrink-0" loading="lazy" />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm">{p.name}</h3>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <Badge variant="outline" className="text-xs">Precio: ${Number(p.price).toFixed(2)}</Badge>
                                <Badge variant="outline" className="text-xs" title={isRecipe ? 'Calculado por receta' : 'Costo manual'}>
                                  Costo: ${costVal.toFixed(2)}{isRecipe ? ' 🧮' : ''}
                                </Badge>
                                {p.tax_percentage > 0 && (
                                  <Badge variant="outline" className="text-xs">IVA: {p.tax_percentage}%</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <Badge className={`text-xs ${margin >= 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                                  Margen: {marginPct}%  (${margin.toFixed(2)})
                                </Badge>
                                {p.promo_active && p.promo_price != null && (
                                  <Badge className="text-xs bg-orange-500 hover:bg-orange-600">
                                    Promo: ${Number(p.promo_price).toFixed(2)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {p.promo_price != null && (
                                <Switch
                                  checked={p.promo_active}
                                  onCheckedChange={() => togglePromo.mutate({ id: p.id, active: p.promo_active })}
                                />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        );
      })()}

    </div>
  );
}

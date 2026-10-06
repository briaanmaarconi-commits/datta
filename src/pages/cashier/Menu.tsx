import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MenuCombosTab, { ComboLine } from '@/components/menu/MenuCombosTab';
import { groupFromCategoryName } from '@/lib/menuGroups';
import { parseAmount } from '@/lib/parseAmount';
import MarginPreview from '@/components/shared/MarginPreview';


async function uploadImage(file: File, path: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${path}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from('product-images').upload(fileName, file);
  if (error) throw error;
  const { data } = db.storage.from('product-images').getPublicUrl(fileName);
  return data.publicUrl;
}

export default function CashierMenu() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const [catOpen, setCatOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editProdId, setEditProdId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodTax, setProdTax] = useState('21');
  const [prodCatId, setProdCatId] = useState('');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodDailySpecial, setProdDailySpecial] = useState(false);
  const [prodPromoActive, setProdPromoActive] = useState(false);
  const [prodPromoPrice, setProdPromoPrice] = useState('');
  const [prodImageFile, setProdImageFile] = useState<File | null>(null);
  const [prodImagePreview, setProdImagePreview] = useState<string | null>(null);
  const [prodWasDaily, setProdWasDaily] = useState(false);
  const [menuTab, setMenuTab] = useState('products');
  const [comboSeed, setComboSeed] = useState<ComboLine[] | undefined>(undefined);
  const [comboSignal, setComboSignal] = useState(0);


  const { data: categories = [] } = useQuery({
    queryKey: ['categories', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('categories')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('*, categories(name)')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const resetCatForm = () => {
    setCatOpen(false);
    setEditCatId(null);
    setCatName('');
  };

  const resetProdForm = () => {
    setProdOpen(false);
    setEditProdId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdCost('');
    setProdTax('21');
    setProdCatId('');
    setProdAvailable(true);
    setProdDailySpecial(false);
    setProdWasDaily(false);

    setProdPromoActive(false);
    setProdPromoPrice('');
    setProdImageFile(null);
    setProdImagePreview(null);
  };

  const upsertCategory = useMutation({
    mutationFn: async () => {
      if (editCatId) {
        const { error } = await db.from('categories').update({ name: catName }).eq('id', editCatId);
        if (error) throw error;
      } else {
        const { error } = await db.from('categories').insert({
          name: catName,
          establishment_id: establishmentId!,
          sort_order: categories.length,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría guardada');
      resetCatForm();
    },
    onError: () => toast.error('Error al guardar categoría'),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Categoría eliminada');
    },
    onError: (err: any) => {
      const msg = err?.message?.includes('tiene productos asociados')
        ? 'No se puede eliminar: tiene productos asociados.'
        : 'Error al eliminar categoría';
      toast.error(msg);
    },
  });

  const toggleCategory = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await db.from('categories').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const upsertProduct = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (prodImageFile) {
        imageUrl = await uploadImage(prodImageFile, `products/${establishmentId}`);
      }
      const payload: any = {
        name: prodName,
        description: prodDesc || null,
        price: parseAmount(prodPrice),
        cost: parseAmount(prodCost),
        tax_percentage: parseAmount(prodTax) || 0,
        category_id: prodCatId,
        establishment_id: establishmentId!,
        is_available: prodAvailable,
        is_daily_special: prodDailySpecial,
        promo_active: prodPromoActive,
        promo_price: prodPromoActive && prodPromoPrice ? parseAmount(prodPromoPrice) : null,
      };
      if (imageUrl) payload.image_url = imageUrl;
      let productId = editProdId;
      if (editProdId) {
        const { error } = await db.from('products').update(payload).eq('id', editProdId);
        if (error) throw error;
      } else {
        const { data, error } = await db.from('products').insert(payload).select('id').single();
        if (error) throw error;
        productId = data.id;
      }
      const catName = categories.find((c: any) => c.id === prodCatId)?.name;
      return {
        justMarked: prodDailySpecial && !prodWasDaily,
        line: {
          product_id: productId!,
          name: prodName,
          price: parseAmount(prodPrice) || 0,
          item_group: groupFromCategoryName(catName),
        } as ComboLine,
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto guardado');
      resetProdForm();
      if (res?.justMarked) {
        toast(`Sumaste "${res.line.name}" al menú del día`, {
          description: '¿Querés armar un combo con postre y/o bebida?',
          duration: 10000,
          action: {
            label: 'Armar combo',
            onClick: () => {
              setComboSeed([res.line]);
              setComboSignal(s => s + 1);
              setMenuTab('combos');
            },
          },
          cancel: { label: 'Ahora no', onClick: () => {} },
        });
      }
    },

    onError: () => toast.error('Error al guardar producto'),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto eliminado');
    },
    onError: () => toast.error('Error al eliminar producto'),
  });

  const toggleProduct = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { error } = await db.from('products').update({ is_available: !is_available }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const startEditProd = (p: any) => {
    setEditProdId(p.id);
    setProdName(p.name);
    setProdDesc(p.description || '');
    setProdPrice(String(p.price));
    setProdCost(p.cost != null && Number(p.cost) > 0 ? String(p.cost) : '');
    setProdTax(String(p.tax_percentage ?? 21));
    setProdCatId(p.category_id);
    setProdAvailable(p.is_available);
    setProdDailySpecial(p.is_daily_special || false);
    setProdWasDaily(p.is_daily_special || false);

    setProdPromoActive(p.promo_active || false);
    setProdPromoPrice(p.promo_price != null ? String(p.promo_price) : String(p.price));
    setProdImagePreview(p.image_url || null);
    setProdImageFile(null);
    setProdOpen(true);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Carta</h1>
      <Tabs value={menuTab} onValueChange={setMenuTab}>
        <TabsList>
          <TabsTrigger value="products">Productos ({products.length})</TabsTrigger>
          <TabsTrigger value="categories">Categorías ({categories.length})</TabsTrigger>
          <TabsTrigger value="combos">Combos del día</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4 mt-4">
          <Dialog open={prodOpen} onOpenChange={(v) => { if (!v) resetProdForm(); else setProdOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo producto</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editProdId ? 'Editar' : 'Nuevo'} producto</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); upsertProduct.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={prodName} onChange={e => setProdName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea value={prodDesc} onChange={e => setProdDesc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Precio</Label>
                  <Input inputMode="decimal" value={prodPrice} onChange={e => setProdPrice(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Costo (opcional)</Label>
                  <Input inputMode="decimal" value={prodCost} onChange={e => setProdCost(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>IVA (%)</Label>
                  <Input inputMode="decimal" value={prodTax} onChange={e => setProdTax(e.target.value)} placeholder="21" />
                  <MarginPreview price={prodPrice} cost={prodCost} taxPct={prodTax} />
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={prodCatId} onValueChange={setProdCatId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent className="z-[60] bg-popover">
                      {categories.filter((c: any) => c.is_active).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Imagen (opcional)</Label>
                  {prodImagePreview && (
                    <div className="relative w-20 h-20">
                      <img src={prodImagePreview} alt="" className="w-20 h-20 rounded object-cover" />
                      <button
                        type="button"
                        onClick={() => { setProdImageFile(null); setProdImagePreview(null); }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setProdImageFile(f); setProdImagePreview(URL.createObjectURL(f)); }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={prodAvailable} onCheckedChange={setProdAvailable} />
                  <Label>Disponible</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={prodDailySpecial} onCheckedChange={setProdDailySpecial} />
                  <Label>⭐ Menú del día</Label>
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={prodPromoActive}
                      onCheckedChange={v => {
                        setProdPromoActive(v);
                        if (v && !prodPromoPrice) setProdPromoPrice(prodPrice);
                      }}
                    />
                    <Label>Precio del menú (distinto al de carta)</Label>
                  </div>
                  {prodPromoActive && (
                    <>
                      <Input
                        inputMode="decimal"
                        value={prodPromoPrice}
                        onChange={e => setProdPromoPrice(e.target.value)}
                        placeholder="0,00"
                      />
                      <p className="text-xs text-muted-foreground">
                        El cliente ve este precio y el de carta tachado.
                      </p>
                    </>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={upsertProduct.isPending}>Guardar</Button>
              </form>
            </DialogContent>
          </Dialog>

          <div className="grid gap-3 md:grid-cols-2">
            {products.map((p: any) => (
              <Card key={p.id} className={!p.is_available ? 'opacity-50' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded object-cover shrink-0" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{p.description}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {p.promo_active && p.promo_price != null ? (
                          <>
                            <Badge className="bg-amber-500 hover:bg-amber-600">${Number(p.promo_price).toFixed(2)}</Badge>
                            <Badge variant="outline" className="line-through text-muted-foreground">${Number(p.price).toFixed(2)}</Badge>
                          </>
                        ) : (
                          <Badge>${Number(p.price).toFixed(2)}</Badge>
                        )}
                        <Badge variant="outline">{p.categories?.name}</Badge>
                        {p.is_daily_special && <Badge className="bg-amber-500 hover:bg-amber-600">⭐ Menú del día</Badge>}
                        {!p.is_available && <Badge variant="secondary">No disponible</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1 items-center shrink-0">
                      <Switch checked={p.is_available} onCheckedChange={() => toggleProduct.mutate({ id: p.id, is_available: p.is_available })} />
                      <Button variant="ghost" size="icon" onClick={() => startEditProd(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        toast('¿Eliminar este producto?', {
                          description: `"${p.name}" se eliminará permanentemente.`,
                          action: { label: 'Sí, eliminar', onClick: () => deleteProduct.mutate(p.id) },
                          duration: 6000,
                        });
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 mt-4">
          <Dialog open={catOpen} onOpenChange={(v) => { if (!v) resetCatForm(); else setCatOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nueva categoría</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editCatId ? 'Editar' : 'Nueva'} categoría</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); upsertCategory.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={catName} onChange={e => setCatName(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={upsertCategory.isPending}>Guardar</Button>
              </form>
            </DialogContent>
          </Dialog>

          <div className="grid gap-3">
            {categories.map((cat: any) => (
              <Card key={cat.id} className={!cat.is_active ? 'opacity-50' : ''}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{cat.name}</span>
                    {!cat.is_active && <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <div className="flex gap-2 items-center">
                    <Switch checked={cat.is_active} onCheckedChange={() => toggleCategory.mutate({ id: cat.id, is_active: cat.is_active })} />
                    <Button variant="ghost" size="icon" onClick={() => { setEditCatId(cat.id); setCatName(cat.name); setCatOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => {
                      toast('¿Eliminar esta categoría?', {
                        description: `"${cat.name}" se eliminará.`,
                        action: { label: 'Sí, eliminar', onClick: () => deleteCategory.mutate(cat.id) },
                        duration: 6000,
                      });
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="combos" className="mt-4">
          <MenuCombosTab
            establishmentId={establishmentId}
            products={products}
            initialLines={comboSeed}
            openSignal={comboSignal}
          />

        </TabsContent>
      </Tabs>
    </div>
  );
}

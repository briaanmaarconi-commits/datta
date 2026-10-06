import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Pencil, Trash2, GripVertical, X } from 'lucide-react';
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
import AdminReviewsSection from '@/components/admin/AdminReviewsSection';
import MenuQRCodes from '@/components/admin/MenuQRCodes';
import { useAuditLog } from '@/hooks/useAuditLog';
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

export default function AdminMenu() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const { log: auditLog } = useAuditLog();

  const [catOpen, setCatOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editProdId, setEditProdId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catImageFile, setCatImageFile] = useState<File | null>(null);
  const [catImagePreview, setCatImagePreview] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodTax, setProdTax] = useState('21');
  const [prodCatId, setProdCatId] = useState('');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodImageFile, setProdImageFile] = useState<File | null>(null);
  const [prodImagePreview, setProdImagePreview] = useState<string | null>(null);
  const [prodDailySpecial, setProdDailySpecial] = useState(false);
  const [prodPromoActive, setProdPromoActive] = useState(false);
  const [prodPromoPrice, setProdPromoPrice] = useState('');
  const [prodWasDaily, setProdWasDaily] = useState(false);
  const [menuTab, setMenuTab] = useState('categories');
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

  const upsertCategory = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (catImageFile) {
        imageUrl = await uploadImage(catImageFile, `categories/${establishmentId}`);
      }
      if (editCatId) {
        const update: any = { name: catName };
        if (imageUrl) update.image_url = imageUrl;
        const { error } = await db.from('categories').update(update).eq('id', editCatId);
        if (error) throw error;
      } else {
        const insert: any = {
          name: catName,
          establishment_id: establishmentId!,
          sort_order: categories.length,
        };
        if (imageUrl) insert.image_url = imageUrl;
        const { error } = await db.from('categories').insert(insert);
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
      return id;
    },
    onSuccess: (id) => {
      auditLog('delete', 'categories', id);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Categoría eliminada');
    },
    onError: (err: any) => {
      const msg = err?.message?.includes('tiene productos asociados')
        ? 'No se puede eliminar: tiene productos asociados. Mové o eliminá los productos primero.'
        : 'Error al eliminar categoría';
      toast.error(msg);
    },
  });

  const toggleCategory = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await db.from('categories').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
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
      const justMarked = prodDailySpecial && !prodWasDaily;
      const catName = categories.find((c: any) => c.id === prodCatId)?.name;
      return {
        justMarked,
        line: {
          product_id: productId!,
          name: prodName,
          price: parseFloat(prodPrice) || 0,
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
      return id;
    },
    onSuccess: (id) => {
      auditLog('delete', 'products', id);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto eliminado');
    },
  });

  const toggleProduct = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { error } = await db.from('products').update({ is_available: !is_available }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const resetCatForm = () => {
    setCatOpen(false);
    setEditCatId(null);
    setCatName('');
    setCatImageFile(null);
    setCatImagePreview(null);
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

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setPreview: (s: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Menú</h1>
      <Tabs value={menuTab} onValueChange={setMenuTab}>
        <TabsList>
          <TabsTrigger value="categories">Categorías ({categories.length})</TabsTrigger>
          <TabsTrigger value="products">Productos ({products.length})</TabsTrigger>
          <TabsTrigger value="combos">Combos del día</TabsTrigger>
          <TabsTrigger value="qr">QR</TabsTrigger>
          <TabsTrigger value="reviews">Reseñas</TabsTrigger>
        </TabsList>

        <TabsContent value="combos" className="mt-4">
          <MenuCombosTab
            establishmentId={establishmentId}
            products={products}
            initialLines={comboSeed}
            openSignal={comboSignal}
          />

        </TabsContent>

        <TabsContent value="qr" className="mt-4">
          <MenuQRCodes />
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
                <div className="space-y-2">
                  <Label>Imagen (opcional)</Label>
                  {catImagePreview && (
                    <div className="relative w-20 h-20">
                      <img src={catImagePreview} alt="" className="w-20 h-20 rounded object-cover" />
                      <button type="button" onClick={() => { setCatImageFile(null); setCatImagePreview(null); }} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <Input type="file" accept="image/*" onChange={e => handleFileSelect(e, setCatImageFile, setCatImagePreview)} />
                </div>
                <Button type="submit" className="w-full" disabled={upsertCategory.isPending}>Guardar</Button>
              </form>
            </DialogContent>
          </Dialog>

          <div className="grid gap-3">
            {categories.map(cat => (
              <Card key={cat.id} className={`group relative overflow-hidden rounded-2xl border-border/70 shadow-sm hover:border-primary/40 hover:shadow-lg transition-all ${!(cat as any).is_active ? 'opacity-50' : ''}`}>
                <span className="absolute left-0 top-0 h-full w-1 bg-primary/70 group-hover:bg-primary transition-colors" />
                <CardContent className="flex items-center justify-between py-4 pl-6 pr-5">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-5 w-5 text-muted-foreground/40 cursor-grab active:cursor-grabbing transition-colors group-hover:text-primary" />
                    {(cat as any).image_url ? (
                      <img src={(cat as any).image_url} alt={cat.name} className="w-12 h-12 rounded-xl object-cover ring-1 ring-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-display text-lg font-bold">{cat.name?.charAt(0)?.toUpperCase()}</div>
                    )}
                    <span className="font-display font-semibold text-lg">{cat.name}</span>
                    {!cat.is_active && <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={cat.is_active} onCheckedChange={() => toggleCategory.mutate({ id: cat.id, is_active: cat.is_active })} />
                    <Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-primary transition-colors" onClick={() => { setEditCatId(cat.id); setCatName(cat.name); setCatImagePreview((cat as any).image_url || null); setCatOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-lg transition-colors hover:bg-destructive/10" onClick={() => {
                      toast('¿Eliminar esta categoría?', {
                        description: `"${cat.name}" y todo su contenido se perderán.`,
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

        <TabsContent value="products" className="space-y-4 mt-4">
          <Dialog open={prodOpen} onOpenChange={(v) => { if (!v) resetProdForm(); else setProdOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo producto</Button>
            </DialogTrigger>
            <DialogContent>
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
                  <Input type="number" step="0.01" min="0" value={prodPrice} onChange={e => setProdPrice(e.target.value)} required />
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
                    <SelectContent>
                      {categories.filter(c => c.is_active).map(c => (
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
                      <button type="button" onClick={() => { setProdImageFile(null); setProdImagePreview(null); }} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <Input type="file" accept="image/*" onChange={e => handleFileSelect(e, setProdImageFile, setProdImagePreview)} />
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
              <Card key={p.id} className={`group relative overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all ${!p.is_available ? 'opacity-50' : ''}`}>
                <span className="absolute left-0 top-0 h-full w-1 bg-primary/70 group-hover:bg-primary transition-colors" />
                <CardContent className="py-4 pl-6 pr-5">
                  <div className="flex items-start justify-between gap-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 ring-1 ring-border" loading="lazy" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl flex-shrink-0 bg-primary/10 text-primary flex items-center justify-center font-display text-xl font-bold">
                        {p.name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-base leading-tight">{p.name}</h3>
                      {p.description && <p className="text-sm text-muted-foreground truncate mt-0.5">{p.description}</p>}
                      <div className="flex items-baseline gap-2 mt-2">
                        {p.promo_active && p.promo_price != null ? (
                          <>
                            <span className="font-display text-lg font-bold text-primary">${Number(p.promo_price).toLocaleString('es-AR')}</span>
                            <span className="text-sm line-through text-muted-foreground">${Number(p.price).toLocaleString('es-AR')}</span>
                          </>
                        ) : (
                          <span className="font-display text-lg font-bold text-foreground">${Number(p.price).toLocaleString('es-AR')}</span>
                        )}
                      </div>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {p.categories?.name && <Badge variant="outline" className="rounded-full font-normal text-xs">{p.categories.name}</Badge>}
                        {p.is_daily_special && <Badge className="rounded-full text-xs bg-primary/10 text-primary hover:bg-primary/15 border-0">⭐ Menú del día</Badge>}
                        {!p.is_available && <Badge variant="secondary" className="rounded-full text-xs">No disponible</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={p.is_available} onCheckedChange={() => toggleProduct.mutate({ id: p.id, is_available: p.is_available })} />
                      <Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-primary transition-colors" onClick={() => startEditProd(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="rounded-lg transition-colors hover:bg-destructive/10" onClick={() => {
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
        <TabsContent value="reviews" className="space-y-6 mt-4">
          <AdminReviewsSection establishmentId={establishmentId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

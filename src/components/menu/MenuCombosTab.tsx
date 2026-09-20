import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Search, UtensilsCrossed, ExternalLink, Star } from 'lucide-react';
import { toast } from 'sonner';
import { GROUP_LABELS_SINGULAR, MenuGroup, groupFromCategoryName } from '@/lib/menuGroups';
import { parseAmount } from '@/lib/parseAmount';

export interface ComboLine {
  product_id: string;
  name: string;
  price: number;
  item_group: MenuGroup;
}

interface MenuCombosTabProps {
  establishmentId?: string | null;
  products: any[];
  /** Línea precargada (por ejemplo, el plato recién marcado como menú del día). */
  initialLines?: ComboLine[];
  /** Cambiar este número abre el diálogo con las líneas precargadas. */
  openSignal?: number;
}


async function uploadImage(file: File, path: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${path}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(fileName, file);
  if (error) throw error;
  const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
  return data.publicUrl;
}

export default function MenuCombosTab({ establishmentId, products, initialLines, openSignal }: MenuCombosTabProps) {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<ComboLine[]>([]);
  const [search, setSearch] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const { data: combos = [] } = useQuery({
    queryKey: ['menu-combos', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_combos')
        .select('*, menu_combo_items(id, product_id, item_group, sort_order, products(name, price))')
        .eq('establishment_id', establishmentId!)
        .order('created_at');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!establishmentId,
  });

  const suggested = useMemo(() => lines.reduce((s, l) => s + l.price, 0), [lines]);

  const dailyCount = useMemo(() => products.filter((p: any) => p.is_daily_special).length, [products]);
  const activeCombosCount = useMemo(() => combos.filter((c: any) => c.is_active).length, [combos]);
  const clientMenuUrl = establishmentId ? `/carta/${establishmentId}` : null;

  // Abrir el diálogo precargado desde la pantalla de productos
  const lastSignal = useRef<number | undefined>(openSignal);
  useEffect(() => {
    if (openSignal === undefined || openSignal === lastSignal.current) return;
    lastSignal.current = openSignal;
    setEditId(null);
    setName(initialLines?.[0]?.name ? `Menú ${initialLines[0].name}` : '');
    setDescription('');
    setIsActive(true);
    setImageFile(null);
    setImagePreview(null);
    setSearch('');
    setPriceTouched(false);
    const seed = initialLines ?? [];
    setLines(seed);
    setPrice(seed.length ? String(seed.reduce((s, l) => s + l.price, 0)) : '');
    setOpen(true);
  }, [openSignal, initialLines]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => !q || p.name.toLowerCase().includes(q)).slice(0, 60);
  }, [products, search]);


  const reset = () => {
    setOpen(false);
    setEditId(null);
    setName('');
    setDescription('');
    setPrice('');
    setPriceTouched(false);
    setIsActive(true);
    setLines([]);
    setSearch('');
    setImageFile(null);
    setImagePreview(null);
  };

  const addLine = (p: any) => {
    if (lines.some(l => l.product_id === p.id)) return;
    const group = groupFromCategoryName(p.categories?.name);
    const next = [...lines, { product_id: p.id, name: p.name, price: Number(p.price), item_group: group }];
    setLines(next);
    if (!priceTouched) setPrice(String(next.reduce((s, l) => s + l.price, 0)));
  };

  const removeLine = (productId: string) => {
    const next = lines.filter(l => l.product_id !== productId);
    setLines(next);
    if (!priceTouched) setPrice(next.length ? String(next.reduce((s, l) => s + l.price, 0)) : '');
  };

  const startEdit = (c: any) => {
    setEditId(c.id);
    setName(c.name);
    setDescription(c.description || '');
    setPrice(String(c.price));
    setPriceTouched(true);
    setIsActive(c.is_active);
    setImagePreview(c.image_url || null);
    setImageFile(null);
    setLines(
      (c.menu_combo_items || [])
        .slice()
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((i: any) => ({
          product_id: i.product_id,
          name: i.products?.name || 'Producto',
          price: Number(i.products?.price || 0),
          item_group: i.item_group as MenuGroup,
        })),
    );
    setOpen(true);
  };

  const upsert = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Poné un nombre al combo');
      if (lines.length === 0) throw new Error('Elegí al menos un producto');
      const amount = parseAmount(price);
      if (!amount || amount <= 0) throw new Error('Poné un precio válido');

      let imageUrl: string | undefined;
      if (imageFile) imageUrl = await uploadImage(imageFile, `combos/${establishmentId}`);

      let comboId = editId;
      if (editId) {
        const payload: any = { name: name.trim(), description: description || null, price: amount, is_active: isActive };
        if (imageUrl) payload.image_url = imageUrl;
        const { error } = await supabase.from('menu_combos').update(payload).eq('id', editId);
        if (error) throw error;
        const { error: delError } = await supabase.from('menu_combo_items').delete().eq('combo_id', editId);
        if (delError) throw delError;
      } else {
        const payload: any = {
          establishment_id: establishmentId!,
          name: name.trim(),
          description: description || null,
          price: amount,
          is_active: isActive,
          sort_order: combos.length,
        };
        if (imageUrl) payload.image_url = imageUrl;
        const { data, error } = await supabase.from('menu_combos').insert(payload).select('id').single();
        if (error) throw error;
        comboId = data.id;
      }

      const { error: itemsError } = await supabase.from('menu_combo_items').insert(
        lines.map((l, idx) => ({
          combo_id: comboId!,
          product_id: l.product_id,
          item_group: l.item_group,
          sort_order: idx,
        })),
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-combos'] });
      toast.success('Combo guardado');
      reset();
    },
    onError: (e: any) => toast.error(e?.message || 'Error al guardar el combo'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_combos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-combos'] });
      toast.success('Combo eliminado');
    },
    onError: () => toast.error('Error al eliminar el combo'),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('menu_combos').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-combos'] }),
  });

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
            {dailyCount === 0 && activeCombosCount === 0 ? (
              <span>Hoy el cliente <strong>no ve</strong> ninguna sección "Menú del día" al escanear el QR.</span>
            ) : (
              <span>
                El cliente ve hoy en el QR: <strong>{dailyCount}</strong> plato(s) del menú del día y{' '}
                <strong>{activeCombosCount}</strong> combo(s) activo(s).
              </span>
            )}
          </p>
          {clientMenuUrl && (
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={clientMenuUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Ver carta del cliente
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-xl">
          Armá combos del día: elegí el plato y sumale postre y bebida. El precio se sugiere con los precios de la
          carta y lo podés editar para cobrar el valor del menú.
        </p>

        <Dialog open={open} onOpenChange={v => { if (!v) reset(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo combo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar' : 'Nuevo'} combo del día</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Menú ejecutivo" required />
              </div>
              <div className="space-y-2">
                <Label>Descripción (opcional)</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Productos del combo</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar producto…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-40 rounded-md border">
                  <div className="divide-y">
                    {filteredProducts.length === 0 && (
                      <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados</p>
                    )}
                    {filteredProducts.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => addLine(p)}
                      >
                        <span className="text-sm truncate">{p.name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium">${Number(p.price).toFixed(2)}</span>
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                {lines.length > 0 && (
                  <div className="space-y-1.5 rounded-md border p-2">
                    {lines.map(l => (
                      <div key={l.product_id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm truncate">{l.name}</span>
                        <Select
                          value={l.item_group}
                          onValueChange={(v: MenuGroup) =>
                            setLines(prev => prev.map(x => (x.product_id === l.product_id ? { ...x, item_group: v } : x)))
                          }
                        >
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent className="z-[80] bg-popover">
                            <SelectItem value="main">{GROUP_LABELS_SINGULAR.main}</SelectItem>
                            <SelectItem value="dessert">{GROUP_LABELS_SINGULAR.dessert}</SelectItem>
                            <SelectItem value="drink">{GROUP_LABELS_SINGULAR.drink}</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="w-20 text-right text-sm text-muted-foreground">
                          ${l.price.toFixed(2)}
                        </span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(l.product_id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1 border-t">
                      Suma de precios de carta: ${suggested.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Precio del menú</Label>
                <Input
                  inputMode="decimal"
                  value={price}
                  onChange={e => { setPrice(e.target.value); setPriceTouched(true); }}
                  placeholder="0,00"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Se propone con los precios de la carta. Editalo para cobrar otro valor.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Imagen (opcional)</Label>
                {imagePreview && (
                  <div className="relative w-20 h-20">
                    <img src={imagePreview} alt="" className="w-20 h-20 rounded object-cover" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
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
                    if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Activo (visible en la carta)</Label>
              </div>

              <Button type="submit" className="w-full" disabled={upsert.isPending}>
                {upsert.isPending ? 'Guardando…' : 'Guardar combo'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {combos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay combos del día.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {combos.map((c: any) => {
            const items = (c.menu_combo_items || []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
            const listPrice = items.reduce((s: number, i: any) => s + Number(i.products?.price || 0), 0);
            return (
              <Card key={c.id} className={!c.is_active ? 'opacity-50' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    {c.image_url && (
                      <img src={c.image_url} alt={c.name} className="w-16 h-16 rounded object-cover shrink-0" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold flex items-center gap-2">
                        <UtensilsCrossed className="h-4 w-4 text-amber-500" />
                        {c.name}
                      </h3>
                      {c.description && <p className="text-sm text-muted-foreground truncate">{c.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge className="bg-amber-500 hover:bg-amber-600">${Number(c.price).toFixed(2)}</Badge>
                        {listPrice > Number(c.price) && (
                          <Badge variant="outline" className="line-through text-muted-foreground">
                            ${listPrice.toFixed(2)}
                          </Badge>
                        )}
                        {!c.is_active && <Badge variant="secondary">Inactivo</Badge>}
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {items.map((i: any) => (
                          <li key={i.id} className="text-xs text-muted-foreground">
                            <span className="uppercase tracking-wide">{GROUP_LABELS_SINGULAR[i.item_group as MenuGroup]}</span>
                            {' · '}{i.products?.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-1 items-center shrink-0">
                      <Switch checked={c.is_active} onCheckedChange={() => toggle.mutate({ id: c.id, is_active: c.is_active })} />
                      <Button variant="ghost" size="icon" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          toast('¿Eliminar este combo?', {
                            description: `"${c.name}" se eliminará.`,
                            action: { label: 'Sí, eliminar', onClick: () => remove.mutate(c.id) },
                            duration: 6000,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

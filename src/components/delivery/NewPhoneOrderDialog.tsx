import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, Building2, Loader2, Minus, Plus, Search, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { parseAmount } from '@/lib/parseAmount';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { OWN_PLATFORM, PAY_LABEL, onlyDigits, type Customer, type DeliveryInfo, type PayMethod } from '@/lib/ownDelivery';

interface CartLine { productId: string; name: string; price: number; qty: number; notes: string }

const money = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY = {
  phone: '', name: '', street: '', dwelling: 'house' as 'house' | 'apartment', floor: '', apartment: '', notes: '',
  optIn: false, fee: '', payMethod: 'cash' as PayMethod, payWith: '',
};

/** Toma de un pedido telefónico: datos del cliente (se completan solos si ya pidió) + productos. */
export default function NewPhoneOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { establishmentId, user } = useAuth();
  const queryClient = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [known, setKnown] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setF(p => ({ ...p, [k]: v }));

  const phoneDigits = onlyDigits(f.phone);

  // Cliente conocido: al escribir el teléfono se busca y se completan sus datos.
  const { data: match, isFetching: looking } = useQuery({
    queryKey: ['delivery-customer-lookup', establishmentId, phoneDigits],
    enabled: open && !!establishmentId && phoneDigits.length >= 6,
    queryFn: async () => {
      const { data, error } = await db.from('customers').select('*')
        .eq('establishment_id', establishmentId!).eq('phone_digits', phoneDigits).maybeSingle();
      if (error) throw error;
      return (data as Customer | null) ?? null;
    },
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!match || match.id === known?.id) return;
    setKnown(match);
    setF(p => ({
      ...p, name: match.full_name, street: match.street_address ?? '', dwelling: match.dwelling_type,
      floor: match.floor ?? '', apartment: match.apartment ?? '', notes: match.address_notes ?? '', optIn: match.whatsapp_opt_in,
    }));
  }, [match, known?.id]);
  useEffect(() => {
    if (known && known.phone_digits !== phoneDigits) setKnown(null);
  }, [phoneDigits, known]);

  const { data: products = [] } = useQuery({
    queryKey: ['delivery-products', establishmentId],
    enabled: open && !!establishmentId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from('products')
        .select('id, name, price, promo_price, promo_active, is_available, categories(name)')
        .eq('establishment_id', establishmentId!).eq('is_available', true).order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map: Record<string, any[]> = {};
    for (const p of q ? products.filter(p => p.name.toLowerCase().includes(q)) : products) (map[p.categories?.name || 'Sin categoría'] ||= []).push(p);
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [products, search]);

  const priceOf = (p: any) => Number(p.promo_active && p.promo_price ? p.promo_price : p.price);
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = parseAmount(f.fee) || 0;
  const total = subtotal + fee;
  const payWith = parseAmount(f.payWith) || 0;

  const addToCart = (p: any) => setCart(prev => {
    const i = prev.findIndex(l => l.productId === p.id);
    if (i < 0) return [...prev, { productId: p.id, name: p.name, price: priceOf(p), qty: 1, notes: '' }];
    const c = [...prev];
    c[i] = { ...c[i], qty: c[i].qty + 1 };
    return c;
  });
  const changeQty = (id: string, d: number) => setCart(prev => prev.flatMap(l => (l.productId !== id ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }])));

  const errors = {
    phone: phoneDigits.length < 6 ? 'Ingresá un teléfono válido' : '',
    name: !f.name.trim() ? 'Falta el nombre' : '',
    street: !f.street.trim() ? 'Falta la dirección' : '',
    floor: f.dwelling === 'apartment' && !f.floor.trim() ? 'Falta el piso' : '',
    apartment: f.dwelling === 'apartment' && !f.apartment.trim() ? 'Falta el depto' : '',
    cart: cart.length === 0 ? 'Agregá al menos un producto' : '',
    payWith: f.payMethod === 'cash' && f.payWith && payWith < total ? 'Paga con menos que el total' : '',
  };
  const valid = Object.values(errors).every(e => !e);

  const reset = () => {
    setF(EMPTY);
    setKnown(null);
    setCart([]);
    setSearch('');
    setTouched(false);
  };

  const create = useMutation({
    mutationFn: async () => {
      const customerData = {
        establishment_id: establishmentId!, full_name: f.name.trim(), phone: f.phone.trim(), street_address: f.street.trim(),
        dwelling_type: f.dwelling, floor: f.dwelling === 'apartment' ? f.floor.trim() : null,
        apartment: f.dwelling === 'apartment' ? f.apartment.trim() : null, address_notes: f.notes.trim() || null, whatsapp_opt_in: f.optIn,
      };
      // Alta o actualización de la ficha (si se mudó o cambió el consentimiento).
      let customerId = known?.id;
      if (customerId) {
        const { error } = await db.from('customers').update(customerData).eq('id', customerId);
        if (error) throw error;
      } else {
        const { data, error } = await db.from('customers').insert(customerData).select('id').single();
        if (error) throw error;
        customerId = (data as any).id;
      }

      const delivery: DeliveryInfo = {
        address: f.street.trim(), dwelling_type: f.dwelling, floor: customerData.floor, apartment: customerData.apartment,
        notes: customerData.address_notes, phone: f.phone.trim(), pay_method: f.payMethod,
        pay_with: f.payMethod === 'cash' && payWith > 0 ? payWith : null,
      };
      const { data: order, error } = await db.from('orders').insert({
        establishment_id: establishmentId!, table_id: null, status: 'new' as any, channel: 'delivery', external_platform: OWN_PLATFORM,
        customer_id: customerId, customer_name: f.name.trim(), delivery_fee: fee, platform_commission: 0, total,
        created_by: user?.id ?? null, delivery_address: delivery as any,
      } as any).select('id').single();
      if (error) throw error;

      const { error: itemsError } = await db.from('order_items').insert(cart.map(l => ({
        order_id: (order as any).id, product_id: l.productId, quantity: l.qty, unit_price: l.price, notes: l.notes.trim() || null,
      })));
      if (itemsError) {
        await db.from('orders').update({ status: 'cancelled' as any }).eq('id', (order as any).id);
        throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['own-delivery'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
      toast.success('Pedido enviado a cocina');
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo crear el pedido'),
  });

  const err = (k: keyof typeof errors) => touched && errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !create.isPending) { onOpenChange(false); } }}>
      <DialogContent className="flex max-h-[94vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Nuevo pedido telefónico</DialogTitle></DialogHeader>

        <div className="grid flex-1 gap-4 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
          {/* Cliente */}
          <div className="space-y-3 md:overflow-y-auto md:pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="d-phone">Teléfono</Label>
                <div className="relative">
                  <Input id="d-phone" autoFocus inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Ej: 11 4444-5555" />
                  {looking && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {known ? (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                    <UserCheck className="h-3.5 w-3.5" /> Cliente conocido: {known.orders_count} {known.orders_count === 1 ? 'pedido' : 'pedidos'}. Revisá que la dirección siga siendo la misma.
                  </p>
                ) : phoneDigits.length >= 6 && !looking ? <p className="text-xs text-muted-foreground">Cliente nuevo: completá sus datos.</p> : null}
                {err('phone')}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="d-name">Nombre</Label>
                <Input id="d-name" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Nombre y apellido" />
                {err('name')}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="d-street">Dirección (calle y número)</Label>
                <Input id="d-street" value={f.street} onChange={e => set('street', e.target.value)} placeholder="Ej: Av. Belgrano 1234" />
                {err('street')}
              </div>
              <div className="col-span-2 flex gap-2">
                {([['house', 'Casa', Home], ['apartment', 'Departamento', Building2]] as const).map(([v, label, Icon]) => (
                  <Button key={v} type="button" variant={f.dwelling === v ? 'default' : 'outline'} size="sm" className="flex-1 gap-2" onClick={() => set('dwelling', v)}>
                    <Icon className="h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>
              {f.dwelling === 'apartment' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-floor">Piso</Label>
                    <Input id="d-floor" value={f.floor} onChange={e => set('floor', e.target.value)} placeholder="Ej: 3" />
                    {err('floor')}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-apt">Depto (letra o número)</Label>
                    <Input id="d-apt" value={f.apartment} onChange={e => set('apartment', e.target.value)} placeholder="Ej: B" />
                    {err('apartment')}
                  </div>
                </>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="d-notes">Aclaraciones para el repartidor</Label>
                <Textarea id="d-notes" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Entre calles, timbre, portón, etc. (opcional)" />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de pago</Label>
                <div className="flex gap-1">
                  {(Object.keys(PAY_LABEL) as PayMethod[]).map(m => (
                    <Button key={m} type="button" size="sm" variant={f.payMethod === m ? 'default' : 'outline'} className="flex-1 px-1 text-xs" onClick={() => set('payMethod', m)}>
                      {PAY_LABEL[m]}
                    </Button>
                  ))}
                </div>
              </div>
              {f.payMethod === 'cash' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="d-paywith">Paga con</Label>
                  <Input id="d-paywith" inputMode="decimal" value={f.payWith} onChange={e => set('payWith', e.target.value)} placeholder="Para llevar el vuelto" />
                  {err('payWith')}
                </div>
              ) : <div />}
              <div className="space-y-1.5">
                <Label htmlFor="d-fee">Costo de envío</Label>
                <Input id="d-fee" inputMode="decimal" value={f.fee} onChange={e => set('fee', e.target.value)} placeholder="0" />
              </div>
              <label className="col-span-2 flex items-start gap-2 rounded-md border p-2.5 text-sm">
                <Checkbox checked={f.optIn} onCheckedChange={v => set('optIn', v === true)} className="mt-0.5" />
                <span>
                  Acepta recibir promociones por WhatsApp
                  <span className="block text-xs text-muted-foreground">Preguntale al cliente. Solo los que aceptan aparecen para campañas.</span>
                </span>
              </label>
            </div>
          </div>

          {/* Productos + detalle */}
          <div className="flex flex-col gap-3 md:overflow-hidden">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <ScrollArea className="h-48 rounded-md border md:h-auto md:min-h-[140px] md:flex-1">
              <div className="space-y-3 p-2">
                {grouped.map(([cat, list]) => (
                  <div key={cat}>
                    <p className="mb-1 px-1 text-xs font-semibold text-muted-foreground">{cat}</p>
                    {list.map(p => (
                      <button key={p.id} type="button" onClick={() => addToCart(p)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                        <span className="truncate">{p.name}</span>
                        <span className="whitespace-nowrap text-muted-foreground">{money(priceOf(p))}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Sin resultados</p>}
              </div>
            </ScrollArea>

            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-semibold">Pedido</p>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {cart.length === 0 && <p className={cn('py-3 text-center text-sm', touched ? 'text-destructive' : 'text-muted-foreground')}>Tocá los productos para agregarlos</p>}
                {cart.map(l => (
                  <div key={l.productId} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.productId, -1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-5 text-center font-medium">{l.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.productId, 1)}><Plus className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setCart(p => p.filter(x => x.productId !== l.productId))}><Trash2 className="h-3 w-3" /></Button>
                      <span className="w-20 text-right font-medium">{money(l.price * l.qty)}</span>
                    </div>
                    <Input className="h-7 text-xs" placeholder="Aclaración para cocina (opcional)" value={l.notes}
                      onChange={e => setCart(p => p.map(x => (x.productId === l.productId ? { ...x, notes: e.target.value } : x)))} />
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
              <div className="space-y-0.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
                {fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Envío</span><span>{money(fee)}</span></div>}
                <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{money(total)}</span></div>
                {f.payMethod === 'cash' && payWith > total && (
                  <div className="flex justify-between text-primary"><span>Vuelto a llevar</span><span>{money(payWith - total)}</span></div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={() => { setTouched(true); if (valid) create.mutate(); }} disabled={create.isPending} className="gap-2">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar a cocina
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

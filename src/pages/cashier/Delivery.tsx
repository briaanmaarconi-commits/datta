import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useDeliverySettings, PLATFORM_LABELS, PLATFORM_COLORS, type DeliveryPlatform } from '@/hooks/useDeliverySettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bike, Plus, Minus, Trash2, Check, ChefHat, PackageCheck, X, Search, Info } from 'lucide-react';
import { toast } from 'sonner';
import { argDayRange, toArgDate } from '@/lib/utils';
import { parseAmount } from '@/lib/parseAmount';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';

// El delivery propio (pedidos por teléfono) tiene su propia sección: acá solo plataformas.
const PLATFORMS: DeliveryPlatform[] = ['rappi', 'pedidosya'];

interface CartLine { productId: string; name: string; price: number; qty: number; notes?: string }

const money = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CashierDelivery() {
  const { establishmentId, user } = useAuth();
  const queryClient = useQueryClient();
  const { enabled, commissions, isLoading: settingsLoading } = useDeliverySettings();

  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<DeliveryPlatform>('rappi');
  const [externalId, setExternalId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [feeInput, setFeeInput] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);

  const { data: products = [] } = useQuery({
    queryKey: ['delivery-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('id, name, price, promo_price, promo_active, is_available, categories(name)')
        .eq('establishment_id', establishmentId!)
        .eq('is_available', true)
        .order('name');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['delivery-active-orders', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('*, order_items(id, quantity, unit_price, notes, products(name))')
        .eq('establishment_id', establishmentId!)
        .eq('channel', 'delivery')
        .in('external_platform', PLATFORMS)
        .in('status', ['new', 'preparing', 'ready', 'delivered'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!establishmentId,
    refetchInterval: 15000,
  });

  const { data: todayClosed = [] } = useQuery({
    queryKey: ['delivery-today-closed', establishmentId],
    queryFn: async () => {
      const { from, to } = argDayRange(toArgDate());
      const { data, error } = await db
        .from('orders')
        .select('id, total, delivery_fee, platform_commission, external_platform, created_at, customer_name, external_order_id')
        .eq('establishment_id', establishmentId!)
        .eq('channel', 'delivery')
        .in('external_platform', PLATFORMS)
        .eq('status', 'closed')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!establishmentId,
    refetchInterval: 30000,
  });

  const activeList = useShowMore<any>(activeOrders, 6);
  const closedList = useShowMore<any>(todayClosed, 8);

  useEffect(() => {
    if (!establishmentId) return;
    const ch = db
      .channel('delivery-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['delivery-active-orders', establishmentId] });
        queryClient.invalidateQueries({ queryKey: ['delivery-today-closed', establishmentId] });
      })
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [establishmentId, queryClient]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
    const map: Record<string, any[]> = {};
    list.forEach(p => {
      const cat = p.categories?.name || 'Sin categoría';
      (map[cat] ||= []).push(p);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [products, search]);

  const priceOf = (p: any) => Number(p.promo_active && p.promo_price ? p.promo_price : p.price);
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = parseAmount(feeInput) || 0;
  const commissionPct = commissions[platform] ?? 0;
  const commission = Math.round(subtotal * (commissionPct / 100) * 100) / 100;
  const total = subtotal + fee;
  const netIncome = subtotal - commission;

  const addToCart = (p: any) => {
    setCart(prev => {
      const idx = prev.findIndex(l => l.productId === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { productId: p.id, name: p.name, price: priceOf(p), qty: 1 }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setCart(prev => prev.flatMap(l => {
      if (l.productId !== productId) return [l];
      const qty = l.qty + delta;
      return qty <= 0 ? [] : [{ ...l, qty }];
    }));
  };

  const resetForm = () => {
    setOpen(false);
    setCart([]);
    setExternalId('');
    setCustomerName('');
    setAddress('');
    setPhone('');
    setFeeInput('');
    setSearch('');
  };

  const createOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error('Agregá al menos un producto');
      const { data: order, error } = await db
        .from('orders')
        .insert({
          establishment_id: establishmentId!,
          table_id: null,
          status: 'new' as any,
          channel: 'delivery',
          external_platform: platform,
          external_order_id: externalId.trim() || null,
          customer_name: customerName.trim() || null,
          delivery_fee: fee,
          platform_commission: commission,
          total,
          created_by: user?.id ?? null,
          delivery_address: address.trim() || phone.trim()
            ? { address: address.trim() || null, phone: phone.trim() || null }
            : null,
        })
        .select('id')
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from('order_items').insert(
        cart.map(l => ({
          order_id: order.id,
          product_id: l.productId,
          quantity: l.qty,
          unit_price: l.price,
          notes: l.notes || null,
        }))
      );
      if (itemsError) throw itemsError;
      return order.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-active-orders', establishmentId] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
      toast.success('Pedido de delivery creado y enviado a cocina');
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo crear el pedido'),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, any> = { status };
      if (status === 'ready') patch.prepared_at = new Date().toISOString();
      if (status === 'delivered') patch.delivered_at = new Date().toISOString();
      const { error } = await db.from('orders').update(patch as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-active-orders', establishmentId] });
      queryClient.invalidateQueries({ queryKey: ['delivery-today-closed', establishmentId] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
    },
    onError: () => toast.error('No se pudo actualizar el pedido'),
  });

  const todayTotals = useMemo(() => {
    const bruto = todayClosed.reduce((s, o) => s + Number(o.total), 0);
    const com = todayClosed.reduce((s, o) => s + Number(o.platform_commission || 0), 0);
    const envios = todayClosed.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
    return { bruto, com, envios, neto: bruto - com, count: todayClosed.length };
  }, [todayClosed]);

  if (settingsLoading) return <div className="p-6 text-muted-foreground">Cargando…</div>;

  if (!enabled) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5" /> Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>El módulo de Delivery no está habilitado para este establecimiento.</p>
          <p>Pedile al administrador de Datta que lo active desde el panel de clientes.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Bike className="h-7 w-7 text-primary" /> Delivery</h1>
          <p className="text-sm text-muted-foreground mt-1">Pedidos de Rappi y PedidosYa. Los pedidos por teléfono van en Delivery propio.</p>
        </div>
        <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo pedido</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Pedidos hoy', value: todayTotals.count.toString() },
          { label: 'Venta bruta', value: money(todayTotals.bruto) },
          { label: 'Comisión plataformas', value: `-${money(todayTotals.com)}`, danger: true },
          { label: 'Ingreso neto', value: money(todayTotals.neto), accent: true },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.danger ? 'text-destructive' : k.accent ? 'text-primary' : ''}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pedidos en curso ({activeOrders.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeOrders.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay pedidos de delivery en curso.</p>
          )}
          {activeList.visible.map(o => {
            const plat = (o.external_platform || 'propio') as DeliveryPlatform;
            return (
              <div key={o.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={PLATFORM_COLORS[plat] || ''}>{PLATFORM_LABELS[plat] || plat}</Badge>
                      {o.external_order_id && <span className="text-xs font-mono text-muted-foreground">#{o.external_order_id}</span>}
                      <Badge variant="secondary" className="capitalize">{
                        { new: 'Nuevo', preparing: 'En preparación', ready: 'Listo', delivered: 'Retirado' }[o.status as string] || o.status
                      }</Badge>
                    </div>
                    <p className="text-sm font-medium">{o.customer_name || 'Cliente sin nombre'}</p>
                    {o.delivery_address?.address && <p className="text-xs text-muted-foreground">{o.delivery_address.address}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{money(Number(o.total))}</p>
                    {Number(o.platform_commission) > 0 && (
                      <p className="text-xs text-destructive">Comisión {money(Number(o.platform_commission))}</p>
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground space-y-0.5">
                  {(o.order_items || []).map((it: any) => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.quantity}× {it.products?.name}</span>
                      <span>{money(Number(it.unit_price) * it.quantity)}</span>
                    </div>
                  ))}
                  {Number(o.delivery_fee) > 0 && (
                    <div className="flex justify-between"><span>Envío</span><span>{money(Number(o.delivery_fee))}</span></div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {o.status === 'new' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => updateStatus.mutate({ id: o.id, status: 'preparing' })}>
                      <ChefHat className="h-3.5 w-3.5" /> En preparación
                    </Button>
                  )}
                  {(o.status === 'new' || o.status === 'preparing') && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => updateStatus.mutate({ id: o.id, status: 'ready' })}>
                      <Check className="h-3.5 w-3.5" /> Listo
                    </Button>
                  )}
                  {o.status === 'ready' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => updateStatus.mutate({ id: o.id, status: 'delivered' })}>
                      <PackageCheck className="h-3.5 w-3.5" /> Retirado por el repartidor
                    </Button>
                  )}
                  <Button size="sm" className="gap-1" onClick={() => updateStatus.mutate({ id: o.id, status: 'closed' })}>
                    <Check className="h-3.5 w-3.5" /> Cerrar pedido
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => updateStatus.mutate({ id: o.id, status: 'cancelled' })}>
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                </div>
              </div>
            );
          })}
          <ShowMoreButton hiddenCount={activeList.hiddenCount} expanded={activeList.expanded} onToggle={() => activeList.setExpanded(!activeList.expanded)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Cerrados hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {todayClosed.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Todavía no cerraste pedidos de delivery hoy.</p>
          ) : (
            <div className="space-y-2">
              {closedList.visible.map(o => {
                const plat = (o.external_platform || 'propio') as DeliveryPlatform;
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className={PLATFORM_COLORS[plat] || ''}>{PLATFORM_LABELS[plat] || plat}</Badge>
                      <span className="truncate">{o.customer_name || 'Cliente'}{o.external_order_id ? ` · #${o.external_order_id}` : ''}</span>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="font-semibold">{money(Number(o.total))}</span>
                      {Number(o.platform_commission) > 0 && (
                        <span className="text-xs text-destructive ml-2">-{money(Number(o.platform_commission))}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <ShowMoreButton hiddenCount={closedList.hiddenCount} expanded={closedList.expanded} onToggle={() => closedList.setExpanded(!closedList.expanded)} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Los pedidos de delivery <strong>no afectan el efectivo esperado en caja</strong> porque los cobra la plataforma.
          Se suman a ventas y analíticas con la comisión descontada para ver el margen real.
        </span>
      </div>

      <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); else setOpen(true); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Nuevo pedido de delivery</DialogTitle></DialogHeader>

          <div className="grid gap-4 md:grid-cols-2 overflow-hidden flex-1">
            <div className="space-y-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Plataforma</Label>
                  <Select value={platform} onValueChange={v => setPlatform(v as DeliveryPlatform)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[100]">
                      {PLATFORMS.map(p => (
                        <SelectItem key={p} value={p}>
                          {PLATFORM_LABELS[p]}{commissions[p] > 0 ? ` (${commissions[p]}%)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>N° de pedido en la plataforma</Label>
                  <Input value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="Ej: R-84213" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Cliente</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre del cliente" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Dirección</Label>
                  <Textarea rows={2} value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección de entrega (opcional)" />
                </div>
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Opcional" />
                </div>
                <div className="space-1.5 space-y-1.5">
                  <Label>Costo de envío</Label>
                  <Input value={feeInput} onChange={e => setFeeInput(e.target.value)} placeholder="0,00" inputMode="decimal" />
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label>Productos</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>

              <ScrollArea className="h-64 rounded-md border">
                <div className="p-2 space-y-3">
                  {grouped.map(([cat, list]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground px-1 mb-1">{cat}</p>
                      <div className="space-y-1">
                        {list.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addToCart(p)}
                            className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="text-muted-foreground whitespace-nowrap">{money(priceOf(p))}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {grouped.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Sin resultados</p>}
                </div>
              </ScrollArea>
            </div>

            <div className="flex flex-col rounded-lg border bg-muted/30 p-3 overflow-hidden">
              <p className="text-sm font-semibold mb-2">Detalle del pedido</p>
              <ScrollArea className="flex-1 min-h-40">
                <div className="space-y-2 pr-2">
                  {cart.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Agregá productos desde la lista</p>}
                  {cart.map(l => (
                    <div key={l.productId} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{money(l.price)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.productId, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-6 text-center font-medium">{l.qty}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.productId, 1)}><Plus className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setCart(prev => prev.filter(x => x.productId !== l.productId))}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <span className="w-20 text-right font-medium">{money(l.price * l.qty)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Separator className="my-3" />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
                {fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Envío</span><span>{money(fee)}</span></div>}
                {commissionPct > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Comisión {PLATFORM_LABELS[platform]} ({commissionPct}%)</span>
                    <span>-{money(commission)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1"><span>Total del pedido</span><span>{money(total)}</span></div>
                <div className="flex justify-between text-primary font-semibold"><span>Ingreso neto</span><span>{money(netIncome)}</span></div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={() => createOrder.mutate()} disabled={createOrder.isPending || cart.length === 0}>
              {createOrder.isPending ? 'Creando...' : 'Crear pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

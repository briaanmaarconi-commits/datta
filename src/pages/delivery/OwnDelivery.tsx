import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Check, ChefHat, Download, Loader2, MessageCircle, Phone, Plus, Search, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { parseAmount } from '@/lib/parseAmount';
import { argDayRange, toArgDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NewPhoneOrderDialog from '@/components/delivery/NewPhoneOrderDialog';
import {
  OWN_PLATFORM, PAY_LABEL, closeOwnDeliveryOrder, formatAddress, whatsappUrl, type Customer, type DeliveryInfo, type PayMethod,
} from '@/lib/ownDelivery';

const money = (n: number) => `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: 'Nuevo', className: 'bg-primary/10 text-primary border-primary/30' },
  preparing: { label: 'En preparación', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  ready: { label: 'Listo para salir', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400' },
  delivered: { label: 'En camino', className: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400' },
};

/** Delivery propio: pedidos por teléfono que entran a cocina y se cobran como una mesa. */
export default function OwnDelivery() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [closing, setClosing] = useState<any | null>(null);

  useEffect(() => {
    if (!establishmentId) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['own-delivery'] });
    const ch = db.channel(`own-delivery-${establishmentId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `establishment_id=eq.${establishmentId}` }, refresh)
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [establishmentId, queryClient]);

  return (
    // pb: en el celular los botones flotantes no tapan las acciones.
    <div className="space-y-6 pb-28 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Bike className="h-7 w-7 text-primary" /> Delivery propio</h1>
          <p className="mt-1 text-muted-foreground">Pedidos por teléfono con tu propio repartidor: van a cocina y se cobran como una mesa.</p>
        </div>
        <Button className="gap-2" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Nuevo pedido telefónico</Button>
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
        </TabsList>
        <TabsContent value="orders"><OrdersTab onClose={setClosing} /></TabsContent>
        <TabsContent value="customers"><CustomersTab /></TabsContent>
      </Tabs>

      <NewPhoneOrderDialog open={newOpen} onOpenChange={setNewOpen} />
      <CloseOrderDialog order={closing} onDone={() => setClosing(null)} />
    </div>
  );
}

function OrdersTab({ onClose }: { onClose: (o: any) => void }) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const { data: active = [], isLoading } = useQuery({
    queryKey: ['own-delivery', 'active', establishmentId],
    enabled: !!establishmentId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from('orders')
        .select('*, order_items(id, quantity, unit_price, notes, products(name))')
        .eq('establishment_id', establishmentId!).eq('channel', 'delivery').eq('external_platform', OWN_PLATFORM)
        .in('status', ['new', 'preparing', 'ready', 'delivered'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: today = [] } = useQuery({
    queryKey: ['own-delivery', 'today', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { from, to } = argDayRange(toArgDate());
      const { data, error } = await db.from('orders')
        .select('id, total, delivery_fee, payment_method, customer_name, created_at')
        .eq('establishment_id', establishmentId!).eq('channel', 'delivery').eq('external_platform', OWN_PLATFORM)
        .eq('status', 'closed').gte('created_at', from).lte('created_at', to)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, unknown> = { status };
      if (status === 'ready') patch.prepared_at = new Date().toISOString();
      const { error } = await db.from('orders').update(patch as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['own-delivery'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
    },
    onError: () => toast.error('No se pudo actualizar el pedido'),
  });

  const totals = useMemo(() => ({
    count: today.length,
    sales: today.reduce((s, o) => s + Number(o.total), 0),
    fees: today.reduce((s, o) => s + Number(o.delivery_fee || 0), 0),
  }), [today]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Entregados hoy', value: String(totals.count) },
          { label: 'Vendido hoy', value: money(totals.sales) },
          { label: 'Cobrado en envíos', value: money(totals.fees) },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.label}</p><p className="mt-1 text-2xl font-bold">{k.value}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">En curso ({active.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {!isLoading && active.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No hay pedidos en curso. Tocá "Nuevo pedido telefónico" para cargar uno.</p>}
          <div className="grid gap-3 xl:grid-cols-2">
            {active.map(o => {
              const d = (o.delivery_address ?? {}) as DeliveryInfo;
              const st = STATUS[o.status] ?? { label: o.status, className: '' };
              const change = d.pay_method === 'cash' && d.pay_with ? Number(d.pay_with) - Number(o.total) : 0;
              return (
                <div key={o.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={st.className}>{st.label}</Badge>
                        <span className="text-xs text-muted-foreground">hace {formatDistanceToNow(new Date(o.created_at), { locale: es })}</span>
                      </div>
                      <p className="font-semibold">{o.customer_name || 'Cliente'}</p>
                      <p className="text-sm">{formatAddress(d)}</p>
                      {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                      {d.phone && (
                        <div className="flex flex-wrap gap-3 pt-0.5 text-sm">
                          <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{d.phone}</a>
                          <a href={whatsappUrl(d.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{money(o.total)}</p>
                      <p className="text-xs text-muted-foreground">{d.pay_method ? PAY_LABEL[d.pay_method] : 'Pago a definir'}</p>
                      {change > 0 && <p className="text-xs font-medium text-primary">Paga con {money(Number(d.pay_with))} · vuelto {money(change)}</p>}
                    </div>
                  </div>
                  <div className="space-y-0.5 text-sm text-muted-foreground">
                    {(o.order_items || []).map((it: any) => (
                      <div key={it.id} className="flex justify-between gap-2">
                        <span>{it.quantity}× {it.products?.name}{it.notes ? <em className="text-xs"> ({it.notes})</em> : null}</span>
                        <span className="whitespace-nowrap">{money(Number(it.unit_price) * it.quantity)}</span>
                      </div>
                    ))}
                    {Number(o.delivery_fee) > 0 && <div className="flex justify-between"><span>Envío</span><span>{money(o.delivery_fee)}</span></div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {o.status === 'new' && <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus.mutate({ id: o.id, status: 'preparing' })}><ChefHat className="h-3.5 w-3.5" />En preparación</Button>}
                    {(o.status === 'new' || o.status === 'preparing') && <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus.mutate({ id: o.id, status: 'ready' })}><Check className="h-3.5 w-3.5" />Listo</Button>}
                    {o.status !== 'delivered' && <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus.mutate({ id: o.id, status: 'delivered' })}><Truck className="h-3.5 w-3.5" />Salió con el repartidor</Button>}
                    <Button size="sm" className="gap-1" onClick={() => onClose(o)}><Check className="h-3.5 w-3.5" />Entregado y cobrado</Button>
                    <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => { if (confirm('¿Cancelar este pedido?')) setStatus.mutate({ id: o.id, status: 'cancelled' }); }}>
                      <X className="h-3.5 w-3.5" />Cancelar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {today.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">Entregados hoy</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {today.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                <span className="truncate">{o.customer_name || 'Cliente'} · {PAY_LABEL[o.payment_method as PayMethod] ?? o.payment_method}</span>
                <span className="whitespace-nowrap font-semibold">{money(o.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CloseOrderDialog({ order, onDone }: { order: any | null; onDone: () => void }) {
  const { establishmentId, user } = useAuth();
  const queryClient = useQueryClient();
  const d = (order?.delivery_address ?? {}) as DeliveryInfo;
  const [method, setMethod] = useState<PayMethod>('cash');
  const [received, setReceived] = useState('');

  useEffect(() => {
    if (!order) return;
    setMethod(d.pay_method ?? 'cash');
    setReceived(d.pay_with ? String(d.pay_with) : String(Number(order.total)));
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = Number(order?.total ?? 0);
  const paid = parseAmount(received) || 0;
  const close = useMutation({
    mutationFn: () => closeOwnDeliveryOrder({ order, payMethod: method, amountPaid: paid, establishmentId: establishmentId!, userId: user?.id ?? null }),
    onSuccess: () => {
      toast.success('Pedido cobrado y cerrado');
      queryClient.invalidateQueries({ queryKey: ['own-delivery'] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo cerrar'),
  });

  return (
    <Dialog open={!!order} onOpenChange={o => { if (!o && !close.isPending) onDone(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Entregado y cobrado</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{order?.customer_name} · Total <strong className="text-foreground">{money(total)}</strong></p>
          <div className="space-y-1.5">
            <Label>¿Cómo pagó?</Label>
            <div className="flex gap-1">
              {(Object.keys(PAY_LABEL) as PayMethod[]).map(m => (
                <Button key={m} type="button" size="sm" variant={method === m ? 'default' : 'outline'} className="flex-1" onClick={() => setMethod(m)}>{PAY_LABEL[m]}</Button>
              ))}
            </div>
          </div>
          {method === 'cash' && (
            <div className="space-y-1.5">
              <Label htmlFor="c-received">Recibido en efectivo</Label>
              <Input id="c-received" inputMode="decimal" value={received} onChange={e => setReceived(e.target.value)} />
              {paid > total && <p className="text-sm text-primary">Vuelto: {money(paid - total)}</p>}
              {paid < total && <p className="text-sm text-destructive">Falta cobrar {money(total - paid)}</p>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Entra a Ventas y a la caja del turno igual que una mesa, y descuenta el stock.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={close.isPending}>Volver</Button>
          <Button onClick={() => close.mutate()} disabled={close.isPending || (method === 'cash' && paid < total)} className="gap-2">
            {close.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Cobrar y cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomersTab() {
  const { establishmentId } = useAuth();
  const [search, setSearch] = useState('');
  const [onlyOptIn, setOnlyOptIn] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['own-delivery', 'customers', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db.from('customers').select('*')
        .eq('establishment_id', establishmentId!).order('last_order_at', { ascending: false, nullsFirst: false }).limit(2000);
      if (error) throw error;
      return data as Customer[];
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return customers.filter(c => (!onlyOptIn || c.whatsapp_opt_in)
      && (!q || c.full_name.toLowerCase().includes(q) || (qd.length > 2 && c.phone_digits.includes(qd)) || (c.street_address ?? '').toLowerCase().includes(q)));
  }, [customers, search, onlyOptIn]);
  const optInCount = customers.filter(c => c.whatsapp_opt_in).length;

  function exportCsv() {
    const rows = visible.filter(c => c.whatsapp_opt_in);
    if (!rows.length) {
      toast.error('No hay clientes que hayan aceptado WhatsApp en esta lista');
      return;
    }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Nombre', 'Teléfono', 'Dirección', 'Pedidos', 'Total gastado', 'Último pedido', 'Aceptó WhatsApp el'].join(';'),
      ...rows.map(c => [c.full_name, c.phone, formatAddress(c), c.orders_count, Number(c.total_spent).toFixed(2).replace('.', ','),
        c.last_order_at?.slice(0, 10) ?? '', c.whatsapp_opt_in_at?.slice(0, 10) ?? ''].map(esc).join(';')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-whatsapp-${toArgDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Clientes ({customers.length})</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4" />Exportar para WhatsApp</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nombre, teléfono o dirección" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={onlyOptIn} onCheckedChange={setOnlyOptIn} />Solo aceptan WhatsApp ({optInCount})</label>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{customers.length ? 'Ningún cliente coincide.' : 'Los clientes se guardan solos al tomar pedidos por teléfono.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Gastado</TableHead>
                  <TableHead>Último</TableHead>
                  <TableHead>WhatsApp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(c => (
                  <TableRow key={c.id}>
                    <TableCell><div className="font-medium">{c.full_name}</div><div className="text-xs text-muted-foreground">{c.phone}</div></TableCell>
                    <TableCell className="min-w-[180px] text-sm">{formatAddress(c)}</TableCell>
                    <TableCell className="text-right">{c.orders_count}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{money(c.total_spent)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{c.last_order_at ? formatDistanceToNow(new Date(c.last_order_at), { locale: es, addSuffix: true }) : '—'}</TableCell>
                    <TableCell>
                      {c.whatsapp_opt_in ? (
                        <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline dark:text-emerald-400">
                          <MessageCircle className="h-3.5 w-3.5" />Escribir
                        </a>
                      ) : <span className="text-xs text-muted-foreground">No aceptó</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Por la ley de datos personales, mandá promociones solo a quienes aceptaron. La exportación incluye solo a esos clientes.</p>
      </CardContent>
    </Card>
  );
}

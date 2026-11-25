import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { withCurrentPrices } from '@/lib/currentPrices';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Users, AlertTriangle, List, Map, Gift } from 'lucide-react';
import { useActiveShift } from '@/hooks/useActiveShift';
import { Alert, AlertDescription } from '@/components/ui/alert';
import OrderingView from '@/components/waiter/OrderingView';
import { useActiveCombos } from '@/hooks/useMenuCombos';
import FloorPlanView from '@/components/waiter/FloorPlanView';
import MotivationalDialog from '@/components/waiter/MotivationalDialog';
import WaiterCallNotifications from '@/components/waiter/WaiterCallNotifications';
import CourtesyDialog from '@/components/shared/CourtesyDialog';
import { useCloseTableAsCourtesy, CourtesyType } from '@/hooks/useCloseTableAsCourtesy';
import { getOrdersCutoff } from '@/lib/shiftScope';
import { getTableVisualState } from '@/lib/tableStatus';
import TableStatusLegend from '@/components/shared/TableStatusLegend';
import BillRequestDialog from '@/components/waiter/BillRequestDialog';
import WaiterPushCard from '@/components/waiter/WaiterPushCard';
import { describePayments, parsePayments, type PaymentPart } from '@/lib/payments';

interface OrderingState {
  type: 'new' | 'existing';
  tableId: string;
  tableNumber: number;
  orderId?: string;
  /** Personas que atiende el mozo en esta mesa (se pide al abrirla; sale en la comanda). */
  guestCount?: number;
}

export default function WaiterTables() {
  const { establishmentId, user } = useAuth();
  const queryClient = useQueryClient();
  const { isShiftOpen, isLoading: shiftLoading, activeShift } = useActiveShift();
  const ordersCutoff = getOrdersCutoff(activeShift as any);
  const [ordering, setOrdering] = useState<OrderingState | null>(null);
  const [guestDialog, setGuestDialog] = useState<any>(null);
  const [guestCount, setGuestCount] = useState('');
  const [courtesyTable, setCourtesyTable] = useState<any>(null);
  const [billTable, setBillTable] = useState<{ id: string; number: number } | null>(null);

  const courtesyMutation = useCloseTableAsCourtesy({
    onSuccess: ({ totalCost }) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      toast.success(`Mesa cerrada como cortesía. Costo: $${totalCost.toFixed(2)}`);
      setCourtesyTable(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Error al cerrar como cortesía'),
  });

  useEffect(() => {
    if (!establishmentId) return;
    const channel = db
      .channel('waiter-tables-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['tables', establishmentId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['active-orders', establishmentId] });
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  const handleCourtesy = (type: CourtesyType, notes: string, accountId: string | null) => {
    if (!courtesyTable) return;
    const ordersForTable = activeOrders.filter((o: any) => o.table_id === courtesyTable.id);
    if (ordersForTable.length === 0) {
      toast.error('No hay pedidos activos en esta mesa');
      return;
    }
    courtesyMutation.mutate({
      establishmentId: establishmentId!,
      userId: user?.id ?? null,
      tableId: courtesyTable.id,
      tableNumber: courtesyTable.number,
      orderIds: ordersForTable.map((o: any) => o.id),
      courtesyType: type,
      notes,
      accountId,
    });
  };

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('sectors').select('*').eq('establishment_id', establishmentId!).order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('tables').select('*').eq('establishment_id', establishmentId!).order('number');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    refetchInterval: 10000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('categories').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('products').select('*').eq('establishment_id', establishmentId!).eq('is_available', true).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['active-orders', establishmentId, ordersCutoff],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('*, order_items(*, products(name))')
        .eq('establishment_id', establishmentId!)
        .in('status', ['new', 'preparing', 'ready'])
        // Solo pedidos del turno abierto (o del día). Los anteriores quedaron colgados.
        .gte('created_at', ordersCutoff)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    refetchInterval: 3000,
  });

  // Persistent AudioContext — created on first user gesture to comply with autoplay policy
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = (): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // Initialize AudioContext on any user interaction so it's unlocked for notifications
  useEffect(() => {
    const unlock = () => {
      getAudioContext();
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Loud, attention-grabbing bell sound
  const playBell = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      const playTone = (freq: number, startTime: number, duration: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Urgent triple bell — louder, higher pitch, faster rhythm
      const pattern = [
        { t: 0, freqs: [880, 1760, 2640], vol: 0.6, dur: 0.3 },
        { t: 0.25, freqs: [988, 1976, 2964], vol: 0.7, dur: 0.3 },
        { t: 0.5, freqs: [1047, 2094, 3141], vol: 0.8, dur: 0.4 },
        // Second round for emphasis
        { t: 0.9, freqs: [880, 1760, 2640], vol: 0.6, dur: 0.3 },
        { t: 1.15, freqs: [988, 1976, 2964], vol: 0.7, dur: 0.3 },
        { t: 1.4, freqs: [1047, 2094, 3141], vol: 0.8, dur: 0.5 },
      ];

      pattern.forEach(({ t, freqs, vol, dur }) => {
        freqs.forEach(f => playTone(f, now + t, dur, vol));
      });
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  };

  // Sound + notification for ready orders
  const prevReadyCountRef = useRef(0);
  useEffect(() => {
    const readyCount = activeOrders.filter(o => o.status === 'ready').length;
    if (readyCount > prevReadyCountRef.current && prevReadyCountRef.current > 0) {
      playBell();
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      const readyOrders = activeOrders.filter(o => o.status === 'ready');
      const newReady = readyOrders[readyOrders.length - 1];
      const tableNum = tables.find(t => t.id === newReady?.table_id)?.number;
      toast.info(`🔔 ¡Pedido listo para entregar!${tableNum ? ` Mesa ${tableNum}` : ''}`, {
        duration: 8000,
      });
    }
    prevReadyCountRef.current = readyCount;
  }, [activeOrders, tables]);
  const updateGuestCount = useMutation({
    mutationFn: async ({ tableId, count }: { tableId: string; count: number }) => {
      const { error } = await db.from('tables').update({ guest_count: count } as any).eq('id', tableId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Cantidad de personas actualizada');
      setGuestDialog(null);
      setGuestCount('');
    },
  });

  // Offline resilience: save cart to localStorage on failure
  const savePendingOrder = useCallback((cart: any[], state: OrderingState) => {
    localStorage.setItem('pending_order', JSON.stringify({
      cart, ordering: state, establishmentId, userId: user?.id, savedAt: new Date().toISOString(),
    }));
  }, [establishmentId, user?.id]);

  const clearPendingOrder = useCallback(() => {
    localStorage.removeItem('pending_order');
    setPendingOrder(null);
  }, []);

  const [pendingOrder, setPendingOrder] = useState<any>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pending_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.establishmentId === establishmentId && parsed.cart?.length > 0) {
          setPendingOrder(parsed);
        }
      }
    } catch {}
  }, [establishmentId]);

  // Realtime: refresh products when availability changes (o cuando otra moza carga un plato del día)
  useEffect(() => {
    if (!establishmentId) return;
    const channel = db
      .channel('products-availability')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['products', establishmentId] });
        queryClient.invalidateQueries({ queryKey: ['daily-special-category', establishmentId] });
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  const { data: combos = [] } = useActiveCombos(establishmentId);

  /** Antes de mandar el pedido: precios actuales (la carta en pantalla pudo quedar vieja). */
  const pricedCart = async <T extends { product_id: string; price: number }>(raw: T[]): Promise<T[]> => {
    const { cart, changed } = await withCurrentPrices(raw);
    if (changed.length) {
      queryClient.invalidateQueries({ queryKey: ['products', establishmentId] });
      toast.info(`Se actualizó el precio de: ${changed.join(', ')}`, { duration: 8000 });
    }
    return cart;
  };

  const createOrder = useMutation({
    mutationFn: async (rawCart: { product_id: string; price: number; quantity: number; notes: string }[]) => {
      if (!ordering || rawCart.length === 0) return;
      // Save to localStorage before attempting (resilience)
      savePendingOrder(rawCart, ordering);
      const cart = await pricedCart(rawCart);
      const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
      // Un agregado que sale como pedido nuevo lleva las personas que ya tiene la mesa.
      const guests = ordering.guestCount ?? ((tables.find(t => t.id === ordering.tableId) as any)?.guest_count || null);
      const { data: order, error } = await db.from('orders').insert({
        table_id: ordering.tableId,
        establishment_id: establishmentId!,
        created_by: user?.id,
        total,
        guest_count: guests,
      } as any).select().single();
      if (error) throw error;
      const items = cart.map(i => ({
        order_id: order.id,
        product_id: i.product_id,
        quantity: i.quantity,
        notes: i.notes || null,
        unit_price: i.price,
      }));
      const { error: itemsError } = await db.from('order_items').insert(items);
      if (itemsError) throw itemsError;
      await db.from('tables').update({ status: 'occupied' as any }).eq('id', ordering.tableId);
    },
    onSuccess: () => {
      clearPendingOrder();
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      toast.success('Pedido enviado a cocina');
      setOrdering(null);
    },
    onError: () => {
      toast.error('Error de conexión. Tu pedido se guardó, podés reintentarlo.', { duration: 8000 });
    },
  });

  const addToExistingOrder = useMutation({
    mutationFn: async (rawCart: { product_id: string; price: number; quantity: number; notes: string }[]) => {
      if (!ordering?.orderId || rawCart.length === 0) return;
      savePendingOrder(rawCart, ordering);
      const cart = await pricedCart(rawCart);
      const items = cart.map(i => ({
        order_id: ordering.orderId!,
        product_id: i.product_id,
        quantity: i.quantity,
        notes: i.notes || null,
        unit_price: i.price,
      }));
      const { error } = await db.from('order_items').insert(items);
      if (error) throw error;
      const addedTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
      const order = activeOrders.find(o => o.id === ordering.orderId);
      if (order) {
        await db.from('orders').update({ total: Number(order.total) + addedTotal, status: 'new' as any }).eq('id', ordering.orderId!);
      }
    },
    onSuccess: () => {
      clearPendingOrder();
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      toast.success('Items agregados al pedido');
      setOrdering(null);
    },
    onError: () => {
      toast.error('Error de conexión. Tu pedido se guardó, podés reintentarlo.', { duration: 8000 });
    },
  });

  const markDelivered = useMutation({
    mutationFn: async (orderId: string) => {
      await db.from('orders').update({ status: 'delivered' as any, delivered_at: new Date().toISOString() }).eq('id', orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      toast.success('Pedido marcado como entregado');
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      await db.from('orders').update({ status: 'cancelled' as any }).eq('id', orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Pedido cancelado');
    },
    onError: () => toast.error('Error al cancelar pedido'),
  });

  // Al pedir la cuenta se anota cómo paga el cliente (payment_request); en cualquier otro estado se borra.
  const changeTableStatus = useMutation({
    mutationFn: async ({ tableId, status, paymentRequest = null }: { tableId: string; status: string; paymentRequest?: PaymentPart[] | null }) => {
      const { error } = await db.from('tables').update({ status: status as any, payment_request: paymentRequest } as any).eq('id', tableId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setBillTable(null);
      toast.success('Estado de mesa actualizado');
    },
    onError: () => toast.error('No se pudo actualizar la mesa'),
  });

  const handleTableClick = (table: any) => {
    if (!isShiftOpen) {
      toast.error('⚠️ No se puede tomar pedidos. Primero debe abrirse el turno desde caja.', { duration: 5000 });
      return;
    }
    const tableOrders = activeOrders.filter(o => o.table_id === table.id);
    if (tableOrders.length > 0) {
      setOrdering({ type: 'existing', tableId: table.id, tableNumber: table.number, orderId: tableOrders[0].id });
    } else {
      // Mesa nueva: antes de cargar el pedido, el mozo indica cuántas personas atiende.
      setGuestDialog({ ...table, startOrder: true });
      setGuestCount('');
    }
  };

  const startOrderWithGuests = (table: any, count: number) => {
    if (!(count >= 1)) {
      toast.error('Indicá cuántas personas hay en la mesa');
      return;
    }
    db.from('tables').update({ guest_count: count } as any).eq('id', table.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['tables'] }));
    setGuestDialog(null);
    setGuestCount('');
    setOrdering({ type: 'new', tableId: table.id, tableNumber: table.number, guestCount: count });
  };

  const handleSubmitOrder = (cart: any[]) => {
    if (ordering?.type === 'new') {
      createOrder.mutate(cart);
      return;
    }
    // Si el pedido existente ya entró a cocina (en preparación / listo / entregado),
    // se envía una NUEVA comanda para la misma mesa en vez de reabrir la anterior.
    const existing = activeOrders.find(o => o.id === ordering?.orderId);
    if (existing && existing.status !== 'new') {
      createOrder.mutate(cart);
    } else {
      addToExistingOrder.mutate(cart);
    }
  };


  if (ordering) {
    const recoveredCart = pendingOrder?.ordering?.tableId === ordering.tableId ? pendingOrder.cart : undefined;
    return (
      <OrderingView
        tableNumber={ordering.tableNumber}
        isAddingToExisting={ordering.type === 'existing'}
        categories={categories}
        products={products}
        combos={combos}
        onSubmit={handleSubmitOrder}
        onClose={() => setOrdering(null)}
        isPending={createOrder.isPending || addToExistingOrder.isPending}
        initialCart={recoveredCart}
      />
    );
  }

  return (
    <div className="space-y-6">
      <MotivationalDialog />

      {/* Pending order recovery banner */}
      {pendingOrder && pendingOrder.cart?.length > 0 && !ordering && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Tenés un pedido pendiente para Mesa {pendingOrder.ordering.tableNumber} ({pendingOrder.cart.length} producto{pendingOrder.cart.length > 1 ? 's' : ''}).
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOrdering(pendingOrder.ordering);
                }}
              >
                Seguir editando
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={clearPendingOrder}
              >
                Descartar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Mis Mesas</h1>
        <WaiterCallNotifications establishmentId={establishmentId} tables={tables} />
      </div>

      <WaiterPushCard hideWhenOn />

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list" className="gap-1"><List className="h-3 w-3" /> Lista</TabsTrigger>
          <TabsTrigger value="floorplan" className="gap-1"><Map className="h-3 w-3" /> Plano</TabsTrigger>
        </TabsList>

        {!isShiftOpen && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No hay turno abierto. El cajero debe abrir un turno antes de poder tomar pedidos.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-4"><TableStatusLegend /></div>

        <TabsContent value="list">
          {(() => {
            const sectorGroups = sectors.map(sector => ({
              sector,
              sectorTables: tables.filter(t => t.sector_id === sector.id),
            }));
            const unassigned = tables.filter(t => !t.sector_id);

            const renderTable = (table: any) => {
              const tableOrders = activeOrders.filter(o => o.table_id === table.id);
              const visualState = getTableVisualState(table, tableOrders);
              return (
                <Card
                  key={table.id}
                  className={`cursor-pointer border-2 transition-all hover:shadow-md ${visualState.cardClass}`}
                  onClick={() => handleTableClick(table)}
                >
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{table.number}</div>
                    <Badge variant="outline" className="mt-1">{visualState.label}</Badge>
                    {(table as any).guest_count > 0 && (
                      <p className="text-xs mt-1 flex items-center justify-center gap-1"><Users className="h-3 w-3" /> {(table as any).guest_count}</p>
                    )}
                    {tableOrders.length > 0 && (
                      <p className="text-xs mt-1">{tableOrders.length} pedido(s)</p>
                    )}
                    {table.status !== 'free' && (
                      <div className="flex gap-1 justify-center mt-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGuestDialog(table);
                            setGuestCount(String((table as any).guest_count || ''));
                          }}
                        >
                          <Users className="h-3 w-3 mr-1" /> Personas
                        </Button>
                        {tableOrders.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={(e) => { e.stopPropagation(); setCourtesyTable(table); }}
                            title="Cerrar como cortesía"
                          >
                            <Gift className="h-3 w-3 mr-1" /> Cortesía
                          </Button>
                        )}
                      </div>
                    )}
                    {table.status === 'billing' && parsePayments((table as any).payment_request).length > 0 && (
                      <p className="text-xs mt-1 font-medium">{describePayments(parsePayments((table as any).payment_request))}</p>
                    )}
                    <div className="flex gap-1 mt-2 justify-center">
                      {(['free', 'occupied', 'billing'] as const).map(s => (
                        <button
                          key={s}
                          className={`w-5 h-5 rounded-full border-2 transition-all ${table.status === s ? 'ring-2 ring-offset-1 ring-foreground scale-110' : 'opacity-50 hover:opacity-100'}`}
                          style={{ backgroundColor: s === 'free' ? '#22C55E' : '#EF4444' }}
                          title={s === 'free' ? 'Libre' : s === 'occupied' ? 'Ocupada' : 'Pidió la cuenta'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (s === 'billing') setBillTable(table);
                            else if (table.status !== s) changeTableStatus.mutate({ tableId: table.id, status: s });
                          }}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            };

            return (
              <div className="space-y-6">
                {sectorGroups.map(({ sector, sectorTables }) => sectorTables.length > 0 && (
                  <div key={sector.id}>
                    <h2 className="text-lg font-semibold mb-3 text-muted-foreground">{sector.name}</h2>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {sectorTables.map(renderTable)}
                    </div>
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div>
                    {sectors.length > 0 && <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Sin sector</h2>}
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {unassigned.map(renderTable)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="floorplan">
          <FloorPlanView
            onTableClick={handleTableClick}
            tables={tables}
            activeOrders={activeOrders}
          />
        </TabsContent>
      </Tabs>

      <BillRequestDialog
        table={billTable}
        ordersCutoff={ordersCutoff}
        onClose={() => setBillTable(null)}
        saving={changeTableStatus.isPending}
        onConfirm={(paymentRequest) => changeTableStatus.mutate({ tableId: billTable!.id, status: 'billing', paymentRequest })}
      />

      {/* Guest count dialog */}
      <Dialog open={!!guestDialog} onOpenChange={v => { if (!v) setGuestDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Personas en Mesa {guestDialog?.number}</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            const count = parseInt(guestCount) || 0;
            if (guestDialog.startOrder) startOrderWithGuests(guestDialog, count);
            else updateGuestCount.mutate({ tableId: guestDialog.id, count });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>{guestDialog?.startOrder ? '¿Cuántas personas estás atendiendo?' : 'Cantidad de personas'}</Label>
              {guestDialog?.startOrder && (
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <Button key={n} type="button" variant="outline" className="h-12 text-lg"
                      onClick={() => startOrderWithGuests(guestDialog, n)}>
                      {n}
                    </Button>
                  ))}
                </div>
              )}
              <Input type="number" min={guestDialog?.startOrder ? 1 : 0} inputMode="numeric"
                placeholder={guestDialog?.startOrder ? 'Otra cantidad' : undefined}
                value={guestCount} onChange={e => setGuestCount(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">{guestDialog?.startOrder ? 'Tomar pedido' : 'Guardar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {activeOrders.filter(o => o.status === 'ready').length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-primary">🔔 Pedidos listos para entregar</h2>
          {activeOrders.filter(o => o.status === 'ready').map(order => (
            <Card key={order.id} className="border-primary">
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-semibold">Mesa {tables.find(t => t.id === order.table_id)?.number}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {(order as any).order_items?.map((i: any) => `${i.quantity}x ${i.products?.name}`).join(', ')}
                  </span>
                </div>
                <Button size="sm" onClick={() => markDelivered.mutate(order.id)}>Marcar entregado</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <CourtesyDialog
        open={!!courtesyTable}
        onOpenChange={(v) => { if (!v) setCourtesyTable(null); }}
        onConfirm={handleCourtesy}
        isPending={courtesyMutation.isPending}
        tableNumber={courtesyTable?.number}
        total={courtesyTable ? activeOrders.filter((o: any) => o.table_id === courtesyTable.id).reduce((s: number, o: any) => s + Number(o.total), 0) : 0}
      />
    </div>
  );
}

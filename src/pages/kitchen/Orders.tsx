import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle, Clock, AlertTriangle, Printer, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuditLog } from '@/hooks/useAuditLog';
import { KitchenTicket, KitchenTicketData } from '@/components/kitchen/KitchenTicket';

function formatElapsed(created: string) {
  const diff = Math.floor((Date.now() - new Date(created).getTime()) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function KitchenOrders() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const { log: auditLog } = useAuditLog();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef(0);

  const { data: establishment } = useQuery({
    queryKey: ['kitchen-establishment', establishmentId],
    queryFn: async () => {
      const { data } = await supabase.from('establishments').select('name').eq('id', establishmentId!).maybeSingle();
      return data;
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: orders = [], isSuccess: ordersLoaded } = useQuery({
    queryKey: ['kitchen-orders', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, tables(number, sectors(name)), order_items(*, products(name))')
        .eq('establishment_id', establishmentId!)
        .in('status', ['new', 'preparing'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // Realtime: instant updates when orders/items change
  useEffect(() => {
    if (!establishmentId) return;
    const channel = supabase
      .channel('kitchen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  // Persistent AudioContext for reliable sound playback
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

  useEffect(() => {
    const unlock = () => { getAudioContext(); document.removeEventListener('click', unlock); document.removeEventListener('touchstart', unlock); };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => { document.removeEventListener('click', unlock); document.removeEventListener('touchstart', unlock); };
  }, []);

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
      const pattern = [
        { t: 0, freqs: [880, 1760, 2640], vol: 0.6, dur: 0.3 },
        { t: 0.25, freqs: [988, 1976, 2964], vol: 0.7, dur: 0.3 },
        { t: 0.5, freqs: [1047, 2094, 3141], vol: 0.8, dur: 0.4 },
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

  useEffect(() => {
    if (orders.length > prevCountRef.current && prevCountRef.current > 0) {
      playBell();
      toast.info('🔔 Nuevo pedido recibido');
    }
    prevCountRef.current = orders.length;
  }, [orders.length]);

  // ---- Impresión de comandas (impresora predeterminada de esta PC) ----
  const autoKey = `kitchen-autoprint-${establishmentId ?? 'none'}`;
  const printedKey = `kitchen-printed-${establishmentId ?? 'none'}`;
  const [autoPrint, setAutoPrint] = useState(true);
  const [printJob, setPrintJob] = useState<KitchenTicketData | null>(null);
  const queueRef = useRef<KitchenTicketData[]>([]);
  const busyRef = useRef(false);
  const printedRef = useRef<Set<string>>(new Set());
  const firstPrintPassRef = useRef(true);

  useEffect(() => {
    if (!establishmentId) return;
    setAutoPrint(localStorage.getItem(autoKey) !== 'false');
    try {
      printedRef.current = new Set(JSON.parse(localStorage.getItem(printedKey) || '[]'));
    } catch {
      printedRef.current = new Set();
    }
    firstPrintPassRef.current = true;
  }, [establishmentId, autoKey, printedKey]);

  const persistPrinted = () => {
    const ids = [...printedRef.current].slice(-300);
    printedRef.current = new Set(ids);
    localStorage.setItem(printedKey, JSON.stringify(ids));
  };

  const processQueue = () => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    setPrintJob(next);
  };

  useEffect(() => {
    if (!printJob) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing-ticket');
      setPrintJob(null);
      busyRef.current = false;
      setTimeout(processQueue, 600);
    };
    window.addEventListener('afterprint', finish);
    document.body.classList.add('printing-ticket');
    const t = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        console.warn('Print failed', e);
      }
      setTimeout(finish, 1500);
    }, 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing-ticket');
    };
  }, [printJob]);


  const buildTicket = (order: any, reprint = false): KitchenTicketData => {
    const isDelivery = order.channel === 'delivery';
    const isAddition = !isDelivery && !!order.table_id && orders.some(
      (o: any) => o.table_id === order.table_id && new Date(o.created_at) < new Date(order.created_at)
    );
    return {
      establishmentName: establishment?.name,
      tableNumber: isDelivery ? null : order.tables?.number,
      isDelivery,
      platform: isDelivery ? (order.external_platform ?? null) : null,
      customerName: isDelivery ? (order.customer_name ?? null) : null,
      sectorName: isDelivery ? null : (order.tables?.sectors?.name ?? null),
      createdAt: order.created_at,
      isAddition,
      reprint,
      items: (order.order_items ?? []).map((i: any) => ({
        id: i.id,
        quantity: i.quantity,
        name: i.products?.name ?? 'Producto',
        notes: i.notes,
      })),
    };
  };

  // Marca el pedido como impreso en la base de forma atómica: si la cocina está
  // abierta en varias pestañas o dispositivos, sólo la que lo marca primero imprime.
  const claimPrint = async (orderId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('orders')
      .update({ kitchen_printed_at: new Date().toISOString() })
      .eq('id', orderId)
      .is('kitchen_printed_at', null)
      .select('id');
    if (error) {
      // Sin la columna (migración pendiente) o sin red: imprimir igual antes que perder la comanda
      console.warn('No se pudo registrar la impresión de la comanda', error);
      return true;
    }
    return (data?.length ?? 0) > 0;
  };

  const enqueue = (ticket: KitchenTicketData) => {
    queueRef.current.push(ticket);
    processQueue();
  };

  const printTest = () => {
    enqueue({
      establishmentName: establishment?.name,
      tableNumber: 'DEMO',
      sectorName: 'Prueba',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'test-1', quantity: 1, name: 'Prueba de impresión', notes: 'Si ves esto, la comandera está OK' },
        { id: 'test-2', quantity: 2, name: 'Ítem de ejemplo', notes: null },
      ],
    });
    toast.info('Enviando comanda de prueba a la impresora predeterminada');
  };


  // Auto-imprime cada pedido nuevo una sola vez
  useEffect(() => {
    if (!establishmentId || !ordersLoaded) return;

    if (firstPrintPassRef.current) {
      // No reimprimir pedidos que ya estaban en pantalla al abrir/refrescar
      firstPrintPassRef.current = false;
      orders.forEach((o: any) => printedRef.current.add(o.id));
      persistPrinted();
      return;
    }

    // Incorpora lo que otras pestañas de este navegador ya marcaron como impreso
    try {
      JSON.parse(localStorage.getItem(printedKey) || '[]').forEach((id: string) => printedRef.current.add(id));
    } catch {
      // ignore
    }

    // Sólo pedidos nuevos que ya tengan ítems cargados (evita comandas vacías por carrera)
    const unprinted = orders.filter(
      (o: any) => !printedRef.current.has(o.id) && (o.order_items?.length ?? 0) > 0
    );
    if (unprinted.length === 0) return;

    unprinted.forEach((o: any) => printedRef.current.add(o.id));
    persistPrinted();
    if (!autoPrint) return;
    unprinted.forEach((o: any) => {
      if (o.kitchen_printed_at) return;
      claimPrint(o.id).then((claimed) => {
        if (claimed) enqueue(buildTicket(o));
      });
    });
  }, [orders, ordersLoaded, autoPrint, establishmentId]);



  const markItemReady = useMutation({
    mutationFn: async ({ itemId, orderId }: { itemId: string; orderId: string }) => {
      await supabase.from('order_items').update({ status: 'ready' as any }).eq('id', itemId);

      const { data: items } = await supabase.from('order_items').select('status').eq('order_id', orderId);
      const allReady = items?.every(i => i.status === 'ready');
      if (allReady) {
        await supabase.from('orders').update({ status: 'ready' as any, prepared_at: new Date().toISOString() }).eq('id', orderId);
      } else {
        await supabase.from('orders').update({ status: 'preparing' as any }).eq('id', orderId);
      }
    },
    onMutate: async ({ itemId, orderId }) => {
      await queryClient.cancelQueries({ queryKey: ['kitchen-orders', establishmentId] });
      const prev = queryClient.getQueryData(['kitchen-orders', establishmentId]);
      queryClient.setQueryData(['kitchen-orders', establishmentId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((order: any) => {
          if (order.id !== orderId) return order;
          const updatedItems = order.order_items?.map((item: any) =>
            item.id === itemId ? { ...item, status: 'ready' } : item
          );
          const allReady = updatedItems?.every((i: any) => i.status === 'ready');
          return { ...order, order_items: updatedItems, status: allReady ? 'ready' : 'preparing' };
        }).filter((order: any) => order.status !== 'ready');
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['kitchen-orders', establishmentId], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
    },
  });

  const markOrderReady = useMutation({
    mutationFn: async (orderId: string) => {
      await supabase.from('order_items').update({ status: 'ready' as any }).eq('order_id', orderId).neq('status', 'ready' as any);
      await supabase.from('orders').update({ status: 'ready' as any, prepared_at: new Date().toISOString() }).eq('id', orderId);
    },
    onMutate: async (orderId: string) => {
      await queryClient.cancelQueries({ queryKey: ['kitchen-orders', establishmentId] });
      const prev = queryClient.getQueryData(['kitchen-orders', establishmentId]);
      queryClient.setQueryData(['kitchen-orders', establishmentId], (old: any[] | undefined) =>
        old ? old.filter((o: any) => o.id !== orderId) : old
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['kitchen-orders', establishmentId], context.prev);
      toast.error('No se pudo marcar la comanda como lista');
    },
    onSuccess: () => toast.success('Comanda lista 🔔'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
    },
  });




  const markProductUnavailable = useMutation({
    mutationFn: async (productId: string) => {
      await supabase.from('products').update({ is_available: false }).eq('id', productId);
    },
    onSuccess: (_data, productId) => {
      auditLog('mark_unavailable', 'products', productId);
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', establishmentId] });
      toast.warning('Producto marcado como agotado. Ya no aparece en la carta.');
    },
    onError: () => toast.error('Error al marcar producto como agotado'),
  });



  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-3xl font-bold tracking-tight">Pedidos activos ({orders.length})</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={printTest}>
            <Printer className="h-4 w-4 mr-2" /> Probar impresión
          </Button>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Printer className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="autoprint" className="text-sm">Impresión automática</Label>
            <Switch
              id="autoprint"
              checked={autoPrint}
              onCheckedChange={(v) => {
                setAutoPrint(v);
                localStorage.setItem(autoKey, String(v));
                toast.success(v ? 'Las comandas se imprimirán solas en esta PC' : 'Impresión automática desactivada');
              }}
            />
          </div>
        </div>

      </div>

      <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground print:hidden">
        <Info className="h-4 w-4 shrink-0" />
        <p>
          Las comandas salen por la <strong>impresora predeterminada de esta computadora</strong>: configurá acá la
          impresora de cocina (80mm). Para que no aparezca el cuadro de impresión, abrí Chrome con la opción{' '}
          <code>--kiosk-printing</code> (clic derecho en el acceso directo → Propiedades → Destino, agregar{' '}
          <code>--kiosk-printing</code> al final).
        </p>
      </div>


      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-lg">Sin pedidos pendientes 🎉</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order: any) => (
            <Card key={order.id} className={order.status === 'new' ? 'border-primary border-2 animate-pulse' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{order.channel === 'delivery' ? `Delivery${order.external_platform ? ' · ' + order.external_platform : ''}` : `Mesa ${order.tables?.number}`}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono text-muted-foreground">{formatElapsed(order.created_at)}</span>
                  </div>
                </div>
                <Badge variant={order.status === 'new' ? 'default' : 'secondary'}>
                  {order.status === 'new' ? '🆕 Nuevo' : '🔥 Preparando'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className={`flex items-center justify-between py-2 border-b last:border-0 ${item.status === 'ready' ? 'opacity-50' : ''}`}>
                    <div>
                      <div className="font-medium text-sm">
                        {item.quantity}x {item.products?.name}
                        {item.status === 'ready' && <CheckCircle className="inline h-4 w-4 text-green-500 ml-1" />}
                      </div>
                      {item.notes && <p className="text-xs text-muted-foreground italic">📝 {item.notes}</p>}
                    </div>
                    <div className="flex gap-1">
                      {item.status !== 'ready' && (
                        <Button size="sm" variant="outline" onClick={() => markItemReady.mutate({ itemId: item.id, orderId: order.id })}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Listo
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Marcar como agotado"
                        onClick={() => {
                          toast('¿Marcar como agotado?', {
                            description: `"${item.products?.name}" dejará de aparecer en la carta y para los mozos.`,
                            action: {
                              label: 'Sí, agotar',
                              onClick: () => markProductUnavailable.mutate(item.product_id),
                            },
                            duration: 6000,
                          });
                        }}
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  className="w-full mt-3 print:hidden"
                  onClick={() => markOrderReady.mutate(order.id)}
                  disabled={markOrderReady.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Comanda lista
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full mt-2 text-xs text-muted-foreground print:hidden"
                  onClick={() => enqueue(buildTicket(order, true))}
                >
                  <Printer className="h-3 w-3 mr-1" /> Reimprimir
                </Button>

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {printJob && <KitchenTicket data={printJob} />}
    </div>

  );
}

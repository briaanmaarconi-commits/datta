import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BellRing, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuditLog } from '@/hooks/useAuditLog';

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo', preparing: 'En preparación', ready: 'Listo', delivered: 'Entregado',
};
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700', preparing: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-green-100 text-green-700 animate-pulse', delivered: 'bg-gray-100 text-gray-700',
};

function getReadyMinutes(preparedAt: string | null): number | null {
  if (!preparedAt) return null;
  return Math.floor((Date.now() - new Date(preparedAt).getTime()) / 60000);
}

export default function WaiterOrders() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const { log: auditLog } = useAuditLog();
  const prevReadyIdsRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const initialLoadRef = useRef(true);

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

  const playReadySound = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const playTone = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };
      // Ding-dong cheerful alert
      playTone(880, now, 0.3, 0.5);
      playTone(1175, now + 0.15, 0.3, 0.6);
      playTone(1320, now + 0.3, 0.4, 0.7);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  };

  const { data: orders = [] } = useQuery({
    queryKey: ['waiter-orders', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, tables(number), order_items(*, products(name))')
        .eq('establishment_id', establishmentId!)
        .in('status', ['new', 'preparing', 'ready', 'delivered'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    refetchInterval: 5000,
  });

  const markDelivered = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered' as any, delivered_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-orders'] });
      toast.success('Pedido marcado como entregado ✅');
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' as any })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: (_d, orderId) => {
      auditLog('cancel_order', 'orders', orderId);
      queryClient.invalidateQueries({ queryKey: ['waiter-orders'] });
      toast.success('Pedido cancelado');
    },
    onError: () => toast.error('Error al cancelar pedido'),
  });

  const readyOrders = orders.filter((o: any) => o.status === 'ready');

  useEffect(() => {
    const currentReadyIds = new Set(readyOrders.map((o: any) => o.id));
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      prevReadyIdsRef.current = currentReadyIds;
      return;
    }
    const hasNewReady = [...currentReadyIds].some(id => !prevReadyIdsRef.current.has(id));
    if (hasNewReady) {
      playReadySound();
    }
    prevReadyIdsRef.current = currentReadyIds;
  }, [readyOrders.map((o: any) => o.id).join(',')]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>

      {readyOrders.length > 0 && (
        <div className="rounded-lg border-2 border-green-500 bg-green-500/10 p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-2">
            <BellRing className="h-6 w-6 text-green-500" />
            <span className="text-lg font-bold text-green-600">
              🍽️ ¡{readyOrders.length} pedido{readyOrders.length > 1 ? 's' : ''} listo{readyOrders.length > 1 ? 's' : ''} para entregar!
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {readyOrders.map((o: any) => (
              <Badge key={o.id} className="bg-green-500 text-white text-sm px-3 py-1">
                Mesa {o.tables?.number}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {orders.map((order: any) => (
          <Card key={order.id} className={order.status === 'ready' ? 'border-green-500 border-2' : ''}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold">Mesa {order.tables?.number}</span>
                <div className="flex items-center gap-2">
                  {order.status === 'ready' && (() => {
                    const mins = getReadyMinutes(order.prepared_at);
                    if (mins != null && mins >= 5) {
                      return (
                        <span className="text-xs font-medium text-red-600 animate-pulse">
                          ⏱️ {mins} min esperando
                        </span>
                      );
                    }
                    return null;
                  })()}
                  <Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                </div>
              </div>
              <div className="space-y-1">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="text-sm flex justify-between">
                    <span>{item.quantity}x {item.products?.name} {item.notes && <span className="text-muted-foreground">({item.notes})</span>}</span>
                    <span>${(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="text-right font-bold mt-2">Total: ${Number(order.total).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">{new Date(order.created_at).toLocaleTimeString()}</p>
              <div className="flex gap-2 mt-3">
                {['new', 'preparing'].includes(order.status) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      toast('¿Cancelar este pedido?', {
                        description: `Mesa ${order.tables?.number} — $${Number(order.total).toFixed(2)}`,
                        action: {
                          label: 'Sí, cancelar',
                          onClick: () => cancelOrder.mutate(order.id),
                        },
                        duration: 6000,
                      });
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Cancelar pedido
                  </Button>
                )}
                {order.status === 'ready' && (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => markDelivered.mutate(order.id)}
                    disabled={markDelivered.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> Marcar como entregado
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
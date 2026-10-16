import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { KitchenTicket, type KitchenTicketData } from '@/components/kitchen/KitchenTicket';
import { PLATFORM_LABELS, type DeliveryPlatform } from '@/hooks/useDeliverySettings';
import { DEFAULT_PREP_AREA, PREP_AREAS, PREP_AREA_LABEL, type PrepArea } from '@/lib/printAgent';
import { deliveryAddressLine } from '@/lib/ownDelivery';
import { COMANDA_PRINT_EVENT, COMANDA_TEST_EVENT, isCashierComandaPrintOn } from '@/lib/comandaPrint';

// Solo se imprimen ítems recientes: al encender la función no se reimprime lo viejo.
const MAX_AGE_MS = 10 * 60 * 1000;
const POLL_MS = 5000;

interface OrderItemRow {
  id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  kitchen_printed_at: string | null;
  products?: { name?: string; categories?: { prep_area?: PrepArea | null } | null } | null;
}
interface OrderRow {
  id: string;
  table_id: string | null;
  channel?: string | null;
  external_platform?: string | null;
  customer_name?: string | null;
  delivery_address?: unknown;
  created_at: string;
  tables?: { number?: number; sectors?: { name?: string } | null } | null;
  order_items?: OrderItemRow[];
}

/**
 * Imprime en la PC de caja, automáticamente, una comanda por sector (fiambrería, plato principal, postre,
 * bebida...) cada vez que se toma un pedido. Reclama los ítems en la base como la pantalla de Cocina, así que
 * nunca se imprime dos veces aunque haya otra pantalla abierta. Va por la impresora predeterminada de la PC.
 */
export default function CashierComandaPrinter() {
  const { establishmentId, viewAs } = useAuth();
  const [on, setOn] = useState(false);
  const [printJob, setPrintJob] = useState<KitchenTicketData | null>(null);
  const queueRef = useRef<KitchenTicketData[]>([]);
  const busyRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const read = () => setOn(isCashierComandaPrintOn(establishmentId));
    read();
    window.addEventListener(COMANDA_PRINT_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(COMANDA_PRINT_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [establishmentId]);

  // El superadmin que mira desde su navegador no imprime ni reclama las comandas del local.
  const active = on && !!establishmentId && !viewAs;

  const { data: establishment } = useQuery({
    queryKey: ['comanda-establishment', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('establishments').select('name').eq('id', establishmentId!).maybeSingle();
      return data as { name?: string } | null;
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['cashier-comandas', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('*, tables(number, sectors(name)), order_items(*, products(name, categories(prep_area)))')
        .eq('establishment_id', establishmentId!)
        .in('status', ['new', 'preparing'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
    enabled: active,
    refetchInterval: POLL_MS,
    staleTime: 2000,
  });

  // ── Cola de impresión (una a la vez) ──
  const processQueue = () => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    setPrintJob(next);
  };
  const enqueue = (t: KitchenTicketData) => {
    queueRef.current.push(t);
    processQueue();
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

  // Reclama atómicamente los ítems: si ya los reclamó otra pantalla, esta no los imprime.
  const claimPrint = async (itemIds: string[]): Promise<Set<string> | null> => {
    const { data, error } = await db
      .from('order_items')
      .update({ kitchen_printed_at: new Date().toISOString() })
      .in('id', itemIds)
      .is('kitchen_printed_at', null)
      .select('id');
    if (error) {
      console.warn('No se pudo registrar la impresión de la comanda', error);
      return null; // se imprime igual para no perder la comanda
    }
    return new Set(((data as { id: string }[] | null) ?? []).map((r) => r.id));
  };

  // Una comanda por sector, en el orden en que sale de cocina.
  const buildTickets = (order: OrderRow, items: OrderItemRow[], isAddition: boolean): KitchenTicketData[] => {
    const isDelivery = order.channel === 'delivery';
    const createdAt = items.map((i) => i.created_at).filter(Boolean).sort().at(-1) ?? order.created_at;
    const byArea = new Map<PrepArea, OrderItemRow[]>();
    for (const it of items) {
      const area = (it.products?.categories?.prep_area ?? DEFAULT_PREP_AREA) as PrepArea;
      byArea.set(area, [...(byArea.get(area) ?? []), it]);
    }
    return PREP_AREAS.filter((a) => byArea.has(a)).map((area) => ({
      establishmentName: establishment?.name,
      tableNumber: isDelivery ? null : order.tables?.number,
      isDelivery,
      platform: isDelivery ? (PLATFORM_LABELS[order.external_platform as DeliveryPlatform] ?? order.external_platform ?? null) : null,
      customerName: isDelivery ? (order.customer_name ?? null) : null,
      deliveryAddress: isDelivery ? deliveryAddressLine(order.delivery_address) : null,
      sectorName: isDelivery ? null : (order.tables?.sectors?.name ?? null),
      createdAt,
      isAddition,
      areaName: PREP_AREA_LABEL[area],
      items: byArea.get(area)!.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        name: i.products?.name ?? 'Producto',
        notes: i.notes,
        area,
      })),
    }));
  };

  // Pedidos nuevos y agregados: se reclaman e imprimen.
  useEffect(() => {
    if (!active) return;
    const now = Date.now();
    for (const o of orders) {
      const all = o.order_items ?? [];
      const fresh = all.filter(
        (i) => !i.kitchen_printed_at && !seenRef.current.has(i.id) && now - new Date(i.created_at).getTime() < MAX_AGE_MS,
      );
      if (fresh.length === 0) continue;
      fresh.forEach((i) => seenRef.current.add(i.id));
      claimPrint(fresh.map((i) => i.id)).then((claimed) => {
        const mine = claimed ? fresh.filter((i) => claimed.has(i.id)) : fresh;
        if (mine.length === 0) return;
        const isAddition = all.length > mine.length;
        buildTickets(o, mine, isAddition).forEach(enqueue);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, active]);

  // Botón "Imprimir comandas de prueba" de la pantalla Impresoras.
  useEffect(() => {
    const test = () => {
      const base = { establishmentName: establishment?.name, tableNumber: 'DEMO', sectorName: 'Prueba', createdAt: new Date().toISOString() };
      PREP_AREAS.filter((a) => a !== 'entrada').forEach((area, n) =>
        enqueue({
          ...base,
          areaName: PREP_AREA_LABEL[area],
          items: [{ id: `test-${area}`, quantity: n + 1, name: `Prueba ${PREP_AREA_LABEL[area]}`, notes: 'Si ves esto, la impresora está OK', area }],
        }),
      );
    };
    window.addEventListener(COMANDA_TEST_EVENT, test);
    return () => window.removeEventListener(COMANDA_TEST_EVENT, test);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment?.name]);

  return printJob ? <KitchenTicket data={printJob} /> : null;
}

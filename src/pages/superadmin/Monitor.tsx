import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, ChefHat, Eye, Search, UserRound, WalletCards } from 'lucide-react';
import { openViewAs, type ViewRole } from '@/lib/viewAs';

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-green-500/20 border-green-500 text-green-700',
  occupied: 'bg-red-500/20 border-red-500 text-red-700',
  billing: 'bg-yellow-500/20 border-yellow-500 text-yellow-700',
};
const STATUS_LABELS: Record<string, string> = { free: 'Libre', occupied: 'Ocupada', billing: 'En preparación' };

const VIEWS: { role: ViewRole; label: string; Icon: typeof ChefHat }[] = [
  { role: 'kitchen', label: 'Cocina', Icon: ChefHat },
  { role: 'cashier', label: 'Caja', Icon: WalletCards },
  { role: 'waiter', label: 'Mozo', Icon: UserRound },
];

/** "hace 5 min", "hace 3 h", "hace 2 días". */
function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'sin pedidos';
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 48) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

export default function SuperAdminMonitor() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // refresca los "hace X min"
    return () => clearInterval(t);
  }, []);

  const { data: establishments = [] } = useQuery({
    queryKey: ['monitor-establishments'],
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('id, name, is_active').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: allTables = [] } = useQuery({
    queryKey: ['monitor-tables'],
    queryFn: async () => {
      const { data, error } = await db.from('tables').select('*').order('number');
      if (error) throw error;
      return data;
    },
  });

  // Pedidos en curso (nuevos o en preparación) de todos los locales.
  const { data: activeOrders = [] } = useQuery({
    queryKey: ['monitor-active-orders'],
    queryFn: async () => {
      const { data, error } = await db.from('orders').select('id, establishment_id, status, created_at').in('status', ['new', 'preparing']);
      if (error) throw error;
      return data as { id: string; establishment_id: string; status: string; created_at: string }[];
    },
    refetchInterval: 15_000,
  });

  // Pedidos más recientes (para "último pedido" por local).
  const { data: recentOrders = [] } = useQuery({
    queryKey: ['monitor-recent-orders'],
    queryFn: async () => {
      const { data, error } = await db.from('orders').select('establishment_id, created_at').order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return data as { establishment_id: string; created_at: string }[];
    },
    refetchInterval: 30_000,
  });

  // Turnos de caja abiertos.
  const { data: openShifts = [] } = useQuery({
    queryKey: ['monitor-open-shifts'],
    queryFn: async () => {
      const { data, error } = await db.from('shift_controls').select('id, establishment_id').is('closed_at', null);
      if (error) throw error;
      return data as { id: string; establishment_id: string }[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const refresh = (keys: string[]) => () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    const channel = db
      .channel('superadmin-live-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, refresh(['monitor-tables']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh(['monitor-active-orders', 'monitor-recent-orders']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh(['monitor-active-orders']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_controls' }, refresh(['monitor-open-shifts']))
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [queryClient]);

  const lastOrderAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of recentOrders) if (!m.has(o.establishment_id)) m.set(o.establishment_id, o.created_at);
    return m;
  }, [recentOrders]);

  const shown = establishments.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoreo en tiempo real</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Eye className="h-4 w-4" /> Entrá a la cocina, caja o mozo de un local: se abre en una pestaña nueva, en modo solo mirar.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar restaurante…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 pl-8" />
        </div>
      </div>

      {shown.map((est) => {
        const tables = allTables.filter((t) => t.establishment_id === est.id);
        const occupied = tables.filter((t) => t.status !== 'free').length;
        const mine = activeOrders.filter((o) => o.establishment_id === est.id);
        const fresh = mine.filter((o) => o.status === 'new').length;
        const cooking = mine.filter((o) => o.status === 'preparing').length;
        const shiftOpen = openShifts.some((s) => s.establishment_id === est.id);
        return (
          <Card key={est.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg">
                <span className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />{est.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm font-normal">
                  <Badge variant="outline">{occupied}/{tables.length} mesas activas</Badge>
                  <Badge variant={mine.length ? 'destructive' : 'secondary'}>
                    {mine.length ? `${fresh} nuevos · ${cooking} en preparación` : 'Sin pedidos en curso'}
                  </Badge>
                  <Badge variant={shiftOpen ? 'default' : 'secondary'}>{shiftOpen ? 'Caja abierta' : 'Caja cerrada'}</Badge>
                  <span className="text-muted-foreground">Último pedido: {ago(lastOrderAt.get(est.id), now)}</span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {VIEWS.map(({ role, label, Icon }) => (
                    <Button key={role} size="sm" variant="outline" className="gap-1.5" onClick={() => openViewAs(est, role)} title={`Ver la ${label.toLowerCase()} de ${est.name} en vivo`}>
                      <Icon className="h-4 w-4" /> {label}
                    </Button>
                  ))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tables.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin mesas configuradas</p>
              ) : (
                <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {tables.map((table) => (
                    <div key={table.id} className={`border-2 rounded-lg p-2 text-center transition-all ${STATUS_COLORS[table.status]}`}>
                      <div className="text-lg font-bold">{table.number}</div>
                      <div className="text-xs">{STATUS_LABELS[table.status]}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {shown.length === 0 && <p className="py-8 text-center text-muted-foreground">No se encontraron restaurantes</p>}
    </div>
  );
}

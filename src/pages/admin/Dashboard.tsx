import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DollarSign, ShoppingCart, Receipt, Clock } from 'lucide-react';
import { toArgDate, argDayRange } from '@/lib/utils';
import InsightsFeed from '@/components/admin/InsightsFeed';


export default function AdminDashboard() {
  const { establishmentId } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['admin-stats', establishmentId],
    queryFn: async () => {
      const today = toArgDate();
      const { from, to } = argDayRange(today);

      const [ordersRes, tablesRes] = await Promise.all([
        supabase.from('orders')
          .select('id, total, status, created_at')
          .eq('establishment_id', establishmentId!)
          .gte('created_at', from)
          .lte('created_at', to),
        supabase.from('tables')
          .select('id, status')
          .eq('establishment_id', establishmentId!),
      ]);

      const orders = ordersRes.data || [];
      const tables = tablesRes.data || [];
      const closedOrders = orders.filter(o => o.status === 'closed');
      const totalSales = closedOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const avgTicket = closedOrders.length > 0 ? totalSales / closedOrders.length : 0;

      return {
        totalSales,
        totalOrders: orders.length,
        closedOrders: closedOrders.length,
        avgTicket,
        activeTables: tables.filter(t => t.status !== 'free').length,
        totalTables: tables.length,
      };
    },
    enabled: !!establishmentId,
    refetchInterval: 30000,
  });

  const fmt = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`;
  const occupancy = stats?.totalTables ? Math.round((stats.activeTables / stats.totalTables) * 100) : 0;

  const cards = [
    { title: 'Ventas hoy', value: fmt(stats?.totalSales ?? 0), sub: `${stats?.closedOrders ?? 0} pedidos cobrados`, icon: DollarSign },
    { title: 'Pedidos hoy', value: stats?.totalOrders ?? 0, sub: 'Registrados en el día', icon: ShoppingCart },
    { title: 'Ticket promedio', value: fmt(stats?.avgTicket ?? 0), sub: 'Por pedido cerrado', icon: Receipt },
    { title: 'Mesas activas', value: `${stats?.activeTables ?? 0}/${stats?.totalTables ?? 0}`, sub: `${occupancy}% de ocupación`, icon: Clock, progress: occupancy },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div
            key={c.title}
            className="group relative overflow-hidden rounded-2xl bg-white p-5 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#EA580C]/10 blur-2xl transition-opacity opacity-60 group-hover:opacity-100" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#18181B]/60">{c.title}</p>
                <div className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#18181B]">{c.value}</div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EA580C]/15 text-[#EA580C] ring-1 ring-[#EA580C]/30">
                <c.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="relative mt-2 text-xs text-[#18181B]/50">{c.sub}</p>
            {c.progress !== undefined && (
              <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#18181B]/10">
                <div className="h-full rounded-full bg-[#EA580C]" style={{ width: `${c.progress}%` }} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#EA580C] to-transparent" />
          </div>
        ))}
      </div>

      <InsightsFeed />
    </div>
  );
}


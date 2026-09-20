import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DollarSign, ShoppingCart, Receipt, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toArgDate, argDayRange } from '@/lib/utils';
import HealthScoreCard from '@/components/admin/HealthScoreCard';
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

  const cards = [
    { title: 'Ventas hoy', value: `$${(stats?.totalSales ?? 0).toFixed(2)}`, icon: DollarSign },
    { title: 'Pedidos hoy', value: stats?.totalOrders ?? 0, icon: ShoppingCart },
    { title: 'Ticket promedio', value: `$${(stats?.avgTicket ?? 0).toFixed(2)}`, icon: Receipt },
    { title: 'Mesas activas', value: `${stats?.activeTables ?? 0}/${stats?.totalTables ?? 0}`, icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <HealthScoreCard />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <InsightsFeed />
    </div>
  );
}


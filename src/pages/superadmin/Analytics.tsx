import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { toArgDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, Building2, TrendingUp, TrendingDown } from 'lucide-react';

const COLORS = ['hsl(25, 95%, 53%)', 'hsl(220, 70%, 55%)', 'hsl(150, 60%, 45%)', 'hsl(280, 60%, 55%)', 'hsl(0, 70%, 55%)'];

export default function SuperAdminAnalytics() {
  const [period, setPeriod] = useState('month');
  const [selectedEst, setSelectedEst] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishments'],
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('id, name');
      if (error) throw error;
      return data;
    },
  });

  const getDateRange = () => {
    const now = new Date();
    let from: Date;
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    switch (period) {
      case 'today': from = new Date(now); from.setHours(0, 0, 0, 0); break;
      case 'week': from = new Date(now); from.setDate(now.getDate() - now.getDay()); from.setHours(0, 0, 0, 0); break;
      case 'month': from = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'year': from = new Date(now.getFullYear(), 0, 1); break;
      case 'custom': from = customFrom ? new Date(customFrom) : new Date(now); if (customTo) to.setTime(new Date(customTo).getTime() + 86399999); break;
      default: from = new Date(now); from.setHours(0, 0, 0, 0);
    }
    return { from: from!.toISOString(), to: to.toISOString() };
  };

  const { from, to } = getDateRange();

  // Restaurant sales data
  const { data: salesData } = useQuery({
    queryKey: ['superadmin-analytics', from, to, selectedEst],
    queryFn: async () => {
      let query = db.from('orders')
        .select('id, total, status, created_at, establishment_id, establishments(name)')
        .eq('status', 'closed')
        .gte('created_at', from)
        .lte('created_at', to);
      if (selectedEst !== 'all') query = query.eq('establishment_id', selectedEst);
      const { data: orders, error } = await query;
      if (error) throw error;

      const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
      const totalOrders = orders.length;
      const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

      const estMap: Record<string, { name: string; sales: number; orders: number }> = {};
      orders.forEach((o: any) => {
        const eid = o.establishment_id;
        const name = o.establishments?.name || 'Desconocido';
        if (!estMap[eid]) estMap[eid] = { name, sales: 0, orders: 0 };
        estMap[eid].sales += Number(o.total);
        estMap[eid].orders += 1;
      });
      const byEstablishment = Object.values(estMap).sort((a, b) => b.sales - a.sales);

      const dayMap: Record<string, number> = {};
      orders.forEach(o => {
        const day = toArgDate(o.created_at);
        dayMap[day] = (dayMap[day] || 0) + Number(o.total);
      });
      const salesByDay = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({
        date: new Date(date).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
        total,
      }));

      return { totalSales, totalOrders, avgTicket, byEstablishment, salesByDay };
    },
  });

  // Datta finances
  const { data: dattaFinances } = useQuery({
    queryKey: ['sa-datta-finances', from, to],
    queryFn: async () => {
      const { data, error } = await db.from('datta_transactions')
        .select('type, amount, date, datta_finance_categories(name)')
        .gte('date', from.split('T')[0])
        .lte('date', to.split('T')[0]);
      if (error) throw error;

      const income = (data || []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const expense = (data || []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const margin = income > 0 ? ((income - expense) / income * 100) : 0;

      // By category
      const catMap: Record<string, { name: string; amount: number; type: string }> = {};
      (data || []).forEach((t: any) => {
        const name = t.datta_finance_categories?.name || 'Otros';
        if (!catMap[name]) catMap[name] = { name, amount: 0, type: t.type };
        catMap[name].amount += Number(t.amount);
      });
      const byCategory = Object.values(catMap).sort((a, b) => b.amount - a.amount);

      return { income, expense, margin, byCategory };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Analíticas</h1>
        <Select value={selectedEst} onValueChange={setSelectedEst}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {establishments.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="year">Anual</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {period === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {/* Datta KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Ingresos Datta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(dattaFinances?.income ?? 0).toLocaleString('es-AR')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4" />Egresos Datta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(dattaFinances?.expense ?? 0).toLocaleString('es-AR')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Margen</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${(dattaFinances?.margin ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(dattaFinances?.margin ?? 0).toFixed(1)}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" />Ventas restaurantes</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(salesData?.totalSales ?? 0).toLocaleString('es-AR')}</div></CardContent>
        </Card>
      </div>

      {/* Restaurant analytics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pedidos totales</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{salesData?.totalOrders ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ticket promedio</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${(salesData?.avgTicket ?? 0).toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Restaurantes activos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{establishments.length}</div></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ventas por día</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={salesData?.salesByDay || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Ventas']} />
                <Line type="monotone" dataKey="total" stroke="hsl(25, 95%, 53%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ventas por restaurante</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salesData?.byEstablishment || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="name" fontSize={12} width={120} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Ventas']} />
                <Bar dataKey="sales" fill="hsl(25, 95%, 53%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Datta expenses by category */}
      {dattaFinances?.byCategory && dattaFinances.byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Movimientos Datta por categoría</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dattaFinances.byCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-AR')}`, 'Monto']} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {dattaFinances.byCategory.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.type === 'income' ? 'hsl(150, 60%, 45%)' : 'hsl(0, 70%, 55%)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, DollarSign, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';

const PLAN_COLORS = ['hsl(25, 95%, 53%)', 'hsl(220, 70%, 55%)', 'hsl(150, 60%, 45%)', 'hsl(280, 60%, 55%)', 'hsl(0, 70%, 55%)'];

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { data: establishments = [] } = useQuery({
    queryKey: ['sa-establishments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('establishments').select('*, client_plans(name)');
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['sa-datta-transactions-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.from('datta_transactions').select('type, amount');
      if (error) throw error;
      return data;
    },
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ['sa-dashboard-payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_payments').select('establishment_id, period_month, period_year');
      if (error) throw error;
      return data;
    },
  });

  const activeClients = establishments.filter((e: any) => e.is_active && e.service_status === 'active').length;
  const totalClients = establishments.length;
  const mrr = establishments
    .filter((e: any) => e.is_active && e.service_status === 'active')
    .reduce((s: number, e: any) => s + Number(e.agreed_price || 0), 0);

  const totalIncome = transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const margin = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0;

  // Morosidad: active clients without payment for current month
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const activeEstablishments = establishments.filter((e: any) => e.is_active && e.service_status === 'active');
  const overdueClients = activeEstablishments.filter((e: any) =>
    !allPayments.some((p: any) => p.establishment_id === e.id && p.period_month === currentMonth && p.period_year === currentYear)
  );

  // Plans distribution
  const planMap: Record<string, number> = {};
  establishments.forEach((e: any) => {
    const planName = e.client_plans?.name || 'Sin plan';
    planMap[planName] = (planMap[planName] || 0) + 1;
  });
  const planData = Object.entries(planMap).map(([name, value]) => ({ name, value }));

  // Revenue by month (from datta_transactions)
  const { data: monthlyData = [] } = useQuery({
    queryKey: ['sa-monthly-revenue'],
    queryFn: async () => {
      const { data, error } = await supabase.from('datta_transactions').select('type, amount, date').order('date');
      if (error) throw error;
      const monthMap: Record<string, { income: number; expense: number }> = {};
      (data || []).forEach((t: any) => {
        const month = t.date.substring(0, 7);
        if (!monthMap[month]) monthMap[month] = { income: 0, expense: 0 };
        if (t.type === 'income') monthMap[month].income += Number(t.amount);
        else monthMap[month].expense += Number(t.amount);
      });
      return Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([month, v]) => ({
          month: new Date(month + '-01').toLocaleDateString('es', { month: 'short', year: '2-digit' }),
          ingresos: v.income,
          egresos: v.expense,
        }));
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" />Clientes activos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{activeClients}<span className="text-sm text-muted-foreground ml-1">/ {totalClients}</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />MRR</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${mrr.toLocaleString('es-AR')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Margen</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{margin.toFixed(1)}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Total usuarios</CardTitle></CardHeader>
          <CardContent>
            <UsersCount />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ingresos vs Egresos</CardTitle></CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin datos aún. Registrá movimientos en Caja.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-AR')}`, '']} />
                  <Bar dataKey="ingresos" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="egresos" fill="hsl(0, 70%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Distribución por plan</CardTitle></CardHeader>
          <CardContent>
            {planData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin clientes registrados.</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={200}>
                  <PieChart>
                    <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                      {planData.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {planData.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                      <span>{p.name}: {p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Morosidad alerts */}
      {overdueClients.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Pagos pendientes ({overdueClients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueClients.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between p-2 rounded-md bg-destructive/10">
                  <div>
                    <span className="font-medium">{e.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">{e.client_plans?.name || 'Sin plan'} — ${Number(e.agreed_price || 0).toLocaleString('es-AR')}/mes</span>
                  </div>
                  <Badge variant="destructive">Pendiente</Badge>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/superadmin/clients')} className="text-sm text-primary mt-3 hover:underline">Ver todos los clientes →</button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersCount() {
  const { data: count = 0 } = useQuery({
    queryKey: ['sa-users-count'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('id');
      if (error) throw error;
      return data.length;
    },
  });
  return <div className="text-2xl font-bold">{count}</div>;
}

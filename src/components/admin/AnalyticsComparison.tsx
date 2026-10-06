import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, CreditCard, Users, Gauge, Minus } from 'lucide-react';
import ExpandableChartCard from '@/components/admin/ExpandableChartCard';

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompactInt(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

const PERIODS = [
  { value: 'today', label: 'Hoy vs Ayer' },
  { value: 'week', label: 'Esta semana vs anterior' },
  { value: 'month', label: 'Este mes vs anterior' },
  { value: 'year', label: 'Este año vs anterior' },
  { value: 'months', label: 'Comparar meses' },
  { value: 'custom', label: 'Personalizado' },
];

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface MonthYear { month: number; year: number } // month: 0-11

function monthLabel(my: MonthYear): string {
  return `${MONTH_NAMES[my.month]} ${my.year}`;
}

function getComparisonRanges(period: string, customFrom?: string, customTo?: string, monthA?: MonthYear, monthB?: MonthYear) {
  const now = new Date();
  let currentFrom: Date, currentTo: Date, prevFrom: Date, prevTo: Date;

  currentTo = new Date(now);
  currentTo.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today': {
      // Hoy completo vs ayer completo, hasta la misma hora actual
      currentFrom = new Date(now); currentFrom.setHours(0, 0, 0, 0);
      currentTo = new Date(now); // hasta este momento
      prevFrom = new Date(currentFrom); prevFrom.setDate(prevFrom.getDate() - 1);
      prevTo = new Date(currentTo); prevTo.setDate(prevTo.getDate() - 1);
      break;
    }
    case 'week': {
      // Esta semana (desde domingo hasta ahora) vs misma franja de la semana anterior
      currentFrom = new Date(now);
      currentFrom.setDate(now.getDate() - now.getDay());
      currentFrom.setHours(0, 0, 0, 0);
      currentTo = new Date(now);
      prevFrom = new Date(currentFrom); prevFrom.setDate(prevFrom.getDate() - 7);
      prevTo = new Date(currentTo); prevTo.setDate(prevTo.getDate() - 7);
      break;
    }
    case 'month': {
      // Del 1 al día actual vs del 1 al mismo día del mes anterior
      currentFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      currentTo = new Date(now);
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Mismo día y hora pero un mes antes (clamp si el mes anterior tiene menos días)
      const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const daysInPrevMonth = new Date(prevMonthYear, prevMonth + 1, 0).getDate();
      const prevDay = Math.min(now.getDate(), daysInPrevMonth);
      prevTo = new Date(prevMonthYear, prevMonth, prevDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      break;
    }
    case 'year': {
      // Del 1/1 hasta hoy vs del 1/1 hasta el mismo día del año anterior
      currentFrom = new Date(now.getFullYear(), 0, 1);
      currentTo = new Date(now);
      prevFrom = new Date(now.getFullYear() - 1, 0, 1);
      prevTo = new Date(now); prevTo.setFullYear(now.getFullYear() - 1);
      break;
    }
    case 'months': {
      // Mes A completo (día 1 00:00 → último día 23:59) vs Mes B completo
      const a = monthA || { month: now.getMonth(), year: now.getFullYear() };
      const prevMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const b = monthB || { month: prevMonthIdx, year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() };
      currentFrom = new Date(a.year, a.month, 1, 0, 0, 0, 0);
      currentTo = new Date(a.year, a.month + 1, 0, 23, 59, 59, 999);
      prevFrom = new Date(b.year, b.month, 1, 0, 0, 0, 0);
      prevTo = new Date(b.year, b.month + 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'custom': {
      if (customFrom && customTo) {
        currentFrom = new Date(customFrom);
        currentTo = new Date(customTo);
        currentTo.setHours(23, 59, 59, 999);
        const diff = currentTo.getTime() - currentFrom.getTime();
        prevTo = new Date(currentFrom.getTime() - 1);
        prevFrom = new Date(prevTo.getTime() - diff);
        prevFrom.setHours(0, 0, 0, 0);
      } else {
        currentFrom = new Date(now); currentFrom.setHours(0, 0, 0, 0);
        prevTo = new Date(currentFrom); prevTo.setMilliseconds(-1);
        prevFrom = new Date(prevTo); prevFrom.setHours(0, 0, 0, 0);
      }
      break;
    }
    default: {
      currentFrom = new Date(now); currentFrom.setHours(0, 0, 0, 0);
      prevTo = new Date(currentFrom); prevTo.setMilliseconds(-1);
      prevFrom = new Date(prevTo); prevFrom.setHours(0, 0, 0, 0);
    }
  }

  return {
    current: { from: currentFrom!.toISOString(), to: currentTo!.toISOString() },
    previous: { from: prevFrom!.toISOString(), to: prevTo!.toISOString() },
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const isPositive = value > 0;
  const isNeutral = value === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${isNeutral ? 'text-muted-foreground' : isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
      {isNeutral ? <Minus className="h-3.5 w-3.5" /> : isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function getLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchPeriodData(establishmentId: string, from: string, to: string) {
  const fromDate = getLocalDateStr(new Date(from));
  const toDate = getLocalDateStr(new Date(to));

  const [ordersRes, itemsRes, financeRes] = await Promise.all([
    db.from('orders')
      .select('id, total, status, created_at, table_id, created_by')
      .eq('establishment_id', establishmentId)
      .eq('status', 'closed')
      .gte('created_at', from)
      .lte('created_at', to),
    db.from('order_items')
      .select('quantity, unit_price, product_id, products(name, category_id, categories(name)), orders!inner(establishment_id, status, created_at)')
      .eq('orders.establishment_id', establishmentId)
      .eq('orders.status', 'closed')
      .gte('orders.created_at', from)
      .lte('orders.created_at', to),
    db.from('finance_transactions')
      .select('*, finance_categories(name)')
      .eq('establishment_id', establishmentId)
      .gte('date', fromDate)
      .lte('date', toDate),
  ]);

  const orders = ordersRes.data || [];
  const items = (itemsRes.data || []) as any[];
  // Excluir propinas: son neutrales (ingreso + egreso espejo) y no afectan el rendimiento real del negocio
  const isTipCategory = (name?: string) => /^propinas$|^pago de propinas$/i.test(name || '');
  const financeTxs = ((financeRes.data || []) as any[]).filter(
    (t: any) => !isTipCategory(t.finance_categories?.name)
  );

  // Total sales from orders
  const orderSales = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalOrders = orders.length;

  // Total income from finance_transactions (includes manual income + order-generated income)
  const financeIncome = financeTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const financeExpenses = financeTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

  // Expenses by category
  const expenseByCategory: Record<string, number> = {};
  financeTxs.filter((t: any) => t.type === 'expense').forEach((t: any) => {
    const cat = t.finance_categories?.name || 'Sin categoría';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(t.amount);
  });

  // Use finance income as totalSales (it already includes order sales registered in caja)
  const totalSales = financeIncome > 0 ? financeIncome : orderSales;
  const avgTicket = totalOrders > 0 ? orderSales / totalOrders : 0;
  const uniqueTables = new Set(orders.map(o => o.table_id)).size;

  const catMap: Record<string, number> = {};
  items.forEach(item => {
    const cat = item.products?.categories?.name || 'Sin categoría';
    catMap[cat] = (catMap[cat] || 0) + item.quantity * Number(item.unit_price);
  });

  const productMap: Record<string, number> = {};
  items.forEach(item => {
    const name = item.products?.name || 'Desconocido';
    productMap[name] = (productMap[name] || 0) + item.quantity * Number(item.unit_price);
  });

  // Sales by day - use finance_transactions income for the daily overlay
  const startMs = new Date(from).getTime();
  const dayMap: Record<number, number> = {};
  
  // Add finance income by day
  financeTxs.filter((t: any) => t.type === 'income').forEach((t: any) => {
    const txDate = new Date(t.date + 'T12:00:00');
    const dayOffset = Math.floor((txDate.getTime() - startMs) / 86400000);
    if (dayOffset >= 0) {
      dayMap[dayOffset] = (dayMap[dayOffset] || 0) + Number(t.amount);
    }
  });

  // If no finance data, fall back to orders
  if (Object.keys(dayMap).length === 0) {
    orders.forEach(o => {
      const dayOffset = Math.floor((new Date(o.created_at).getTime() - startMs) / 86400000);
      dayMap[dayOffset] = (dayMap[dayOffset] || 0) + Number(o.total);
    });
  }

  const orderDayMap: Record<number, number> = {};
  orders.forEach(o => {
    const dayOffset = Math.floor((new Date(o.created_at).getTime() - startMs) / 86400000);
    orderDayMap[dayOffset] = (orderDayMap[dayOffset] || 0) + 1;
  });

  return { totalSales, totalOrders, avgTicket, uniqueTables, categoryRevenue: catMap, productMix: productMap, salesByDay: dayMap, ordersByDay: orderDayMap, totalExpenses: financeExpenses, expenseByCategory };
}

function MonthYearPicker({
  value, onChange, label, accent,
}: { value: MonthYear; onChange: (v: MonthYear) => void; label: string; accent: 'orange' | 'blue' }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2024 + 2 }, (_, i) => 2024 + i);
  const styles = accent === 'orange'
    ? {
        ring: 'ring-orange-500/40',
        border: 'border-orange-500/50',
        dot: 'bg-orange-500',
        label: 'text-orange-600 dark:text-orange-400',
        chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
        trigger: 'border-orange-500/40 hover:border-orange-500 data-[state=open]:border-orange-500 focus:ring-orange-500/40',
      }
    : {
        ring: 'ring-blue-500/40',
        border: 'border-blue-500/50',
        dot: 'bg-blue-500',
        label: 'text-blue-600 dark:text-blue-400',
        chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
        trigger: 'border-blue-500/40 hover:border-blue-500 data-[state=open]:border-blue-500 focus:ring-blue-500/40',
      };
  return (
    <div className={`flex items-center gap-2 rounded-lg border ${styles.border} ${styles.ring} ring-1 bg-card px-3 py-2 shadow-sm`}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: accent === 'orange' ? '#f97316' : '#3b82f6' }} />
      <span className={`text-xs font-bold uppercase tracking-wide whitespace-nowrap ${styles.label}`}>{label}</span>
      <div className="flex items-center gap-1.5">
        <Select value={String(value.month)} onValueChange={v => onChange({ ...value, month: Number(v) })}>
          <SelectTrigger className={`w-[7.5rem] h-8 bg-background ${styles.trigger}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(value.year)} onValueChange={v => onChange({ ...value, year: Number(v) })}>
          <SelectTrigger className={`w-[5.5rem] h-8 bg-background ${styles.trigger}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function AnalyticsComparison() {
  const { establishmentId } = useAuth();
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const nowD = new Date();
  const prevMonthIdx = nowD.getMonth() === 0 ? 11 : nowD.getMonth() - 1;
  const [monthA, setMonthA] = useState<MonthYear>({ month: nowD.getMonth(), year: nowD.getFullYear() });
  const [monthB, setMonthB] = useState<MonthYear>({ month: prevMonthIdx, year: nowD.getMonth() === 0 ? nowD.getFullYear() - 1 : nowD.getFullYear() });

  const ranges = useMemo(() => getComparisonRanges(period, customFrom, customTo, monthA, monthB), [period, customFrom, customTo, monthA, monthB]);

  const labelCurrent = period === 'months' ? monthLabel(monthA) : 'Actual';
  const labelPrevious = period === 'months' ? monthLabel(monthB) : 'Anterior';

  const { data } = useQuery({
    queryKey: ['analytics-comparison', establishmentId, ranges.current.from, ranges.current.to, ranges.previous.from, ranges.previous.to],
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        fetchPeriodData(establishmentId!, ranges.current.from, ranges.current.to),
        fetchPeriodData(establishmentId!, ranges.previous.from, ranges.previous.to),
      ]);
      return { current, previous };
    },
    enabled: !!establishmentId,
  });

  const score = useMemo(() => {
    if (!data) return null;
    const metrics = [
      pctChange(data.current.totalSales, data.previous.totalSales),
      pctChange(data.current.totalOrders, data.previous.totalOrders),
      pctChange(data.current.avgTicket, data.previous.avgTicket),
      pctChange(data.current.uniqueTables, data.previous.uniqueTables),
    ].filter(v => v !== null) as number[];
    if (metrics.length === 0) return null;
    return metrics.reduce((s, v) => s + v, 0) / metrics.length;
  }, [data]);

  const overlayChartData = useMemo(() => {
    if (!data) return [];
    const allDays = new Set([...Object.keys(data.current.salesByDay).map(Number), ...Object.keys(data.previous.salesByDay).map(Number)]);
    const maxDay = Math.max(...allDays, 0);
    const result = [];
    for (let i = 0; i <= maxDay; i++) {
      result.push({ day: `Día ${i + 1}`, actual: data.current.salesByDay[i] || 0, anterior: data.previous.salesByDay[i] || 0 });
    }
    return result;
  }, [data]);

  const overlayOrdersData = useMemo(() => {
    if (!data) return [];
    const allDays = new Set([...Object.keys(data.current.ordersByDay).map(Number), ...Object.keys(data.previous.ordersByDay).map(Number)]);
    const maxDay = Math.max(...allDays, 0);
    const result = [];
    for (let i = 0; i <= maxDay; i++) {
      result.push({ day: `Día ${i + 1}`, actual: data.current.ordersByDay[i] || 0, anterior: data.previous.ordersByDay[i] || 0 });
    }
    return result;
  }, [data]);

  const categoryComparisonData = useMemo(() => {
    if (!data) return [];
    const allCats = new Set([...Object.keys(data.current.categoryRevenue), ...Object.keys(data.previous.categoryRevenue)]);
    return Array.from(allCats).map(cat => {
      const actual = data.current.categoryRevenue[cat] || 0;
      const anterior = data.previous.categoryRevenue[cat] || 0;
      return {
        name: cat,
        actual: Math.round(actual * 100) / 100,
        anterior: Math.round(anterior * 100) / 100,
        diff: actual - anterior,
        pct: pctChange(actual, anterior),
      };
    }).sort((a, b) => b.actual - a.actual);
  }, [data]);

  const expenseCategoryComparison = useMemo(() => {
    if (!data) return [];
    const allCats = new Set([...Object.keys(data.current.expenseByCategory), ...Object.keys(data.previous.expenseByCategory)]);
    return Array.from(allCats).map(cat => {
      const actual = data.current.expenseByCategory[cat] || 0;
      const anterior = data.previous.expenseByCategory[cat] || 0;
      return {
        name: cat,
        actual: Math.round(actual * 100) / 100,
        anterior: Math.round(anterior * 100) / 100,
        diff: actual - anterior,
        pct: pctChange(actual, anterior),
      };
    }).sort((a, b) => b.actual - a.actual);
  }, [data]);

  const productMixData = useMemo(() => {
    if (!data) return [];
    const totalCurrent = Object.values(data.current.productMix).reduce((s, v) => s + v, 0) || 1;
    const totalPrev = Object.values(data.previous.productMix).reduce((s, v) => s + v, 0) || 1;
    const allProducts = new Set([...Object.keys(data.current.productMix), ...Object.keys(data.previous.productMix)]);
    return Array.from(allProducts).map(name => ({
      name,
      actualPct: ((data.current.productMix[name] || 0) / totalCurrent) * 100,
      anteriorPct: ((data.previous.productMix[name] || 0) / totalPrev) * 100,
      actualRev: data.current.productMix[name] || 0,
      anteriorRev: data.previous.productMix[name] || 0,
    })).sort((a, b) => b.actualRev - a.actualRev).slice(0, 10);
  }, [data]);

  const kpis = [
    { label: 'Ventas', icon: DollarSign, color: 'text-orange-500', borderColor: 'border-l-orange-500', current: data?.current.totalSales ?? 0, previous: data?.previous.totalSales ?? 0, format: (v: number) => `$${formatCompact(v)}` },
    { label: 'Pedidos', icon: ShoppingCart, color: 'text-blue-500', borderColor: 'border-l-blue-500', current: data?.current.totalOrders ?? 0, previous: data?.previous.totalOrders ?? 0, format: (v: number) => formatCompactInt(v) },
    { label: 'Ticket promedio', icon: CreditCard, color: 'text-violet-500', borderColor: 'border-l-violet-500', current: data?.current.avgTicket ?? 0, previous: data?.previous.avgTicket ?? 0, format: (v: number) => `$${formatCompact(v)}` },
    { label: 'Mesas atendidas', icon: Users, color: 'text-pink-500', borderColor: 'border-l-pink-500', current: data?.current.uniqueTables ?? 0, previous: data?.previous.uniqueTables ?? 0, format: (v: number) => formatCompactInt(v) },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium">{typeof p.value === 'number' && p.dataKey.includes('actual') ? `$${formatCompact(p.value)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-bold tracking-tight">Comparación entre períodos</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {period === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-40" />
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-40" />
          </div>
        )}
        {period === 'months' && (
          <div className="flex flex-wrap items-center gap-2">
            <MonthYearPicker value={monthA} onChange={setMonthA} label="Mes A" accent="orange" />
            <span className="flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-orange-500 to-blue-500 text-white text-xs font-bold shadow-sm">
              VS
            </span>
            <MonthYearPicker value={monthB} onChange={setMonthB} label="Mes B" accent="blue" />
          </div>
        )}
      </div>

      {/* General Score */}
      {score !== null && (
        <Card className={`border-2 ${score >= 0 ? 'border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-red-500/30 bg-red-50/30 dark:bg-red-950/10'}`}>
          <CardContent className="py-5 flex items-center gap-4">
            <div className={`p-3 rounded-full ${score >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <Gauge className={`h-8 w-8 ${score >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Rendimiento general vs período anterior</p>
              <p className={`text-3xl font-bold ${score >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {score >= 0 ? '+' : ''}{score.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Promedio ponderado de ventas, pedidos, ticket promedio y mesas atendidas
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map(kpi => {
          const change = pctChange(kpi.current, kpi.previous);
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className={`border-l-4 ${kpi.borderColor}`}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold text-orange-500">{kpi.format(kpi.current)}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-500 font-medium">{labelPrevious}: {kpi.format(kpi.previous)}</span>
                  <ChangeIndicator value={change} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Overlay line charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExpandableChartCard
          title="Evolución de ventas"
          subtitle={`Línea continua: ${labelCurrent} · Línea punteada: ${labelPrevious}`}
          normalHeight={250}
        >
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <LineChart data={overlayChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="actual" name={labelCurrent} stroke="#f97316" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="anterior" name={labelPrevious} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3" dot={false} opacity={0.7} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ExpandableChartCard>

        <ExpandableChartCard
          title="Evolución de pedidos"
          subtitle={`Línea continua: ${labelCurrent} · Línea punteada: ${labelPrevious}`}
          normalHeight={250}
        >
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <LineChart data={overlayOrdersData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" name={labelCurrent} stroke="#f97316" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="anterior" name={labelPrevious} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3" dot={false} opacity={0.7} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ExpandableChartCard>
      </div>

      {/* Income by category comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingresos por categoría — Comparativa</CardTitle>
          <p className="text-xs text-muted-foreground">Variación de cada categoría del menú entre el período actual y el anterior</p>
        </CardHeader>
        <CardContent>
          {categoryComparisonData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-2 px-2 font-medium">Categoría</th>
                    <th className="text-right py-2 px-2 font-semibold text-orange-500">{labelCurrent}</th>
                    <th className="text-right py-2 px-2 font-semibold text-blue-500">{labelPrevious}</th>
                    <th className="text-right py-2 px-2 font-medium">Diferencia</th>
                    <th className="text-right py-2 px-2 font-medium">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryComparisonData.map((row: any) => (
                    <tr key={row.name} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 px-2 font-medium">{row.name}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-orange-600 dark:text-orange-400">${row.actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-blue-600 dark:text-blue-400">${row.anterior.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={`py-2 px-2 text-right tabular-nums font-semibold ${row.diff > 0 ? 'text-emerald-600' : row.diff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {row.diff > 0 ? '+' : ''}${row.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-2 text-right"><ChangeIndicator value={row.pct} /></td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold bg-muted/30">
                    <td className="py-2 px-2">Total</td>
                    <td className="py-2 px-2 text-right tabular-nums text-orange-600 dark:text-orange-400">
                      ${categoryComparisonData.reduce((s: number, r: any) => s + r.actual, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-blue-600 dark:text-blue-400">
                      ${categoryComparisonData.reduce((s: number, r: any) => s + r.anterior, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td colSpan={2} className="py-2 px-2 text-right">
                      {(() => {
                        const totA = categoryComparisonData.reduce((s: number, r: any) => s + r.actual, 0);
                        const totP = categoryComparisonData.reduce((s: number, r: any) => s + r.anterior, 0);
                        return <ChangeIndicator value={pctChange(totA, totP)} />;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos de categorías</p>
          )}
        </CardContent>
      </Card>

      {/* Expense by category comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gastos por categoría — Comparativa</CardTitle>
          <p className="text-xs text-muted-foreground">Variación de cada categoría de salida entre el período actual y el anterior</p>
        </CardHeader>
        <CardContent>
          {expenseCategoryComparison.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-2 px-2 font-medium">Categoría</th>
                    <th className="text-right py-2 px-2 font-semibold text-orange-500">{labelCurrent}</th>
                    <th className="text-right py-2 px-2 font-semibold text-blue-500">{labelPrevious}</th>
                    <th className="text-right py-2 px-2 font-medium">Diferencia</th>
                    <th className="text-right py-2 px-2 font-medium">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseCategoryComparison.map(row => (
                    <tr key={row.name} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 px-2 font-medium">{row.name}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-orange-600 dark:text-orange-400">${row.actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-blue-600 dark:text-blue-400">${row.anterior.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={`py-2 px-2 text-right tabular-nums font-semibold ${row.diff > 0 ? 'text-red-500' : row.diff < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {row.diff > 0 ? '+' : ''}${row.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-2 text-right"><ChangeIndicator value={row.pct} /></td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold bg-muted/30">
                    <td className="py-2 px-2">Total</td>
                    <td className="py-2 px-2 text-right tabular-nums text-orange-600 dark:text-orange-400">
                      ${expenseCategoryComparison.reduce((s, r) => s + r.actual, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-blue-600 dark:text-blue-400">
                      ${expenseCategoryComparison.reduce((s, r) => s + r.anterior, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td colSpan={2} className="py-2 px-2 text-right">
                      {(() => {
                        const totA = expenseCategoryComparison.reduce((s, r) => s + r.actual, 0);
                        const totP = expenseCategoryComparison.reduce((s, r) => s + r.anterior, 0);
                        return <ChangeIndicator value={pctChange(totA, totP)} />;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No hay gastos registrados en estos períodos</p>
          )}
        </CardContent>
      </Card>

      {/* Product mix comparison */}
      <ExpandableChartCard
        title="Mix de ventas por producto (Top 10)"
        subtitle="Porcentaje de participación en ventas totales"
        normalHeight={400}
        expandedHeight={600}
      >
        {() => productMixData.length > 0 ? (
          <div className="space-y-3">
            {productMixData.map(p => {
              const change = pctChange(p.actualPct, p.anteriorPct);
              return (
                <div key={p.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[200px]">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">${p.actualRev.toFixed(0)}</span>
                      <ChangeIndicator value={change} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full bg-orange-500 transition-all" style={{ width: `${Math.min(p.actualPct, 100)}%` }} />
                      </div>
                      <div className="w-full mt-0.5">
                        <div className="h-1.5 rounded-full bg-blue-400/60 transition-all" style={{ width: `${Math.min(p.anteriorPct, 100)}%` }} />
                      </div>
                    </div>
                    <div className="text-xs w-20 text-right">
                      <span className="font-semibold text-orange-500">{p.actualPct.toFixed(1)}%</span>
                      <span className="text-blue-500"> / {p.anteriorPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
        )}
      </ExpandableChartCard>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import PriceSensitivityCard from '@/components/admin/PriceSensitivityCard';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toArgDate, argDayRange, argHour, argDayOfWeek } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, ShoppingCart, Clock, Users, CreditCard, Banknote, ArrowRightLeft, BarChart3, GitCompareArrows, CalendarIcon, X, Download, FileText, FileSpreadsheet, Wallet, Bike, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import AnalyticsComparison from '@/components/admin/AnalyticsComparison';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportAnalyticsPDF, exportAnalyticsExcel } from '@/lib/exportAnalytics';
import ExpandableChartCard from '@/components/admin/ExpandableChartCard';
import ProfitMarginTab from '@/components/admin/ProfitMarginTab';
import SalesChannelsTab from '@/components/admin/SalesChannelsTab';
import { useDeliverySettings } from '@/hooks/useDeliverySettings';
import ProductMatrixTab from '@/components/admin/ProductMatrixTab';

function getLocalDateStr(d: Date) {
  return toArgDate(d);
}

const DRINK_CATEGORY_RE = /bebida|trago|vino|cerveza|gaseosa|jugo|cafeteria|cafe|licor|barra|sin alcohol|aperitivo|coctel/;

export function isDrinkCategory(name?: string | null) {
  const n = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return DRINK_CATEGORY_RE.test(n);
}


function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const PIE_COLORS = ['#22c55e', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6'];
const CATEGORY_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#eab308', '#06b6d4', '#ef4444'];

const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** "8 de octubre 2026", "1 al 8 de octubre 2026" o "28 sep 2026 al 5 oct 2026". */
function rangeLabel(from: Date, to: Date): string {
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (a.toDateString() === b.toDateString()) return format(a, "d 'de' MMMM yyyy", { locale: es });
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${format(a, 'd')} al ${format(b, "d 'de' MMMM yyyy", { locale: es })}`;
  }
  return `${format(a, 'd MMM yyyy', { locale: es })} al ${format(b, 'd MMM yyyy', { locale: es })}`;
}

export default function AdminAnalytics() {
  const { establishmentId } = useAuth();
  const [waiterPeriod, setWaiterPeriod] = useState('day');
  const [selectedHelpCategory, setSelectedHelpCategory] = useState<string | null>(null);
  const [categoryRankOrder, setCategoryRankOrder] = useState<'top' | 'bottom'>('top');
  const [waitersShowAll, setWaitersShowAll] = useState(false);
  // Rango personalizado (un día = desde y hasta iguales). Sin rango, se usa el mes elegido.
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>(undefined);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(undefined);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // Mes/año seleccionado (por defecto, mes en curso en horario argentino)
  const currentMonth = useMemo(() => {
    const [y, m] = toArgDate().split('-').map(Number);
    return { year: y, month: m }; // month: 1-12
  }, []);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>(currentMonth);
  const [pickerYear, setPickerYear] = useState(currentMonth.year);

  const { enabled: deliveryEnabled } = useDeliverySettings();

  const range = useMemo(() => {
    if (customRange) {
      const today = toArgDate();
      const fromDate = getLocalDateStr(customRange.from);
      const rawTo = getLocalDateStr(customRange.to);
      const toDate = rawTo > today ? today : rawTo;
      const { from: fromISO } = argDayRange(fromDate);
      const { to: toISO } = argDayRange(toDate);
      return { fromDate, toDate, fromISO, toISO };
    }
    const mm = String(selectedMonth.month).padStart(2, '0');
    const fromDate = `${selectedMonth.year}-${mm}-01`;
    // Si es el mes en curso, hasta hoy; si es un mes anterior, hasta su último día
    const isCurrent = selectedMonth.year === currentMonth.year && selectedMonth.month === currentMonth.month;
    const lastDay = new Date(selectedMonth.year, selectedMonth.month, 0).getDate();
    const toDate = isCurrent ? toArgDate() : `${selectedMonth.year}-${mm}-${String(lastDay).padStart(2, '0')}`;
    const { from: fromISO } = argDayRange(fromDate);
    const { to: toISO } = argDayRange(toDate);
    return { fromDate, toDate, fromISO, toISO };
  }, [customRange, selectedMonth, currentMonth]);

  // ─── Finance data (income + expenses) ───
  const { data: financeData } = useQuery({
    queryKey: ['analytics-finance', establishmentId, range.fromDate, range.toDate],
    queryFn: async () => {
      const { data: txs, error } = await db
        .from('finance_transactions')
        .select('*, finance_categories(name)')
        .eq('establishment_id', establishmentId!)
        .gte('date', range.fromDate)
        .lte('date', range.toDate);
      if (error) throw error;

      const { data: closedOrders } = await db
        .from('orders')
        .select('id, total, payment_method, created_at')
        .eq('establishment_id', establishmentId!)
        .eq('status', 'closed')
        .gte('created_at', range.fromISO)
        .lte('created_at', range.toISO);

      const incomeMap: Record<string, number> = {};
      const expenseMap: Record<string, number> = {};
      const expCatMap: Record<string, number> = {};

      // Excluir propinas: son neutrales (ingreso + egreso espejo) y no deben afectar analíticas
      const isTipCategory = (name?: string) => /^propinas$|^pago de propinas$/i.test(name || '');

      (txs || []).forEach((t: any) => {
        const catName = t.finance_categories?.name || 'Otros';
        if (isTipCategory(catName)) return;
        if (t.type === 'income') {
          incomeMap[t.date] = (incomeMap[t.date] || 0) + Number(t.amount);
        } else {
          expenseMap[t.date] = (expenseMap[t.date] || 0) + Number(t.amount);
          expCatMap[catName] = (expCatMap[catName] || 0) + Number(t.amount);
        }
      });

      (closedOrders || []).forEach((o: any) => {
        const dateStr = getLocalDateStr(new Date(o.created_at));
        incomeMap[dateStr] = (incomeMap[dateStr] || 0) + Number(o.total);
      });

      const allDates = new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)]);
      const incomeByDay = Array.from(allDates).sort().map(d => ({
        date: new Date(d + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short' }),
        ingresos: Math.round((incomeMap[d] || 0) * 100) / 100,
      }));
      const expensesByDay = Array.from(allDates).sort().map(d => ({
        date: new Date(d + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short' }),
        gastos: Math.round((expenseMap[d] || 0) * 100) / 100,
      }));
      const expensesByCategory = Object.entries(expCatMap)
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount);

      const totalIncome = Object.values(incomeMap).reduce((s, v) => s + v, 0);
      const totalExpenses = Object.values(expenseMap).reduce((s, v) => s + v, 0);

      return { incomeByDay, expensesByDay, expensesByCategory, totalIncome, totalExpenses };
    },
    enabled: !!establishmentId,
    staleTime: 60_000,
  });

  // ─── Orders data ───
  const { data: ordersData } = useQuery({
    queryKey: ['analytics-orders', establishmentId, range.fromDate, range.toDate],
    queryFn: async () => {
      const [ordersRes, itemsRes] = await Promise.all([
        db.from('orders')
          .select('id, total, status, created_at, prepared_at, delivered_at, payment_method, table_id, created_by')
          .eq('establishment_id', establishmentId!)
          .eq('status', 'closed')
          .gte('created_at', range.fromISO)
          .lte('created_at', range.toISO),
        db.from('order_items')
          .select('quantity, unit_price, product_id, products(name, price, categories(name)), orders!inner(establishment_id, status, created_at)')
          .eq('orders.establishment_id', establishmentId!)
          .eq('orders.status', 'closed')
          .gte('orders.created_at', range.fromISO)
          .lte('orders.created_at', range.toISO),
      ]);

      const orders = ordersRes.data || [];
      const items = (itemsRes.data || []) as any[];

      const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
      const totalOrders = orders.length;
      const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

      const prepTimes = orders.filter(o => o.prepared_at).map(o => (new Date(o.prepared_at!).getTime() - new Date(o.created_at).getTime()) / 60000);
      const avgPrepTime = prepTimes.length > 0 ? prepTimes.reduce((s, t) => s + t, 0) / prepTimes.length : 0;

      const salesMap: Record<string, number> = {};
      const ordersMap: Record<string, number> = {};
      orders.forEach(o => {
        const d = getLocalDateStr(new Date(o.created_at));
        salesMap[d] = (salesMap[d] || 0) + Number(o.total);
        ordersMap[d] = (ordersMap[d] || 0) + 1;
      });
      const allDates = new Set([...Object.keys(salesMap), ...Object.keys(ordersMap)]);
      const salesByDay = Array.from(allDates).sort().map(d => ({
        date: new Date(d + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short' }),
        ventas: Math.round((salesMap[d] || 0) * 100) / 100,
        pedidos: ordersMap[d] || 0,
      }));

      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      const dishMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      const drinkMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      items.forEach(item => {
        const name = item.products?.name || 'Desconocido';
        const target = isDrinkCategory(item.products?.categories?.name) ? drinkMap : dishMap;
        [productMap, target].forEach(map => {
          if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
          map[name].qty += item.quantity;
          map[name].revenue += item.quantity * Number(item.unit_price);
        });
      });
      const byQty = (a: { qty: number }, b: { qty: number }) => b.qty - a.qty;
      const productRanking = Object.values(productMap).sort(byQty);
      const dishRanking = Object.values(dishMap).sort(byQty);
      const drinkRanking = Object.values(drinkMap).sort(byQty);


      const catMap: Record<string, number> = {};
      items.forEach(item => {
        const cat = item.products?.categories?.name || 'Sin categoría';
        catMap[cat] = (catMap[cat] || 0) + item.quantity * Number(item.unit_price);
      });
      const categoryRevenue = Object.entries(catMap).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);

      const catProdMap: Record<string, Record<string, { name: string; qty: number; revenue: number }>> = {};
      items.forEach(item => {
        const cat = item.products?.categories?.name || 'Sin categoría';
        const name = item.products?.name || 'Desconocido';
        if (!catProdMap[cat]) catProdMap[cat] = {};
        if (!catProdMap[cat][name]) catProdMap[cat][name] = { name, qty: 0, revenue: 0 };
        catProdMap[cat][name].qty += item.quantity;
        catProdMap[cat][name].revenue += item.quantity * Number(item.unit_price);
      });
      const categoryProductRanking = Object.entries(catProdMap).map(([category, prods]) => {
        const products = Object.values(prods).sort(byQty);
        return { category, totalQty: products.reduce((s, p) => s + p.qty, 0), products };
      }).sort((a, b) => b.totalQty - a.totalQty);

      const paymentMap: Record<string, number> = {};
      orders.forEach(o => {
        const pm = (o.payment_method || '').toLowerCase();
        let label = 'Otro';
        if (pm.includes('efectivo') || pm.includes('cash')) label = 'Efectivo';
        else if (pm.includes('tarjeta') || pm.includes('card')) label = 'Tarjeta';
        else if (pm.includes('transferencia') || pm.includes('transfer')) label = 'Transferencia';
        paymentMap[label] = (paymentMap[label] || 0) + Number(o.total);
      });
      const paymentBreakdown = Object.entries(paymentMap)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => b.value - a.value);

      const waiterMap: Record<string, { id: string; tables: Record<string, number> }> = {};
      orders.forEach(o => {
        if (!o.created_by) return;
        if (!waiterMap[o.created_by]) waiterMap[o.created_by] = { id: o.created_by, tables: {} };
        const dayKey = toArgDate(o.created_at);
        const d = new Date(o.created_at);
        const weekKey = `S${getWeekNumber(d)}`;
        const monthParts = dayKey.split('-');
        const monthKey = `${monthParts[0]}-${monthParts[1]}`;
        const hourKey = `${dayKey} ${argHour(o.created_at)}:00`;
        [dayKey, weekKey, monthKey, hourKey].forEach(key => {
          if (!waiterMap[o.created_by!].tables[key]) waiterMap[o.created_by!].tables[key] = 0;
          waiterMap[o.created_by!].tables[key] += 1;
        });
      });
      const waiterIds = Object.keys(waiterMap);
      let waiterNames: Record<string, string> = {};
      if (waiterIds.length > 0) {
        const { data: profiles } = await db.from('profiles').select('id, full_name').in('id', waiterIds);
        (profiles || []).forEach(p => { waiterNames[p.id] = p.full_name || p.id.slice(0, 8); });
      }
      const waiterPerformance = Object.values(waiterMap).map(w => ({
        id: w.id,
        name: waiterNames[w.id] || w.id.slice(0, 8),
        tables: Object.fromEntries(Object.entries(w.tables)),
      }));

      const heatmapMap: Record<string, number> = {};
      orders.forEach(o => {
        const dow = argDayOfWeek(o.created_at);
        const h = argHour(o.created_at);
        heatmapMap[`${dow}-${h}`] = (heatmapMap[`${dow}-${h}`] || 0) + 1;
      });
      const heatmap = DAYS.flatMap((dayName, dayIdx) =>
        HOURS.map(h => ({ day: dayName, hour: h, count: heatmapMap[`${dayIdx}-${h}`] || 0 }))
      );

      const uniqueTables = new Set(orders.map(o => o.table_id)).size;

      return {
        totalSales, totalOrders, avgTicket, avgPrepTime,
        productRanking, dishRanking, drinkRanking, categoryRevenue, categoryProductRanking, salesByDay, paymentBreakdown,
        waiterPerformance, heatmap, uniqueTables,
      };
    },
    enabled: !!establishmentId,
    staleTime: 60_000,
  });

  const maxHeat = ordersData?.heatmap ? Math.max(...ordersData.heatmap.map(h => h.count), 1) : 1;

  const waiterTableData = useMemo(() => {
    if (!ordersData?.waiterPerformance) return [];
    return ordersData.waiterPerformance.map(w => {
      const entries = Object.entries(w.tables).filter(([key]) => {
        if (waiterPeriod === 'hour') return key.includes(':');
        if (waiterPeriod === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(key);
        if (waiterPeriod === 'week') return key.startsWith('S');
        if (waiterPeriod === 'month') return /^\d{4}-\d{2}$/.test(key);
        return false;
      }).sort(([a], [b]) => a.localeCompare(b));
      const totalTables = entries.reduce((s, [, v]) => s + v, 0);
      const avg = entries.length > 0 ? totalTables / entries.length : 0;
      return { name: w.name, entries, totalTables, avg };
    });
  }, [ordersData?.waiterPerformance, waiterPeriod]);

  const CustomTooltipSales = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-background p-3 shadow-lg">
        <p className="text-sm font-semibold mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium">
              {['ventas', 'ingresos'].includes(p.dataKey) ? `$${p.value.toLocaleString()}` : p.value}
            </span>
          </p>
        ))}
      </div>
    );
  };

  const periodLabel = customRange
    ? rangeLabel(customRange.from, customRange.to)
    : format(new Date(selectedMonth.year, selectedMonth.month - 1, 1), "MMMM yyyy", { locale: es }).replace(/^./, c => c.toUpperCase());

  const applyRange = (from: Date, to: Date) => {
    setCustomRange(from <= to ? { from, to } : { from: to, to: from });
    setMonthPickerOpen(false);
  };
  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const QUICK_RANGES: { label: string; from: () => Date; to: () => Date }[] = [
    { label: 'Hoy', from: () => today, to: () => today },
    { label: 'Ayer', from: () => daysAgo(1), to: () => daysAgo(1) },
    { label: 'Últimos 7 días', from: () => daysAgo(6), to: () => today },
    { label: 'Últimos 15 días', from: () => daysAgo(14), to: () => today },
    { label: 'Últimos 30 días', from: () => daysAgo(29), to: () => today },
  ];

  const handleExport = (type: 'pdf' | 'excel') => {
    const exportData = {
      period: periodLabel,
      kpis: [
        { label: 'Ventas totales', value: `$${formatCompact(ordersData?.totalSales ?? 0)}` },
        { label: 'Pedidos', value: String(ordersData?.totalOrders ?? 0) },
        { label: 'Ticket promedio', value: `$${formatCompact(ordersData?.avgTicket ?? 0)}` },
        { label: 'Tiempo prep. promedio', value: `${(ordersData?.avgPrepTime ?? 0).toFixed(0)} min` },
        { label: 'Mesas atendidas', value: String(ordersData?.uniqueTables ?? 0) },
        { label: 'Ingresos totales', value: `$${formatCompact(financeData?.totalIncome ?? 0)}` },
        { label: 'Gastos totales', value: `$${formatCompact(financeData?.totalExpenses ?? 0)}` },
      ],
      salesByDay: ordersData?.salesByDay || [],
      productRanking: ordersData?.dishRanking || [],
      drinkRanking: ordersData?.drinkRanking || [],
      categoryRevenue: ordersData?.categoryRevenue || [],
      paymentBreakdown: ordersData?.paymentBreakdown || [],
      incomeByDay: financeData?.incomeByDay,
      expensesByDay: financeData?.expensesByDay,
      expensesByCategory: financeData?.expensesByCategory,
    };
    if (type === 'pdf') exportAnalyticsPDF(exportData);
    else exportAnalyticsExcel(exportData);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Analíticas</h1>
      <Tabs defaultValue="explore" className="space-y-6">
        <TabsList>
          <TabsTrigger value="explore" className="gap-1.5"><BarChart3 className="h-4 w-4" />Explorar</TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5"><GitCompareArrows className="h-4 w-4" />Comparar períodos</TabsTrigger>
          <TabsTrigger value="profitability" className="gap-1.5"><Wallet className="h-4 w-4" />Rentabilidad</TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5"><ShoppingCart className="h-4 w-4" />Productos</TabsTrigger>
          {deliveryEnabled && <TabsTrigger value="channels" className="gap-1.5"><Bike className="h-4 w-4" />Canales</TabsTrigger>}
        </TabsList>
        <TabsContent value="explore" className="space-y-6">

      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Popover open={monthPickerOpen} onOpenChange={(open) => { setMonthPickerOpen(open); if (open) { setPickerYear(selectedMonth.year); setDraftRange(customRange); } }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="min-w-[220px] justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {periodLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-3 pointer-events-auto" align="start">
            {/* Atajos */}
            <div className="mb-3 flex flex-wrap gap-1.5 border-b pb-3">
              {QUICK_RANGES.map(q => (
                <Button key={q.label} variant="outline" size="sm" className="text-xs" onClick={() => applyRange(q.from(), q.to())}>
                  {q.label}
                </Button>
              ))}
            </div>
            {/* Selector de mes/año */}
            <div className="flex items-center justify-between mb-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold">{pickerYear}</span>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                disabled={pickerYear >= currentMonth.year}
                onClick={() => setPickerYear(y => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTH_NAMES_SHORT.map((name, idx) => {
                const m = idx + 1;
                const isFuture = pickerYear === currentMonth.year && m > currentMonth.month;
                const isActive = !customRange && pickerYear === selectedMonth.year && m === selectedMonth.month;
                return (
                  <Button
                    key={name}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    disabled={isFuture}
                    className="text-xs"
                    onClick={() => {
                      setSelectedMonth({ year: pickerYear, month: m });
                      setCustomRange(undefined);
                      setMonthPickerOpen(false);
                    }}
                  >
                    {name}
                  </Button>
                );
              })}
            </div>
            {/* Rango de días (o un solo día) */}
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">O elegí los días: tocá el primero y el último (un solo día: tocalo y aplicá).</p>
              <Calendar
                mode="range"
                numberOfMonths={2}
                defaultMonth={draftRange?.from ?? daysAgo(30)}
                selected={draftRange}
                onSelect={setDraftRange}
                disabled={(date) => date > new Date()}
                locale={es}
                className={cn("p-0 pointer-events-auto")}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {draftRange?.from ? rangeLabel(draftRange.from, draftRange.to ?? draftRange.from) : 'Ningún día elegido'}
                </span>
                <Button size="sm" disabled={!draftRange?.from} onClick={() => draftRange?.from && applyRange(draftRange.from, draftRange.to ?? draftRange.from)}>
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {(customRange || selectedMonth.year !== currentMonth.year || selectedMonth.month !== currentMonth.month) && (
          <Button variant="ghost" size="sm" onClick={() => { setCustomRange(undefined); setSelectedMonth(currentMonth); }} className="gap-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Limpiar filtro
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 ml-auto">
              <Download className="h-4 w-4" /> Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('pdf')} className="gap-2">
              <FileText className="h-4 w-4 text-red-500" /> Descargar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('excel')} className="gap-2">
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Descargar Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-orange-500" />Ventas</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">${formatCompact(ordersData?.totalSales ?? 0)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5 text-blue-500" />Pedidos</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{ordersData?.totalOrders ?? 0}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-violet-500" />Ticket promedio</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">${formatCompact(ordersData?.avgTicket ?? 0)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-emerald-500" />Tiempo prep.</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{(ordersData?.avgPrepTime ?? 0).toFixed(0)} min</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-pink-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-pink-500" />Mesas atendidas</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{ordersData?.uniqueTables ?? 0}</div></CardContent>
        </Card>
      </div>

      {/* Fila de 4: Pedidos e Ingresos por día + Gastos por día y categoría */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExpandableChartCard title={<><div className="w-3 h-3 rounded-full bg-blue-500" />Pedidos por día</>}>
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <BarChart data={ordersData?.salesByDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltipSales />} />
                <Bar dataKey="pedidos" name="Pedidos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ExpandableChartCard>

        <ExpandableChartCard title={<><TrendingUp className="h-4 w-4 text-emerald-500" />Ingresos por día</>}>
          {(h) => financeData?.incomeByDay && financeData.incomeByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={h}>
              <AreaChart data={financeData.incomeByDay}>
                <defs>
                  <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Ingresos']} />
                <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#22c55e" strokeWidth={2.5} fill="url(#gradIngresos)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin ingresos registrados en este período</p>
          )}
        </ExpandableChartCard>

        <ExpandableChartCard title={<><TrendingDown className="h-4 w-4 text-red-500" />Gastos por día</>} normalHeight={250}>
          {(h) => financeData?.expensesByDay && financeData.expensesByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={h}>
              <BarChart data={financeData.expensesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Gastos']} />
                <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin gastos registrados en este período</p>
          )}
        </ExpandableChartCard>

        <ExpandableChartCard
          title={<><DollarSign className="h-4 w-4 text-red-500" />Gastos por categoría</>}
          normalHeight={250}
        >
          {(h) => financeData?.expensesByCategory && financeData.expensesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={h}>
              <BarChart data={financeData.expensesByCategory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <YAxis type="category" dataKey="name" fontSize={11} width={120} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Gasto']} />
                <Bar dataKey="amount" name="Gasto" radius={[0, 4, 4, 0]}>
                  {financeData.expensesByCategory.map((_: any, i: number) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin gastos registrados</p>
          )}
        </ExpandableChartCard>
      </div>

      {/* Métodos de pago + Ingresos por categoría */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExpandableChartCard title={<><Banknote className="h-4 w-4 text-emerald-500" />Métodos de pago</>} normalHeight={250}>
          {(h) => ordersData?.paymentBreakdown && ordersData.paymentBreakdown.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={h}>
                <PieChart>
                  <Pie data={ordersData.paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={h > 300 ? 70 : 45} outerRadius={h > 300 ? 120 : 80} paddingAngle={3} strokeWidth={0}>
                    {ordersData.paymentBreakdown.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {ordersData.paymentBreakdown.map((p, i) => {
                  const total = ordersData.paymentBreakdown.reduce((s, pp) => s + pp.value, 0);
                  const pct = total > 0 ? ((p.value / total) * 100).toFixed(0) : '0';
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {p.name}
                        </span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                      <p className="text-xs text-muted-foreground">${p.value.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos de pago</p>
          )}
        </ExpandableChartCard>

        <ExpandableChartCard title={<><ArrowRightLeft className="h-4 w-4 text-violet-500" />Ingresos por categoría</>} normalHeight={250}>
          {(h) => ordersData?.categoryRevenue && ordersData.categoryRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={h}>
              <BarChart data={ordersData.categoryRevenue.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <YAxis type="category" dataKey="name" fontSize={11} width={100} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Bar dataKey="revenue" name="Ingreso" radius={[0, 4, 4, 0]}>
                  {ordersData.categoryRevenue.slice(0, 8).map((_, i) => (<Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          )}
        </ExpandableChartCard>
      </div>

      {/* Top 10 platos + Top 10 bebidas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExpandableChartCard
          title={<><TrendingUp className="h-4 w-4 text-emerald-500" />Top 10 platos más pedidos</>}
          subtitle="Toda la cocina: platos, guarniciones y postres"
          normalHeight={300}
          expandedHeight={600}
        >
          {() => {
            const ranking = ordersData?.dishRanking || [];
            if (ranking.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>;
            return (
              <div className="space-y-1.5">
                {ranking.slice(0, 10).map((p, i) => {
                  const maxQty = ranking[0]?.qty || 1;
                  const pct = (p.qty / maxQty) * 100;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                          <span className="font-medium truncate max-w-[160px]">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold">{p.qty} uds</span>
                          <span className="text-muted-foreground">${p.revenue.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </ExpandableChartCard>

        <ExpandableChartCard
          title={<><TrendingUp className="h-4 w-4 text-sky-500" />Top 10 bebidas más pedidas</>}
          subtitle="Barra y bebidas, aparte de la cocina"
          normalHeight={300}
          expandedHeight={600}
        >
          {() => {
            const ranking = ordersData?.drinkRanking || [];
            if (ranking.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>;
            return (
              <div className="space-y-1.5">
                {ranking.slice(0, 10).map((p, i) => {
                  const maxQty = ranking[0]?.qty || 1;
                  const pct = (p.qty / maxQty) * 100;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                          <span className="font-medium truncate max-w-[160px]">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold">{p.qty} uds</span>
                          <span className="text-muted-foreground">${p.revenue.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </ExpandableChartCard>
      </div>

      {/* Menos pedidos — full width, 2 columns */}
      <ExpandableChartCard
        title={<><TrendingDown className="h-4 w-4 text-red-500" />Top 10 platos menos pedidos</>}
        subtitle="Toda la cocina: platos, guarniciones y postres"
        normalHeight={200}
        expandedHeight={400}
      >
        {() => {
          const ranking = ordersData?.dishRanking || [];
          if (ranking.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>;
          return (
            <div className="grid gap-x-8 gap-y-1.5 md:grid-cols-2">
              {ranking.slice(-10).reverse().map((p) => {
                const maxQty = ranking[0]?.qty || 1;
                const pct = Math.max((p.qty / maxQty) * 100, 3);
                return (
                  <div key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[200px]">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.qty} uds</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }}
      </ExpandableChartCard>

      {/* Más pedidos por categoría */}
      <ExpandableChartCard
        title={<><BarChart3 className="h-4 w-4 text-orange-500" />Más pedidos por categoría</>}
        subtitle="Elegí una categoría de la carta para ver qué se pide más (o menos) dentro de ella"
        normalHeight={340}
        expandedHeight={640}
      >
        {() => {
          const cats = ordersData?.categoryProductRanking || [];
          if (cats.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>;
          const active = cats.find(c => c.category === selectedHelpCategory) || cats[0];
          const list = categoryRankOrder === 'top'
            ? active.products.slice(0, 10)
            : active.products.slice(-10).reverse();
          const maxQty = active.products[0]?.qty || 1;
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <Button
                    key={c.category}
                    size="sm"
                    variant={c.category === active.category ? 'default' : 'outline'}
                    className="h-8"
                    onClick={() => setSelectedHelpCategory(c.category)}
                  >
                    {c.category}
                    <span className="ml-1.5 text-[10px] opacity-70">{c.totalQty}</span>
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{active.products.length} productos con ventas</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCategoryRankOrder(o => o === 'top' ? 'bottom' : 'top')}>
                  {categoryRankOrder === 'top'
                    ? <><TrendingUp className="h-3.5 w-3.5 mr-1 text-emerald-500" />Más pedidos</>
                    : <><TrendingDown className="h-3.5 w-3.5 mr-1 text-red-500" />Menos pedidos</>}
                </Button>
              </div>
              <div className="space-y-1.5">
                {list.map((p, i) => {
                  const pct = Math.max((p.qty / maxQty) * 100, 3);
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5 text-right">{categoryRankOrder === 'top' ? i + 1 : ''}</span>
                          <span className="font-medium truncate max-w-[200px]">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold">{p.qty} uds</span>
                          <span className="text-muted-foreground">${p.revenue.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={cn('h-1.5 rounded-full transition-all', categoryRankOrder === 'top' ? 'bg-orange-500' : 'bg-red-400')} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }}
      </ExpandableChartCard>




      {/* Heatmap */}
      <ExpandableChartCard
        title="Mapa de calor — Demanda por día y hora"
        subtitle="Intensidad del color = volumen de pedidos. Identificá las horas pico."
        normalHeight={280}
        expandedHeight={400}
      >
        {() => (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex gap-px mb-1">
                <div className="w-12" />
                {HOURS.filter(h => h >= 8 && h <= 23).map(h => (
                  <div key={h} className="flex-1 text-[10px] text-center text-muted-foreground font-medium">{h}h</div>
                ))}
              </div>
              {DAYS.map(day => (
                <div key={day} className="flex gap-px mt-px">
                  <div className="w-12 text-xs flex items-center text-muted-foreground font-medium">{day}</div>
                  {HOURS.filter(h => h >= 8 && h <= 23).map(h => {
                    const cell = ordersData?.heatmap.find(c => c.day === day && c.hour === h);
                    const intensity = cell ? cell.count / maxHeat : 0;
                    let bg: string;
                    if (intensity === 0) bg = 'hsl(210, 40%, 94%)';
                    else if (intensity <= 0.2) bg = 'hsl(200, 70%, 80%)';
                    else if (intensity <= 0.4) bg = 'hsl(180, 60%, 65%)';
                    else if (intensity <= 0.6) bg = 'hsl(50, 90%, 55%)';
                    else if (intensity <= 0.8) bg = 'hsl(30, 95%, 50%)';
                    else bg = 'hsl(0, 80%, 50%)';
                    const textColor = intensity > 0.4 ? 'white' : 'hsl(220, 20%, 25%)';
                    return (
                      <div key={h} className="flex-1 h-8 rounded-sm flex items-center justify-center text-[9px] font-medium transition-colors"
                        style={{ backgroundColor: bg, color: textColor }}
                        title={`${day} ${h}:00 — ${cell?.count || 0} pedidos`}>
                        {cell?.count ? cell.count : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="flex items-center gap-2 mt-3 justify-end">
                <span className="text-[10px] text-muted-foreground">Frío</span>
                {['hsl(210, 40%, 94%)','hsl(200, 70%, 80%)','hsl(180, 60%, 65%)','hsl(50, 90%, 55%)','hsl(30, 95%, 50%)','hsl(0, 80%, 50%)'].map((c, i) => (
                  <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: c }} />
                ))}
                <span className="text-[10px] text-muted-foreground">Caliente</span>
              </div>
            </div>
          </div>
        )}
      </ExpandableChartCard>

      {/* Sensibilidad al precio (antes: elasticidad precio-demanda) */}
      <PriceSensitivityCard />

      {/* Waiter Performance */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Rendimiento de mozos
            </CardTitle>
            <Select value={waiterPeriod} onValueChange={setWaiterPeriod}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">Por hora</SelectItem>
                <SelectItem value="day">Por día</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
                <SelectItem value="month">Por mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {waiterTableData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay datos de mozos en este período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mozo</TableHead>
                    <TableHead className="text-right">Total mesas</TableHead>
                    <TableHead className="text-right">Promedio</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waiterTableData.slice(0, waitersShowAll ? undefined : 6).map(w => (
                    <TableRow key={w.name}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="text-right font-semibold">{w.totalTables}</TableCell>
                      <TableCell className="text-right">{w.avg.toFixed(1)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {w.entries.slice(0, 10).map(([key, val]) => (
                            <Badge key={key} variant="outline" className="text-xs">{key}: {val}</Badge>
                          ))}
                          {w.entries.length > 10 && <Badge variant="secondary" className="text-xs">+{w.entries.length - 10} más</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {waiterTableData.length > 6 && (
                <div className="flex justify-center mt-3">
                  <Button variant="outline" size="sm" onClick={() => setWaitersShowAll(v => !v)} className="gap-1">
                    {waitersShowAll
                      ? <>Ver menos <ChevronUp className="h-3.5 w-3.5" /></>
                      : <>Ver más ({waiterTableData.length - 6}) <ChevronDown className="h-3.5 w-3.5" /></>}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="compare">
          <AnalyticsComparison />
        </TabsContent>
        <TabsContent value="profitability">
          <ProfitMarginTab />
        </TabsContent>
        <TabsContent value="products">
          <ProductMatrixTab />
        </TabsContent>
        {deliveryEnabled && (
          <TabsContent value="channels">
            <SalesChannelsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
}

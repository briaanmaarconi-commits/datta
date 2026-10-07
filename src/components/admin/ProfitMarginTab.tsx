import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import ProfitMarginCard from './ProfitMarginCard';
import BreakEvenCard from './BreakEvenCard';
import ExpenseBreakdownCard from './ExpenseBreakdownCard';

const SUPPLIES_CATEGORY = 'Compras de insumos';
const TIPS_PAYOUT_CATEGORY = 'Pago de propinas';
const EXCLUDED_EXPENSE_CATEGORIES = [SUPPLIES_CATEGORY, TIPS_PAYOUT_CATEGORY];

// Detect any tip-related expense category (case-insensitive) to exclude pass-through tips
const isTipCategory = (name: string) => /propina|tip/i.test(name);
// Detect manual raw-material category (used as MP, excluded from operating expenses)
// Con tipo cargado (Costos y gastos) manda el tipo; si no, se deduce por el nombre. Las compras de Stock
// (Compras de insumos) no cuentan: en ese caso el costo sale del costo de cada plato vendido.
const isManualMPCategory = (name: string, kind?: string | null) =>
  kind ? kind === 'cogs' && name !== SUPPLIES_CATEGORY : /materia\s*prima|costo\s+de\s+mercader[ií]a|mercader[ií]a\s+vendida/i.test(name);
const isExcludedExpense = (name: string, kind?: string | null) =>
  EXCLUDED_EXPENSE_CATEGORIES.includes(name) || isTipCategory(name) || isManualMPCategory(name, kind);

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-AR')}`;

interface PeriodData {
  label: string;
  fromDate: string;
  toDate: string;
  fromISO: string;
  toISO: string;
  days: number;
}

function buildPeriods(): { month: PeriodData; sixMonths: PeriodData; year: PeriodData; prevMonth: PeriodData; prevSixMonths: PeriodData; prevYear: PeriodData; } {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const toISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  const mkPeriod = (label: string, daysBack: number, anchor = now): PeriodData => {
    const from = new Date(anchor);
    from.setDate(from.getDate() - daysBack + 1);
    const fromDate = from.toISOString().slice(0, 10);
    const fromISO = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0).toISOString();
    return { label, fromDate, toDate: anchor.toISOString().slice(0, 10), fromISO, toISO: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 23, 59, 59, 999).toISOString(), days: daysBack };
  };

  const month = mkPeriod('Último mes', 30);
  const sixMonths = mkPeriod('Últimos 6 meses', 180);
  const year = mkPeriod('Último año', 365);

  const prevMonthAnchor = new Date(now); prevMonthAnchor.setDate(prevMonthAnchor.getDate() - 30);
  const prevSixAnchor = new Date(now); prevSixAnchor.setDate(prevSixAnchor.getDate() - 180);
  const prevYearAnchor = new Date(now); prevYearAnchor.setDate(prevYearAnchor.getDate() - 365);

  return {
    month,
    sixMonths,
    year,
    prevMonth: mkPeriod('Mes anterior', 30, prevMonthAnchor),
    prevSixMonths: mkPeriod('6 meses anteriores', 180, prevSixAnchor),
    prevYear: mkPeriod('Año anterior', 365, prevYearAnchor),
  };
}

export default function ProfitMarginTab() {
  const { establishmentId } = useAuth();
  const periods = useMemo(buildPeriods, []);
  const [activePeriodKey, setActivePeriodKey] = useState<'month' | 'sixMonths' | 'year'>('month');
  const [searchSales, setSearchSales] = useState('');
  const [searchMP, setSearchMP] = useState('');
  const [searchExp, setSearchExp] = useState('');

  // Fetch all data spanning year + previous year (covers all periods)
  const { data, isLoading } = useQuery({
    queryKey: ['profit-margin', establishmentId, periods.prevYear.fromDate, periods.year.toDate],
    queryFn: async () => {
      const fromDate = periods.prevYear.fromDate;
      const toDate = periods.year.toDate;
      const fromISO = periods.prevYear.fromISO;
      const toISO = periods.year.toISO;

      // Orders (closed) with items + product cost snapshot
      const [ordersRes, itemsRes, txRes] = await Promise.all([
        db.from('orders')
          .select('id, total, created_at, payment_method, table_id, tables(number)')
          .eq('establishment_id', establishmentId!)
          .eq('status', 'closed')
          .gte('created_at', fromISO)
          .lte('created_at', toISO),
        db.from('order_items')
          .select('quantity, unit_price, cost_snapshot, products(name), orders!inner(id, establishment_id, status, created_at)')
          .eq('orders.establishment_id', establishmentId!)
          .eq('orders.status', 'closed')
          .gte('orders.created_at', fromISO)
          .lte('orders.created_at', toISO),
        db.from('finance_transactions')
          .select('id, amount, type, date, description, category_id, finance_categories(name, kind)')
          .eq('establishment_id', establishmentId!)
          .eq('type', 'expense')
          .gte('date', fromDate)
          .lte('date', toDate),
      ]);

      const orders = (ordersRes.data || []) as any[];
      const items = (itemsRes.data || []) as any[];
      const txs = (txRes.data || []) as any[];

      return { orders, items, txs };
    },
    enabled: !!establishmentId,
    staleTime: 60_000,
  });

  // Aggregate per period
  const aggregate = (period: PeriodData) => {
    if (!data) return { sales: 0, costMP: 0, costMPStock: 0, costMPManual: 0, fixedExpenses: 0 };
    const orderIds = new Set<string>();
    let sales = 0;
    data.orders.forEach(o => {
      const t = new Date(o.created_at).getTime();
      if (t >= new Date(period.fromISO).getTime() && t <= new Date(period.toISO).getTime()) {
        orderIds.add(o.id);
        sales += Number(o.total);
      }
    });
    let costMPStock = 0;
    data.items.forEach(it => {
      if (orderIds.has(it.orders?.id)) {
        costMPStock += Number(it.cost_snapshot || 0) * Number(it.quantity || 0);
      }
    });
    let costMPManual = 0;
    let fixedExpenses = 0;
    data.txs.forEach(t => {
      if (t.date >= period.fromDate && t.date <= period.toDate) {
        const catName = t.finance_categories?.name || '';
        if (isManualMPCategory(catName, t.finance_categories?.kind)) {
          costMPManual += Number(t.amount);
        } else if (!isExcludedExpense(catName, t.finance_categories?.kind)) {
          fixedExpenses += Number(t.amount);
        }
      }
    });
    // Manual MP replaces stock-derived MP when present
    const costMP = costMPManual > 0 ? costMPManual : costMPStock;
    return { sales, costMP, costMPStock, costMPManual, fixedExpenses };
  };

  const monthData = useMemo(() => aggregate(periods.month), [data, periods]);
  const sixData = useMemo(() => aggregate(periods.sixMonths), [data, periods]);
  const yearData = useMemo(() => aggregate(periods.year), [data, periods]);
  const prevMonthData = useMemo(() => aggregate(periods.prevMonth), [data, periods]);
  const prevSixData = useMemo(() => aggregate(periods.prevSixMonths), [data, periods]);
  const prevYearData = useMemo(() => aggregate(periods.prevYear), [data, periods]);

  const activePeriod = activePeriodKey === 'month' ? periods.month : activePeriodKey === 'sixMonths' ? periods.sixMonths : periods.year;
  const activeData = activePeriodKey === 'month' ? monthData : activePeriodKey === 'sixMonths' ? sixData : yearData;

  // Monthly evolution last 12 months
  const monthlyEvolution = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const months: { label: string; key: string; from: Date; to: Date; sales: number; costMPStock: number; costMPManual: number; fixedExpenses: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
      const key = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        label: ref.toLocaleDateString('es', { month: 'short', year: '2-digit' }),
        key, from: ref, to: next,
        sales: 0, costMPStock: 0, costMPManual: 0, fixedExpenses: 0,
      });
    }
    const orderIdToMonthIdx = new Map<string, number>();
    data.orders.forEach(o => {
      const dt = new Date(o.created_at);
      const idx = months.findIndex(m => dt >= m.from && dt < m.to);
      if (idx >= 0) {
        months[idx].sales += Number(o.total);
        orderIdToMonthIdx.set(o.id, idx);
      }
    });
    data.items.forEach(it => {
      const idx = orderIdToMonthIdx.get(it.orders?.id);
      if (idx !== undefined) {
        months[idx].costMPStock += Number(it.cost_snapshot || 0) * Number(it.quantity || 0);
      }
    });
    data.txs.forEach(t => {
      const dt = new Date(t.date + 'T12:00:00');
      const idx = months.findIndex(m => dt >= m.from && dt < m.to);
      if (idx < 0) return;
      const catName = t.finance_categories?.name || '';
      if (isManualMPCategory(catName, t.finance_categories?.kind)) {
        months[idx].costMPManual += Number(t.amount);
      } else if (!isExcludedExpense(catName, t.finance_categories?.kind)) {
        months[idx].fixedExpenses += Number(t.amount);
      }
    });
    return months.map(m => {
      const costMP = m.costMPManual > 0 ? m.costMPManual : m.costMPStock;
      return {
        label: m.label,
        sales: Math.round(m.sales),
        costMP: Math.round(costMP),
        fixedExpenses: Math.round(m.fixedExpenses),
        profit: Math.round(m.sales - costMP - m.fixedExpenses),
      };
    });
  }, [data]);

  // Tables for active period
  const salesRows = useMemo(() => {
    if (!data) return [];
    return data.orders
      .filter(o => {
        const t = new Date(o.created_at).getTime();
        return t >= new Date(activePeriod.fromISO).getTime() && t <= new Date(activePeriod.toISO).getTime();
      })
      .map(o => ({
        date: new Date(o.created_at).toLocaleDateString('es-AR'),
        id: o.id.slice(0, 8),
        table: o.tables?.number ?? '—',
        method: o.payment_method || '—',
        total: Number(o.total),
      }))
      .filter(r => !searchSales || r.id.includes(searchSales) || String(r.table).includes(searchSales) || r.method.toLowerCase().includes(searchSales.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, activePeriod, searchSales]);

  const mpRows = useMemo(() => {
    if (!data) return [];
    const orderIds = new Set<string>();
    data.orders.forEach(o => {
      const t = new Date(o.created_at).getTime();
      if (t >= new Date(activePeriod.fromISO).getTime() && t <= new Date(activePeriod.toISO).getTime()) {
        orderIds.add(o.id);
      }
    });
    const dateByOrder = new Map<string, string>();
    data.orders.forEach(o => dateByOrder.set(o.id, new Date(o.created_at).toLocaleDateString('es-AR')));
    // Group by product
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    data.items.forEach(it => {
      if (!orderIds.has(it.orders?.id)) return;
      const name = it.products?.name || 'Sin nombre';
      if (!map[name]) map[name] = { name, qty: 0, total: 0 };
      map[name].qty += Number(it.quantity || 0);
      map[name].total += Number(it.quantity || 0) * Number(it.cost_snapshot || 0);
    });
    return Object.values(map)
      .filter(r => !searchMP || r.name.toLowerCase().includes(searchMP.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [data, activePeriod, searchMP]);

  const mpManualRows = useMemo(() => {
    if (!data) return [];
    return data.txs
      .filter(t => t.date >= activePeriod.fromDate && t.date <= activePeriod.toDate && isManualMPCategory(t.finance_categories?.name || '', t.finance_categories?.kind))
      .map(t => ({
        date: new Date(t.date + 'T12:00:00').toLocaleDateString('es-AR'),
        category: t.finance_categories?.name || 'Costo de mercadería',
        description: t.description || '—',
        amount: Number(t.amount),
      }))
      .filter(r => !searchMP || r.category.toLowerCase().includes(searchMP.toLowerCase()) || r.description.toLowerCase().includes(searchMP.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, activePeriod, searchMP]);

  const expRows = useMemo(() => {
    if (!data) return [];
    return data.txs
      .filter(t => t.date >= activePeriod.fromDate && t.date <= activePeriod.toDate && !isExcludedExpense(t.finance_categories?.name || '', t.finance_categories?.kind))
      .map(t => ({
        date: new Date(t.date + 'T12:00:00').toLocaleDateString('es-AR'),
        category: t.finance_categories?.name || 'Sin categoría',
        description: t.description || '—',
        amount: Number(t.amount),
      }))
      .filter(r => !searchExp || r.category.toLowerCase().includes(searchExp.toLowerCase()) || r.description.toLowerCase().includes(searchExp.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, activePeriod, searchExp]);

  // Expense breakdown for active period (by category)
  const expenseBreakdown = useMemo(() => {
    if (!data) return [];
    const map: Record<string, number> = {};
    data.txs.forEach(t => {
      if (t.date >= activePeriod.fromDate && t.date <= activePeriod.toDate) {
        const name = t.finance_categories?.name || 'Sin categoría';
        if (isExcludedExpense(name, t.finance_categories?.kind)) return;
        map[name] = (map[name] || 0) + Number(t.amount);
      }
    });
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [data, activePeriod]);

  const salesTotal = salesRows.reduce((s, r) => s + r.total, 0);
  const mpTotal = mpRows.reduce((s, r) => s + r.total, 0);
  const expTotal = expRows.reduce((s, r) => s + r.amount, 0);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-12 text-center">Cargando datos de rentabilidad…</div>;
  }

  const usingManualMP = activeData.costMPManual > 0;
  const noMPAtAll = activeData.costMPManual === 0 && activeData.costMPStock === 0 && activeData.sales > 0;

  return (
    <div className="space-y-6">
      {usingManualMP && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          Usando <strong>costo de mercadería cargado manualmente</strong> desde Caja ({fmt(activeData.costMPManual)}). Se ignora el costo descontado desde stock en este período{activeData.costMPStock > 0 ? ` (${fmt(activeData.costMPStock)})` : ''}.
        </div>
      )}
      {noMPAtAll && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          No hay costo de mercadería registrado. Cargalo manualmente desde <strong>Caja → Salidas e Ingresos</strong> usando la categoría <strong>"Costo de mercadería"</strong>, o configurá recetas en Stock.
        </div>
      )}
      {/* Margin cards for 3 periods */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ProfitMarginCard
          title="Último mes"
          sales={monthData.sales}
          costMP={monthData.costMP}
          fixedExpenses={monthData.fixedExpenses}
          previous={prevMonthData}
          highlight={activePeriodKey === 'month'}
        />
        <ProfitMarginCard
          title="Últimos 6 meses"
          sales={sixData.sales}
          costMP={sixData.costMP}
          fixedExpenses={sixData.fixedExpenses}
          previous={prevSixData}
          highlight={activePeriodKey === 'sixMonths'}
        />
        <ProfitMarginCard
          title="Último año"
          sales={yearData.sales}
          costMP={yearData.costMP}
          fixedExpenses={yearData.fixedExpenses}
          previous={prevYearData}
          highlight={activePeriodKey === 'year'}
        />
      </div>

      {/* Period selector for break-even, expenses & history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Análisis detallado por período</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activePeriodKey} onValueChange={(v) => setActivePeriodKey(v as any)}>
            <TabsList>
              <TabsTrigger value="month">Último mes</TabsTrigger>
              <TabsTrigger value="sixMonths">Últimos 6 meses</TabsTrigger>
              <TabsTrigger value="year">Último año</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Break-even */}
      <BreakEvenCard
        periodLabel={activePeriod.label}
        sales={activeData.sales}
        costMP={activeData.costMP}
        fixedExpenses={activeData.fixedExpenses}
        daysInPeriod={activePeriod.days}
        monthly={monthlyEvolution}
      />

      {/* Expense breakdown */}
      <ExpenseBreakdownCard expenses={expenseBreakdown} totalSales={activeData.sales} />

      {/* History tables */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historial de movimientos — {activePeriod.label}</CardTitle>
          <p className="text-xs text-muted-foreground">Detalle completo de ventas, costos de materia prima y gastos operativos.</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sales">
            <TabsList>
              <TabsTrigger value="sales">Ventas <Badge variant="secondary" className="ml-2">{salesRows.length}</Badge></TabsTrigger>
              <TabsTrigger value="mp">Materia prima <Badge variant="secondary" className="ml-2">{mpRows.length}</Badge></TabsTrigger>
              <TabsTrigger value="exp">Gastos operativos <Badge variant="secondary" className="ml-2">{expRows.length}</Badge></TabsTrigger>
            </TabsList>

            <TabsContent value="sales" className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar pedido, mesa o método…" value={searchSales} onChange={(e) => setSearchSales(e.target.value)} />
              </div>
              <div className="overflow-x-auto rounded-md border max-h-[500px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>N° pedido</TableHead>
                      <TableHead>Mesa</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesRows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin ventas en este período</TableCell></TableRow>
                    ) : salesRows.slice(0, 200).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{r.date}</TableCell>
                        <TableCell className="font-mono text-xs">#{r.id}</TableCell>
                        <TableCell>{r.table}</TableCell>
                        <TableCell className="capitalize">{r.method}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-semibold">Total {salesRows.length > 200 && '(mostrando primeros 200)'}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">{fmt(salesTotal)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="mp" className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder={usingManualMP ? 'Buscar categoría o descripción…' : 'Buscar producto…'} value={searchMP} onChange={(e) => setSearchMP(e.target.value)} />
              </div>
              <div className="overflow-x-auto rounded-md border max-h-[500px]">
                {usingManualMP ? (
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mpManualRows.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin cargas manuales en este período</TableCell></TableRow>
                      ) : mpManualRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                          <TableCell className="text-sm">{r.description}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(r.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                        <TableCell className="text-right font-bold text-red-600">{fmt(activeData.costMPManual)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cantidad vendida</TableHead>
                        <TableHead className="text-right">Costo unitario prom.</TableHead>
                        <TableHead className="text-right">Costo total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mpRows.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin costos de materia prima registrados</TableCell></TableRow>
                      ) : mpRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right">{r.qty}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{fmt(r.qty > 0 ? r.total / r.qty : 0)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                        <TableCell className="text-right font-bold text-red-600">{fmt(mpTotal)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </div>
            </TabsContent>

            <TabsContent value="exp" className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar categoría o descripción…" value={searchExp} onChange={(e) => setSearchExp(e.target.value)} />
              </div>
              <div className="overflow-x-auto rounded-md border max-h-[500px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expRows.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin gastos operativos en este período</TableCell></TableRow>
                    ) : expRows.slice(0, 200).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{r.date}</TableCell>
                        <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                        <TableCell className="text-sm">{r.description}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="font-semibold">Total {expRows.length > 200 && '(mostrando primeros 200)'}</TableCell>
                      <TableCell className="text-right font-bold text-orange-600">{fmt(expTotal)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

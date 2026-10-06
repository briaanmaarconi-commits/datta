import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { parseAmount, sanitizeAmountInput } from '@/lib/parseAmount';
import { useAuth } from '@/hooks/useAuth';
import { toArgDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, DollarSign, TrendingDown, TrendingUp, CalendarIcon, Pencil, Sparkles, Info, StickyNote, Search, BarChart3, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, LabelList } from 'recharts';
import { SALES_CATEGORY_RE, isTipTx } from '@/lib/cashReconciliation';
import InvoiceScanDialog, { type ParsedInvoice } from '@/components/shared/InvoiceScanDialog';
import InvoiceItemsReviewDialog from '@/components/shared/InvoiceItemsReviewDialog';
import DuplicatePurchaseDialog from '@/components/shared/DuplicatePurchaseDialog';
import { findSimilarPurchases, type SimilarPurchase } from '@/lib/duplicatePurchase';


const isManualMPCategory = (name: string) =>
  /materia\s*prima|costo\s+de\s+mercader[ií]a|mercader[ií]a\s+vendida/i.test(name);

type PeriodFilter = 'day' | 'week' | 'month' | 'last_30_days' | 'year' | 'custom';

function getDateRange(period: PeriodFilter): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;
  switch (period) {
    case 'day': from = new Date(to); break;
    case 'week': from = new Date(to); from.setDate(from.getDate() - from.getDay()); break;
    case 'month': from = new Date(to.getFullYear(), to.getMonth(), 1); break;
    case 'last_30_days': from = new Date(to); from.setDate(from.getDate() - 29); break;
    case 'year': from = new Date(to.getFullYear(), 0, 1); break;
    default: from = new Date(to);
  }
  return { from, to };
}

export default function CashierExpenses() {
  const { establishmentId, session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const [showCatDialog, setShowCatDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [dupMatches, setDupMatches] = useState<SimilarPurchase[]>([]);
  const [checkingDup, setCheckingDup] = useState(false);

  const [showScanDialog, setShowScanDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [parsedInvoices, setParsedInvoices] = useState<ParsedInvoice[]>([]);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'income' | 'expense'>('expense');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [categorySearch, setCategorySearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('day');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => getDateRange('day').from);
  const [dateTo, setDateTo] = useState<Date | undefined>(() => getDateRange('day').to);

  const handlePeriodChange = (period: PeriodFilter) => {
    setPeriodFilter(period);
    if (period !== 'custom') {
      const range = getDateRange(period);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['finance-categories', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('finance_categories')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const seedCategories = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('seed_default_finance_categories' as any, {
        _establishment_id: establishmentId!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
    },
  });

  // Auto-seed once when an establishment has zero categories
  const seededRef = useRef(false);
  useEffect(() => {
    if (
      !seededRef.current &&
      establishmentId &&
      !catsLoading &&
      categories.length === 0
    ) {
      seededRef.current = true;
      seedCategories.mutate();
    }
  }, [establishmentId, catsLoading, categories.length]);


  const { data: transactions = [] } = useQuery({
    queryKey: ['cashier-finance-transactions', establishmentId],
    queryFn: async () => {
      const { data: manualTx, error } = await db
        .from('finance_transactions')
        .select('*, finance_categories(name)')
        .eq('establishment_id', establishmentId!)
        .order('date', { ascending: false });
      if (error) throw error;

      const { data: closedOrders, error: ordErr } = await db
        .from('orders')
        .select('id, total, payment_method, created_at')
        .eq('establishment_id', establishmentId!)
        .eq('status', 'closed')
        .order('created_at', { ascending: false });
      if (ordErr) throw ordErr;

      // Avoid double counting: a closed table already creates an automatic
      // "Ventas" finance transaction. Only synthesize a row for legacy orders
      // that have no matching movement (same date + amount).
      const salesKeys = new Set(
        (manualTx || [])
          .filter((t: any) => SALES_CATEGORY_RE.test(t.finance_categories?.name || ''))
          .map((t: any) => `${t.date}|${Number(t.amount).toFixed(2)}`)
      );
      const usedKeys = new Set<string>();

      const salesTx = (closedOrders || [])
        .filter((o: any) => {
          const key = `${toArgDate(o.created_at)}|${Number(o.total).toFixed(2)}`;
          if (salesKeys.has(key) && !usedKeys.has(`${key}|${o.id}`)) {
            usedKeys.add(`${key}|${o.id}`);
            return false;
          }
          return !salesKeys.has(key);
        })
        .map((o: any) => ({
          id: `sale-${o.id}`,
          type: 'income',
          amount: Number(o.total),
          date: toArgDate(o.created_at),
          description: `Venta - ${o.payment_method === 'cash' ? 'Efectivo' : o.payment_method === 'card' ? 'Tarjeta' : o.payment_method === 'transfer' ? 'Transferencia' : 'Sin método'}`,
          finance_categories: { name: 'Ventas' },
          created_at: o.created_at,
          _isSale: true,
        }));

      return [...(manualTx || []), ...salesTx].sort((a: any, b: any) => b.date.localeCompare(a.date));

    },
    enabled: !!establishmentId,
  });

  const createCategory = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('finance_categories').insert({
        establishment_id: establishmentId!,
        name: catName,
        type: catType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
      setShowCatDialog(false);
      setCatName('');
      toast.success('Categoría creada');
    },
    onError: () => toast.error('Error al crear categoría'),
  });

  /** Avisa si esa salida ya fue cargada como compra en Stock (o duplicada acá). */
  const attemptCreateTransaction = async () => {
    const amount = parseAmount(txAmount);
    if (!editingTx && txType === 'expense' && txDescription.trim() && amount > 0 && establishmentId) {
      setCheckingDup(true);
      try {
        const matches = await findSimilarPurchases({
          establishmentId,
          supplier: txDescription,
          date: txDate,
          amount,
        });
        if (matches.length > 0) {
          setDupMatches(matches);
          return;
        }
      } catch (e) {
        console.error('findSimilarPurchases', e);
      } finally {
        setCheckingDup(false);
      }
    }
    createTransaction.mutate();
  };

  const createTransaction = useMutation({

    mutationFn: async () => {
      if (editingTx) {
        // Update existing
        const { error } = await db.from('finance_transactions').update({
          category_id: txCategoryId,
          type: txType,
          amount: parseAmount(txAmount),
          description: txDescription || null,
          notes: txNotes || null,
          date: txDate,
        }).eq('id', editingTx.id);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await db.from('finance_transactions').insert({
          establishment_id: establishmentId!,
          category_id: txCategoryId,
          type: txType,
          amount: parseAmount(txAmount),
          description: txDescription || null,
          notes: txNotes || null,
          date: txDate,
          created_by: userId!,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-finance-transactions'] });
      setShowTxDialog(false);
      setEditingTx(null);
      setTxAmount('');
      setTxDescription('');
      setTxNotes('');
      setTxCategoryId('');
      toast.success(editingTx ? 'Movimiento actualizado' : 'Movimiento registrado');
    },
    onError: () => toast.error('Error al registrar'),
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('finance_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-finance-transactions'] });
      setShowDeleteConfirm(null);
      toast.success('Movimiento eliminado');
    },
    onError: () => toast.error('Error al eliminar'),
  });

  const openEditDialog = (tx: any) => {
    setEditingTx(tx);
    setTxType(tx.type);
    setTxCategoryId(tx.category_id);
    setTxAmount(String(tx.amount));
    setTxDescription(tx.description || '');
    setTxNotes(tx.notes || '');
    setTxDate(tx.date);
    setShowTxDialog(true);
  };

  const { data: establishment } = useQuery({
    queryKey: ['establishment-ai-invoice-reader', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('establishments')
        .select('id, ai_invoice_reader')
        .eq('id', establishmentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });
  const aiReaderEnabled = !!(establishment as any)?.ai_invoice_reader;

  /** Abre la revisión de ítems con lo leído de las facturas. */
  const handleParsedInvoice = (invs: ParsedInvoice[]) => {
    setParsedInvoices(invs);
    setShowReviewDialog(true);
  };



  const filteredTx = useMemo(() => {
    let result = transactions;
    if (filterType !== 'all') result = result.filter((t: any) => t.type === filterType);
    if (dateFrom) result = result.filter((t: any) => t.date >= format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) result = result.filter((t: any) => t.date <= format(dateTo, 'yyyy-MM-dd'));
    return result;
  }, [transactions, filterType, dateFrom, dateTo]);

  const txList = useShowMore<any>(filteredTx, 15);

  // Tips are neutral (income + mirror expense): excluded from totals.
  const countableTx = filteredTx.filter((t: any) => !isTipTx({ type: t.type, amount: t.amount, categoryName: t.finance_categories?.name }));
  const totalIncome = countableTx.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = countableTx.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const filteredCategories = categories.filter((c: any) => c.type === txType);

  // Expenses by category for the bar chart: always expenses only, ignores the
  // global income/expense/all filter so the chart always reflects "Gastos".
  const dateFilteredTx = useMemo(() => {
    let result = transactions;
    if (dateFrom) result = result.filter((t: any) => t.date >= format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) result = result.filter((t: any) => t.date <= format(dateTo, 'yyyy-MM-dd'));
    return result;
  }, [transactions, dateFrom, dateTo]);

  const expenseChartData = useMemo(() => {
    const grouped = dateFilteredTx
      .filter((t: any) => !isTipTx({ type: t.type, amount: t.amount, categoryName: t.finance_categories?.name }))
      .filter((t: any) => t.type === 'expense')
      .reduce<Record<string, number>>((acc, t: any) => {
        const name = t.finance_categories?.name || 'Sin categoría';
        acc[name] = (acc[name] || 0) + Number(t.amount);
        return acc;
      }, {});
    return Object.entries(grouped)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [dateFilteredTx]);

  const filteredChartData = useMemo(() => {
    if (!categorySearch.trim()) return expenseChartData;
    const q = categorySearch.toLowerCase();
    return expenseChartData.filter((d) => d.name.toLowerCase().includes(q));
  }, [expenseChartData, categorySearch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Salidas e Ingresos</h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setShowTxDialog(true)}><Plus className="h-4 w-4 mr-1" /> Registrar movimiento</Button>
          {aiReaderEnabled && (
            <Button variant="secondary" onClick={() => setShowScanDialog(true)}>
              <ScanLine className="h-4 w-4 mr-1" /> Leer factura con IA
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowCatDialog(true)}><Plus className="h-4 w-4 mr-1" /> Nueva categoría</Button>
          <Button variant="outline" onClick={() => seedCategories.mutate(undefined, { onSuccess: () => toast.success('Categorías sugeridas creadas') })} disabled={seedCategories.isPending}>
            <Sparkles className="h-4 w-4 mr-1" /> Crear categorías sugeridas
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Cargá manualmente tus costos (materia prima, sueldos, servicios, impuestos, mermas, etc.) y vas a ver el balance y la rentabilidad en Analíticas, sin necesidad de gestionar stock.
          Usá la categoría <strong>"Costo de mercadería"</strong> para registrar lo que gastás en insumos del mes.
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Ingresos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">${totalIncome.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="h-4 w-4" /> Salidas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">${totalExpense.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="h-4 w-4" /> Balance</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-green-600' : 'text-red-600'}`}>${(totalIncome - totalExpense).toFixed(2)}</div></CardContent>
        </Card>
      </div>

      {/* Period filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-md border border-input overflow-hidden">
          {([
            { key: 'day', label: 'Día' },
            { key: 'week', label: 'Semana' },
            { key: 'month', label: 'Mes' },
            { key: 'last_30_days', label: '30 días' },
            { key: 'year', label: 'Año' },
            { key: 'custom', label: 'Personalizar' },
          ] as { key: PeriodFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePeriodChange(key)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                periodFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-accent'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {periodFilter === 'custom' && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Desde'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Hasta'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </>
        )}

        <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Ingresos</SelectItem>
            <SelectItem value="expense">Salidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expenses bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-destructive" /> Gastos por categoría
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Salidas ordenadas de mayor a menor según el período seleccionado.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar categoría..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="pl-9 w-full sm:w-56"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {expenseChartData.length === 0
                ? 'No hay gastos registrados en este período.'
                : 'Ninguna categoría coincide con la búsqueda.'}
            </p>
          ) : (
            <div className="w-full" style={{ height: Math.max(220, filteredChartData.length * 44) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredChartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <XAxis type="number" tickFormatter={(v) => `$${Number(v).toLocaleString('es-AR')}`} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    formatter={(value: number) => [`$${Number(value).toLocaleString('es-AR')}`, 'Monto']}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="amount" position="right" formatter={(v: number) => `$${Math.round(v).toLocaleString('es-AR')}`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader><CardTitle className="text-base">Categorías</CardTitle></CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="flex flex-wrap gap-2">
              {categories.map((c: any) => {
                const isMP = c.type === 'expense' && /mercader|insumo|compra/i.test(c.name);
                const badge = (
                  <Badge key={c.id} variant={c.type === 'income' ? 'default' : 'destructive'} className={cn('px-3 py-1', isMP && 'ring-2 ring-blue-400/60')}>
                    {isMP && <Sparkles className="h-3 w-3 mr-1" />}
                    {c.name}
                  </Badge>
                );
                if (!isMP) return badge;
                return (
                  <Tooltip key={c.id}>
                    <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Lo cargado en esta categoría se usa como costo de mercadería en Rentabilidad y reemplaza al cálculo automático desde stock.
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {categories.length === 0 && <span className="text-sm text-muted-foreground">Creando categorías sugeridas…</span>}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Transactions table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Movimientos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txList.visible.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{new Date(t.date + 'T12:00:00').toLocaleDateString('es')}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === 'income' ? 'default' : 'destructive'}>
                      {t.type === 'income' ? 'Ingreso' : 'Salida'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      {t.finance_categories?.name || '-'}
                      {isTipTx({ type: t.type, amount: t.amount, categoryName: t.finance_categories?.name }) && (
                        <Badge variant="outline" className="text-[10px]">Neutro</Badge>
                      )}
                      {t.affects_cash === false && (
                        <Badge variant="outline" className="text-[10px]">No afecta caja</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{t.description || '-'}</TableCell>
                  <TableCell className={`font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {!t._isSale && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditDialog(t)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setShowDeleteConfirm(t.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        {t.notes && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => toast.info(t.notes)}>
                                  <StickyNote className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{t.notes}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredTx.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay movimientos</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <ShowMoreButton hiddenCount={txList.hiddenCount} expanded={txList.expanded} onToggle={() => txList.setExpanded(!txList.expanded)} />
        </CardContent>
      </Card>

      {/* Create category dialog */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nombre (ej: Luz, Alquiler, Imprevisto...)" value={catName} onChange={e => setCatName(e.target.value)} />
            <Select value={catType} onValueChange={(v: any) => setCatType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Salida</SelectItem>
                <SelectItem value="income">Ingreso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={() => createCategory.mutate()} disabled={!catName.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/edit transaction dialog */}
      <Dialog open={showTxDialog} onOpenChange={(v) => { setShowTxDialog(v); if (!v) setEditingTx(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTx ? 'Editar movimiento' : 'Registrar movimiento'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={txType} onValueChange={(v: any) => { setTxType(v); setTxCategoryId(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Salida</SelectItem>
                <SelectItem value="income">Ingreso</SelectItem>
              </SelectContent>
            </Select>
            <Select value={txCategoryId} onValueChange={setTxCategoryId}>
              <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="text" inputMode="decimal" placeholder="Monto (ej: 1350,25)" value={txAmount} onChange={e => setTxAmount(sanitizeAmountInput(e.target.value))} />
            <Input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
            <Textarea placeholder="Descripción (opcional)" value={txDescription} onChange={e => setTxDescription(e.target.value)} />
            <Textarea placeholder="Aclaración / nota (opcional)" value={txNotes} onChange={e => setTxNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={attemptCreateTransaction} disabled={!txCategoryId || !txAmount || checkingDup}>
              {checkingDup ? 'Verificando…' : editingTx ? 'Guardar cambios' : 'Registrar'}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={(v) => { if (!v) setShowDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar movimiento?</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && deleteTransaction.mutate(showDeleteConfirm)} disabled={deleteTransaction.isPending}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicatePurchaseDialog
        open={dupMatches.length > 0}
        onOpenChange={v => { if (!v) setDupMatches([]); }}
        matches={dupMatches}
        pending={createTransaction.isPending}
        onConfirm={() => { setDupMatches([]); createTransaction.mutate(); }}
      />
      <InvoiceScanDialog open={showScanDialog} onOpenChange={setShowScanDialog} onParsed={handleParsedInvoice} />

      <InvoiceItemsReviewDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        invoices={parsedInvoices}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['cashier-finance-transactions', establishmentId] });
          queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
        }}
      />
    </div>
  );
}

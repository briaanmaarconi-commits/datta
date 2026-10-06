import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { parseAmount, sanitizeAmountInput } from '@/lib/parseAmount';
import { useAuth } from '@/hooks/useAuth';
import { toArgDate } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Circle, Plus, Trash2, DollarSign, TrendingDown, TrendingUp, CalendarIcon, Eye } from 'lucide-react';
import ShiftDetailDialog from '@/components/admin/ShiftDetailDialog';
import { getShiftDisplayDate, formatShiftDate, formatShiftRange } from '@/lib/shiftScope';

import FiscalSettingsCard from '@/components/admin/FiscalSettingsCard';
import CourtesyAccountsTab from '@/components/admin/CourtesyAccountsTab';
import { toast } from 'sonner';
import { SALES_CATEGORY_RE, isTipTx } from '@/lib/cashReconciliation';

export default function CashControl() {
  const { establishmentId, session, role } = useAuth();
  const isAdminLevel = role === 'admin' || role === 'superadmin';

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Caja</h1>
      <Tabs defaultValue="shifts">
        <TabsList>
          <TabsTrigger value="shifts">Cierre de turnos</TabsTrigger>
          <TabsTrigger value="finance">Movimientos de caja</TabsTrigger>
          <TabsTrigger value="courtesy">Cortesías</TabsTrigger>
          {isAdminLevel && <TabsTrigger value="fiscal">Facturación</TabsTrigger>}
        </TabsList>
        <TabsContent value="shifts">
          <ShiftControlTab establishmentId={establishmentId} userId={session?.user?.id} />
        </TabsContent>
        <TabsContent value="finance">
          <FinanceTab establishmentId={establishmentId} userId={session?.user?.id} />
        </TabsContent>
        <TabsContent value="courtesy">
          <div className="mt-4">
            <CourtesyAccountsTab readOnly={!isAdminLevel} />
          </div>
        </TabsContent>
        {isAdminLevel && (
          <TabsContent value="fiscal">
            <div className="mt-4">
              <FiscalSettingsCard />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ==================== SHIFT CONTROL TAB ==================== */
function ShiftControlTab({ establishmentId, userId }: { establishmentId: string | null; userId?: string }) {
  const [detailShift, setDetailShift] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const queryClient = useQueryClient();

  const { data: shifts = [] } = useQuery({
    queryKey: ['shift-closings', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('shift_controls')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const results = await Promise.all((data || []).map(async (shift: any) => {
        // Misma fuente que el detalle: comprobantes por momento de COBRO dentro del turno.
        const from = shift.opened_at ?? `${shift.shift_date}T00:00:00.000Z`;
        const to = shift.closed_at ?? new Date().toISOString();
        const { data: invs } = await db
          .from('invoices')
          .select('id, total, payment_method')
          .eq('establishment_id', establishmentId!)
          .gte('created_at', from)
          .lte('created_at', to);
        const rows = invs || [];
        const sum = (m: string) => rows.filter((o: any) => o.payment_method === m).reduce((s: number, o: any) => s + Number(o.total), 0);
        const cash = sum('cash');
        const card = sum('card');
        const transfer = sum('transfer');
        const total = cash + card + transfer;

        return { ...shift, cash, card, transfer, total, count: rows.length };
      }));

      return results;
    },
    enabled: !!establishmentId,
  });

  const toggleControl = useMutation({
    mutationFn: async ({ isControlled, controlId }: { isControlled: boolean; controlId: string }) => {
      if (isControlled) {
        const { error } = await db.from('shift_controls').update({
          is_controlled: false,
          controlled_by: null,
          controlled_at: null,
        }).eq('id', controlId);
        if (error) throw error;
      } else {
        const { error } = await db.from('shift_controls').update({
          is_controlled: true,
          controlled_by: userId!,
          controlled_at: new Date().toISOString(),
        }).eq('id', controlId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-closings'] });
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  // Dates that have shifts (for highlighting in calendar)
  const shiftDates = shifts
    .map((s: any) => getShiftDisplayDate(s))
    .filter(Boolean) as string[];

  // Filter shifts by selected date (fecha de apertura del turno)
  const filteredShifts = selectedDate
    ? shifts.filter((s: any) => getShiftDisplayDate(s) === format(selectedDate, 'yyyy-MM-dd'))
    : shifts;

  const shiftsList = useShowMore<any>(filteredShifts, 15);

  // Highlight days with shifts
  const modifiers = {
    hasShift: shiftDates.map((d: string) => new Date(d + 'T12:00:00')),
  };
  const modifiersStyles = {
    hasShift: { backgroundColor: 'hsl(var(--primary) / 0.15)', borderRadius: '50%' },
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar */}
        <Card className="lg:w-fit shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Seleccioná un día</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => setSelectedDate(date)}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className={cn("p-3 pointer-events-auto")}
            />
            {selectedDate && (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setSelectedDate(undefined)}>
                Ver todos los turnos
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="flex-1 min-w-0">
          <CardHeader>
            <CardTitle>
              {selectedDate
                ? `Turnos del ${selectedDate.toLocaleDateString('es')}`
                : 'Todos los turnos'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Pedidos</TableHead>
                    <TableHead>Efectivo</TableHead>
                    <TableHead>Tarjeta</TableHead>
                    <TableHead>Transferencia</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftsList.visible.map((s: any) => {
                    const isClosed = !!s.closed_at;
                    const isControlled = s.is_controlled;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{formatShiftDate(s)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatShiftRange(s)}</TableCell>
                        <TableCell>{s.count}</TableCell>
                        <TableCell>${s.cash.toFixed(2)}</TableCell>
                        <TableCell>${s.card.toFixed(2)}</TableCell>
                        <TableCell>${s.transfer.toFixed(2)}</TableCell>
                        <TableCell className="font-bold">${s.total.toFixed(2)}</TableCell>
                        <TableCell>
                          {!isClosed
                            ? <Badge variant="secondary">Abierto</Badge>
                            : isControlled
                              ? <Badge className="bg-green-600">Controlado</Badge>
                              : <Badge variant="outline">Cerrado - Pendiente</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!isClosed ? (
                              <span className="text-sm text-muted-foreground">Turno abierto</span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDetailShift(s)}
                                >
                                  <Eye className="h-4 w-4 mr-1" /> Detalle
                                </Button>
                                <Button
                                  size="sm"
                                  variant={isControlled ? 'outline' : 'default'}
                                  onClick={() => toggleControl.mutate({ isControlled: !!isControlled, controlId: s.id })}
                                >
                                  {isControlled ? <CheckCircle className="h-4 w-4 mr-1" /> : <Circle className="h-4 w-4 mr-1" />}
                                  {isControlled ? 'Desmarcar' : 'Controlar'}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredShifts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        {selectedDate ? 'No hay turnos en esta fecha' : 'No hay turnos registrados'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <ShowMoreButton hiddenCount={shiftsList.hiddenCount} expanded={shiftsList.expanded} onToggle={() => shiftsList.setExpanded(!shiftsList.expanded)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {establishmentId && (
        <ShiftDetailDialog
          open={!!detailShift}
          onOpenChange={(open) => !open && setDetailShift(null)}
          shift={detailShift}
          establishmentId={establishmentId}
          allShifts={shifts}
        />
      )}
    </div>
  );
}

/* ==================== FINANCE TAB ==================== */
type PeriodFilter = 'day' | 'week' | 'month' | 'year' | 'custom';

function getDateRange(period: PeriodFilter): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;
  switch (period) {
    case 'day':
      from = new Date(to);
      break;
    case 'week':
      from = new Date(to);
      from.setDate(from.getDate() - from.getDay()); // start of week (Sunday)
      break;
    case 'month':
      from = new Date(to.getFullYear(), to.getMonth(), 1);
      break;
    case 'year':
      from = new Date(to.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(to);
  }
  return { from, to };
}

function FinanceTab({ establishmentId, userId }: { establishmentId: string | null; userId?: string }) {
  const queryClient = useQueryClient();
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'income' | 'expense'>('expense');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => getDateRange('month').from);
  const [dateTo, setDateTo] = useState<Date | undefined>(() => getDateRange('month').to);

  const handlePeriodChange = (period: PeriodFilter) => {
    setPeriodFilter(period);
    if (period !== 'custom') {
      const range = getDateRange(period);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const { data: categories = [] } = useQuery({
    queryKey: ['finance-categories', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('finance_categories')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['finance-transactions', establishmentId],
    queryFn: async () => {
      // Manual transactions
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

      // Sales from closed orders. A closed table already creates an automatic
      // "Ventas" finance transaction, so only synthesize rows for legacy orders
      // without a matching movement (same date + amount) to avoid double counting.
      const salesKeys = new Set(
        (manualTx || [])
          .filter((t: any) => SALES_CATEGORY_RE.test(t.finance_categories?.name || ''))
          .map((t: any) => `${t.date}|${Number(t.amount).toFixed(2)}`)
      );

      const salesTx = (closedOrders || [])
        .filter((o: any) => !salesKeys.has(`${toArgDate(o.created_at)}|${Number(o.total).toFixed(2)}`))
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

      // Combine and sort by date desc
      const all = [...(manualTx || []), ...salesTx].sort((a: any, b: any) => b.date.localeCompare(a.date));
      return all;
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

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('finance_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
      toast.success('Categoría eliminada');
    },
    onError: () => toast.error('Error al eliminar (puede tener transacciones asociadas)'),
  });

  const createTransaction = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('finance_transactions').insert({
        establishment_id: establishmentId!,
        category_id: txCategoryId,
        type: txType,
        amount: parseAmount(txAmount),
        description: txDescription || null,
        date: txDate,
        created_by: userId!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      setShowTxDialog(false);
      setTxAmount('');
      setTxDescription('');
      setTxCategoryId('');
      toast.success('Transacción registrada');
    },
    onError: () => toast.error('Error al registrar'),
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('finance_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      toast.success('Transacción eliminada');
    },
  });

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

  return (
    <div className="space-y-4 mt-4">
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

      {/* Period filters + Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-md border border-input overflow-hidden">
          {([
            { key: 'day', label: 'Día' },
            { key: 'week', label: 'Semana' },
            { key: 'month', label: 'Mes' },
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
        <Button onClick={() => setShowTxDialog(true)}><Plus className="h-4 w-4 mr-1" /> Registrar movimiento</Button>
        <Button variant="outline" onClick={() => setShowCatDialog(true)}><Plus className="h-4 w-4 mr-1" /> Nueva categoría</Button>
      </div>

      {/* Categories list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Categorías</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {categories.map((c: any) => (
              <Badge key={c.id} variant={c.type === 'income' ? 'default' : 'destructive'} className="flex items-center gap-1 px-3 py-1">
                {c.name}
                <button onClick={() => deleteCategory.mutate(c.id)} className="ml-1 hover:opacity-70"><Trash2 className="h-3 w-3" /></button>
              </Badge>
            ))}
            {categories.length === 0 && <span className="text-sm text-muted-foreground">No hay categorías. Creá una para empezar.</span>}
          </div>
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
                  <TableCell>
                    {t.description || '-'}
                    {t.notes && <span className="block text-xs text-muted-foreground">{t.notes}</span>}
                  </TableCell>
                  <TableCell className={`font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {!(t as any)._isSale && (
                      <Button size="icon" variant="ghost" onClick={() => deleteTransaction.mutate(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <Input placeholder="Nombre (ej: Luz, Alquiler...)" value={catName} onChange={e => setCatName(e.target.value)} />
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

      {/* Create transaction dialog */}
      <Dialog open={showTxDialog} onOpenChange={setShowTxDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar movimiento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={txType} onValueChange={(v: any) => setTxType(v)}>
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
          </div>
          <DialogFooter>
            <Button onClick={() => createTransaction.mutate()} disabled={!txCategoryId || !txAmount}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

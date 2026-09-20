import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DollarSign, ShoppingCart, Receipt, Lock, PlayCircle, Wallet, AlertTriangle, CheckCircle, RotateCcw, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useActiveShift } from '@/hooks/useActiveShift';
import ShiftReportTicket, { ShiftReportBody, ShiftReportData } from '@/components/cashier/ShiftReportTicket';
import { summarizeManualMovements, computeExpectedCash } from '@/lib/cashReconciliation';
import { getOrdersCutoff } from '@/lib/shiftScope';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';



export default function ShiftSummary() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const { log: auditLog } = useAuditLog();
  const userId = session?.user?.id;

  const [initialCashInput, setInitialCashInput] = useState('');
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showPendingTables, setShowPendingTables] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [report, setReport] = useState<ShiftReportData | null>(null);
  const [reportReprint, setReportReprint] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Shared shift state (same cache key used by Mesas)
  const { activeShift } = useActiveShift();

  const { data: establishment } = useQuery({
    queryKey: ['establishment-name', establishmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('establishments')
        .select('name')
        .eq('id', establishmentId!)
        .maybeSingle();
      return data;
    },
    enabled: !!establishmentId,
  });

  // Builds the printable report for any shift (open window or closed range)
  const buildReport = async (shift: any, actualCash: number): Promise<ShiftReportData> => {
    const from = shift.opened_at ?? `${shift.shift_date}T00:00:00.000Z`;
    const to = shift.closed_at ?? new Date().toISOString();

    const [ordersRes, expensesRes, invoicesRes, fiscalRes, profileRes, courtesyRes, accountsRes, anomaliesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('total, payment_method')
        .eq('establishment_id', establishmentId!)
        .eq('status', 'closed')
        .gte('created_at', from)
        .lte('created_at', to),
      supabase
        .from('finance_transactions')
        .select('type, amount, affects_cash, finance_categories(name)')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', from)
        .lte('created_at', to),

      supabase
        .from('invoices')
        .select('tip_amount')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', from)
        .lte('created_at', to),
      supabase
        .from('fiscal_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId!)
        .gte('created_at', from)
        .lte('created_at', to),
      shift.closed_by
        ? supabase.from('profiles').select('full_name').eq('id', shift.closed_by).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase
        .from('courtesy_charges')
        .select('account_id, sale_amount, table_number')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', from)
        .lte('created_at', to),
      supabase
        .from('courtesy_accounts')
        .select('id, name')
        .eq('establishment_id', establishmentId!),
      supabase
        .from('audit_logs')
        .select('action, record_id, details, created_at')
        .eq('establishment_id', establishmentId!)
        .in('action', ['close_table_zero', 'close_table_excluded_items', 'order_item_deleted'])
        .gte('created_at', from)
        .lte('created_at', to),
    ]);

    const accountNames = new Map<string, string>(
      ((accountsRes as any).data ?? []).map((a: any) => [a.id, a.name]),
    );
    const courtesyRows = ((courtesyRes as any).data ?? []) as any[];
    const courtesyByPerson = new Map<string, { amount: number; count: number }>();
    for (const c of courtesyRows) {
      const name = c.account_id ? accountNames.get(c.account_id) ?? 'Sin asignar' : 'Sin asignar';
      const cur = courtesyByPerson.get(name) ?? { amount: 0, count: 0 };
      cur.amount += Number(c.sale_amount || 0);
      cur.count += 1;
      courtesyByPerson.set(name, cur);
    }


    const orders = ordersRes.data ?? [];
    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
    const sumBy = (m: string) =>
      orders.filter(o => o.payment_method === m).reduce((s, o) => s + Number(o.total), 0);
    const cashSales = sumBy('cash');
    const txs = ((expensesRes as any).data ?? []).map((t: any) => ({
      type: t.type,
      amount: t.amount,
      affects_cash: t.affects_cash,
      categoryName: t.finance_categories?.name ?? '-',
    }));
    const { manualIncome, manualExpenses } = summarizeManualMovements(txs);
    const initial = Number(shift.initial_cash ?? 0);

    // Anomalías del turno: mesas cerradas en $0, ítems excluidos y borrados de ítems
    const anomalies = (((anomaliesRes as any).data ?? []) as any[]).map(a => {
      const d = a.details ?? {};
      const excluded = Array.isArray(d.excluded_items) ? d.excluded_items : [];
      const excludedAmount = excluded.reduce(
        (s: number, i: any) => s + Number(i.unit_price || 0) * Number(i.qty || 0),
        0,
      );
      return {
        action: a.action as string,
        tableNumber: d.table_number ?? null,
        reason: d.reason ?? null,
        amount: a.action === 'close_table_zero' ? Number(d.total || 0) : excludedAmount,
        itemsCount: a.action === 'order_item_deleted' ? Number(d.quantity || 1) : excluded.length,
        time: a.created_at as string,
      };
    });



    return {
      establishmentName: establishment?.name,
      shiftDate: shift.shift_date,
      openedAt: shift.opened_at,
      closedAt: shift.closed_at ?? new Date().toISOString(),
      closedByName: (profileRes as any)?.data?.full_name ?? null,
      totalSales,
      closedOrders: orders.length,
      avgTicket: orders.length ? totalSales / orders.length : 0,
      cash: cashSales,
      card: sumBy('card'),
      transfer: sumBy('transfer'),
      initialCash: initial,
      cashIncome: cashSales + manualIncome,
      cashExpenses: manualExpenses,
      expectedCash: computeExpectedCash({ initialCash: initial, cashSales, manualIncome, manualExpenses }),

      actualCash,
      tips: (invoicesRes.data ?? []).reduce((s: number, i: any) => s + Number(i.tip_amount ?? 0), 0),
      fiscalCount: fiscalRes.count ?? 0,
      courtesyTotal: courtesyRows.reduce((s, c) => s + Number(c.sale_amount || 0), 0),
      courtesyCount: courtesyRows.length,
      courtesyByPerson: Array.from(courtesyByPerson.entries()).map(([name, v]) => ({ name, ...v })),
      anomalies,
    };
  };



  // Stats for orders since shift opened
  const { data: stats } = useQuery({
    queryKey: ['shift-stats', establishmentId, activeShift?.id],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, total, status, payment_method')
        .eq('establishment_id', establishmentId!)
        .eq('status', 'closed');

      if (activeShift?.opened_at) {
        query = query.gte('created_at', activeShift.opened_at);
      }

      const { data, error } = await query;
      if (error) throw error;

      const totalSales = data.reduce((s, o) => s + Number(o.total), 0);
      const avgTicket = data.length > 0 ? totalSales / data.length : 0;
      const cash = data.filter(o => o.payment_method === 'cash').reduce((s, o) => s + Number(o.total), 0);
      const card = data.filter(o => o.payment_method === 'card').reduce((s, o) => s + Number(o.total), 0);
      const transfer = data.filter(o => o.payment_method === 'transfer').reduce((s, o) => s + Number(o.total), 0);
      return { totalSales, closedOrders: data.length, avgTicket, cash, card, transfer };
    },
    enabled: !!establishmentId,
    refetchInterval: 30000,
  });

  // Manual cash movements during this shift (excludes auto sales and tips)
  const { data: manualMovements = { manualIncome: 0, manualExpenses: 0 } } = useQuery({
    queryKey: ['shift-manual-movements', establishmentId, activeShift?.id],
    queryFn: async () => {
      if (!activeShift?.opened_at) return { manualIncome: 0, manualExpenses: 0 };
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('type, amount, affects_cash, finance_categories(name)')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', activeShift.opened_at);
      if (error) throw error;
      const txs = (data ?? []).map((t: any) => ({
        type: t.type,
        amount: t.amount,
        affects_cash: t.affects_cash,
        categoryName: t.finance_categories?.name ?? '-',
      }));
      const { manualIncome, manualExpenses } = summarizeManualMovements(txs);
      return { manualIncome, manualExpenses };
    },
    enabled: !!establishmentId && !!activeShift,
    refetchInterval: 30000,
  });


  // Past closed shifts
  const { data: pastShifts = [] } = useQuery({
    queryKey: ['past-shifts', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_controls')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  // Mesas pendientes: ocupadas/en cobro, o con pedidos activos del turno actual
  const { data: openTables = [] } = useQuery({
    queryKey: ['open-tables-for-shift', establishmentId, activeShift?.id],
    queryFn: async () => {
      const cutoff = getOrdersCutoff(activeShift as any);
      const [tablesRes, ordersRes] = await Promise.all([
        supabase
          .from('tables')
          .select('id, number, status')
          .eq('establishment_id', establishmentId!),
        supabase
          .from('orders')
          .select('table_id, status, created_at')
          .eq('establishment_id', establishmentId!)
          .in('status', ['new', 'preparing', 'ready', 'delivered'])
          .gte('created_at', cutoff),
      ]);
      if (tablesRes.error) throw tablesRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const withOrders = new Set((ordersRes.data || []).map((o: any) => o.table_id));
      return (tablesRes.data || [])
        .filter((t: any) => ['occupied', 'billing'].includes(t.status) || withOrders.has(t.id))
        .map((t: any) => ({
          number: t.number,
          status: t.status,
          reason: ['occupied', 'billing'].includes(t.status)
            ? (t.status === 'billing' ? 'Pendiente de cobro' : 'Mesa ocupada')
            : 'Tiene pedidos sin cobrar',
        }))
        .sort((a: any, b: any) => a.number - b.number);
    },
    enabled: !!establishmentId && !!activeShift,
  });

  const hasOpenTables = openTables.length > 0;

  const initialCash = Number(activeShift?.initial_cash ?? 0);
  const cashSales = stats?.cash ?? 0;
  const manualIncome = manualMovements.manualIncome;
  const cashExpenses = manualMovements.manualExpenses;
  const cashIncome = cashSales + manualIncome;
  const expectedCash = computeExpectedCash({ initialCash, cashSales, manualIncome, manualExpenses: cashExpenses });


  const openShift = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      const { error } = await supabase.from('shift_controls').insert({
        establishment_id: establishmentId!,
        shift_date: today,
        is_controlled: false,
        opened_at: now,
        initial_cash: Number(initialCashInput) || 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      auditLog('open_shift', 'shift_controls', undefined, { initial_cash: Number(initialCashInput) || 0 });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['past-shifts'] });
      setInitialCashInput('');
      toast.success('Turno abierto');
    },
    onError: () => toast.error('Error al abrir turno'),
  });

  const closeShift = useMutation({
    mutationFn: async () => {
      if (!activeShift) return null;
      const actualCash = Number(actualCashInput);
      const difference = actualCash - expectedCash;
      const closedAt = new Date().toISOString();
      const { error } = await supabase
        .from('shift_controls')
        .update({
          closed_at: closedAt,
          closed_by: userId,
          actual_cash: actualCash,
          cash_difference: difference,
        })
        .eq('id', activeShift.id);
      if (error) throw error;

      // No se cancelan pedidos ni se liberan mesas en silencio: el cierre solo
      // ocurre cuando ya no quedan mesas pendientes.



      return await buildReport({ ...activeShift, closed_at: closedAt, closed_by: userId }, actualCash);
    },
    onSuccess: (data) => {
      auditLog('close_shift', 'shift_controls', activeShift?.id, { actual_cash: Number(actualCashInput), expected: expectedCash });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['past-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shift-stats'] });
      setShowCloseDialog(false);
      setShowCloseConfirm(false);
      setActualCashInput('');
      if (data) {
        setReport(data);
        setReportReprint(false);
        setShowReport(true);
      }
      toast.success('Turno cerrado correctamente');
    },
    onError: () => toast.error('Error al cerrar turno'),
  });

  const openReportForShift = async (shift: any) => {
    try {
      const data = await buildReport(shift, Number(shift.actual_cash ?? 0));
      setReport(data);
      setReportReprint(true);
      setShowReport(true);
    } catch {
      toast.error('No se pudo generar el reporte');
    }
  };


  const reopenShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await supabase
        .from('shift_controls')
        .update({
          closed_at: null,
          closed_by: null,
          actual_cash: null,
          cash_difference: null,
        })
        .eq('id', shiftId);
      if (error) throw error;
    },
    onSuccess: (_d, shiftId) => {
      auditLog('reopen_shift', 'shift_controls', shiftId);
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['past-shifts'] });
      toast.success('Turno reabierto correctamente');
    },
    onError: () => toast.error('Error al reabrir turno'),
  });

  const isShiftOpen = !!activeShift;

  const cards = [
    { title: 'Ventas del turno', value: `$${(stats?.totalSales ?? 0).toFixed(2)}`, icon: DollarSign },
    { title: 'Pedidos cerrados', value: stats?.closedOrders ?? 0, icon: ShoppingCart },
    { title: 'Ticket promedio', value: `$${(stats?.avgTicket ?? 0).toFixed(2)}`, icon: Receipt },
  ];

  // Can only reopen the most recent closed shift (and only if no shift is currently open)
  const canReopenShift = (shiftId: string) => {
    return !isShiftOpen && pastShifts.length > 0 && pastShifts[0].id === shiftId;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Resumen de turno</h1>

      {/* Shift status card */}
      <Card>
        <CardContent className="pt-6">
          {isShiftOpen ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PlayCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-semibold">Turno abierto</p>
                    <p className="text-sm text-muted-foreground">
                      Abierto el {new Date(activeShift.opened_at!).toLocaleString('es')} — Fondo inicial: ${initialCash.toFixed(2)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (hasOpenTables) {
                      setShowPendingTables(true);
                      return;
                    }
                    setShowCloseDialog(true);
                  }}
                  disabled={closeShift.isPending}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Cerrar turno
                </Button>
              </div>
              {hasOpenTables && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
                  <p className="text-sm font-medium text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {openTables.length} mesa(s) sin cerrar: {openTables.map((t: any) => `Mesa ${t.number}`).join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recordá: imprimir la pre-cuenta <strong>no cierra la mesa</strong>. Hay que cobrarla desde Mesas para liberarla.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-semibold">No hay turno abierto</p>
                <p className="text-sm text-muted-foreground">Abrí un turno para empezar a registrar ventas</p>
              </div>
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="initial-cash">Fondo inicial en efectivo ($)</Label>
                  <Input
                    id="initial-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={initialCashInput}
                    onChange={e => setInitialCashInput(e.target.value)}
                    className="w-48"
                  />
                </div>
                <Button onClick={() => openShift.mutate()} disabled={openShift.isPending}>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Abrir turno
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isShiftOpen && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map(c => (
              <Card key={c.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
                  <c.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{c.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cash balance card */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Balance de efectivo en caja
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Fondo inicial</TableCell>
                    <TableCell className="text-right">${initialCash.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-green-600">+ Ingresos en efectivo</TableCell>
                    <TableCell className="text-right text-green-600">${cashIncome.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-red-600">− Egresos en efectivo</TableCell>
                    <TableCell className="text-right text-red-600">${cashExpenses.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold text-base">Efectivo esperado en caja</TableCell>
                    <TableCell className="text-right font-bold text-base">${expectedCash.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose por método de pago</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Efectivo</TableCell>
                    <TableCell className="text-right font-bold">${(stats?.cash ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Tarjeta</TableCell>
                    <TableCell className="text-right font-bold">${(stats?.card ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Transferencia</TableCell>
                    <TableCell className="text-right font-bold">${(stats?.transfer ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Close shift dialog — step 1: cash count */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arqueo y cierre de turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Fondo inicial</span>
                <span className="font-medium">${initialCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>+ Ingresos en efectivo</span>
                <span className="font-medium">${cashIncome.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>− Egresos en efectivo</span>
                <span className="font-medium">${cashExpenses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Efectivo esperado</span>
                <span>${expectedCash.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="actual-cash">Efectivo real contado en caja ($)</Label>
              <Input
                id="actual-cash"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={actualCashInput}
                onChange={e => setActualCashInput(e.target.value)}
                autoFocus
              />
            </div>

            {actualCashInput && (
              <CashDifferenceDisplay expected={expectedCash} actual={Number(actualCashInput)} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowCloseDialog(false);
                setShowCloseConfirm(true);
              }}
              disabled={!actualCashInput}
            >
              Siguiente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Close shift dialog — step 2: confirmation */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Estás seguro?
            </DialogTitle>
            <DialogDescription>
              Estás a punto de cerrar el turno. Esta acción registrará el arqueo de caja con el efectivo ingresado. Si te equivocaste, podrás reabrir el último turno cerrado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => closeShift.mutate()}
              disabled={closeShift.isPending}
            >
              {closeShift.isPending ? 'Cerrando...' : 'Sí, cerrar turno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift close report */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reporte de cierre de turno</DialogTitle>
            <DialogDescription>Vista previa del ticket de 80 mm.</DialogDescription>
          </DialogHeader>
          {report && (
            <div className="rounded-md border p-3 text-foreground">
              <ShiftReportBody data={report} reprint={reportReprint} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReport(false)}>Cerrar</Button>
            <Button onClick={() => setTimeout(() => window.print(), 100)}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {report && showReport && <ShiftReportTicket data={report} reprint={reportReprint} />}



      {/* Past shifts */}
      {pastShifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Turnos anteriores</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead>Fondo</TableHead>
                  <TableHead>Diferencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastShifts.map((s: any) => {
                  const diff = s.cash_difference != null ? Number(s.cash_difference) : null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{new Date(s.shift_date + 'T12:00:00').toLocaleDateString('es')}</TableCell>
                      <TableCell>{s.opened_at ? new Date(s.opened_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                      <TableCell>{s.closed_at ? new Date(s.closed_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                      <TableCell>${Number(s.initial_cash ?? 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {diff != null ? (
                          <span className={diff === 0 ? 'text-green-600' : 'text-red-600'}>
                            {diff >= 0 ? '+' : ''}${diff.toFixed(2)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {s.is_controlled
                          ? <Badge className="bg-green-600">Controlado</Badge>
                          : <Badge variant="outline">Pendiente</Badge>
                        }
                      </TableCell>
                      <TableCell className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openReportForShift(s)}>
                          <Printer className="h-3 w-3 mr-1" />
                          Reporte
                        </Button>
                        {canReopenShift(s.id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reopenShift.mutate(s.id)}
                            disabled={reopenShift.isPending}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reabrir
                          </Button>
                        )}
                      </TableCell>

                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showPendingTables} onOpenChange={setShowPendingTables}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              No se puede cerrar el turno
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Todavía hay {openTables.length} mesa(s) sin cerrar. Cobralas o liberalas desde
                  la sección Mesas para poder cerrar el turno.
                </p>
                <ul className="space-y-1">
                  {openTables.map((t: any) => (
                    <li
                      key={t.number}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-foreground">Mesa {t.number}</span>
                      <Badge variant="outline">{t.reason}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="text-xs">
                  Ojo: imprimir la <strong>pre-cuenta no cierra la mesa</strong>. La mesa se cierra
                  recién cuando se registra el cobro.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowPendingTables(false)}>
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CashDifferenceDisplay({ expected, actual }: { expected: number; actual: number }) {
  const diff = actual - expected;
  if (Math.abs(diff) < 0.01) {
    return (
      <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg p-3">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium">¡Arqueo perfecto! La caja cuadra.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3">
      <AlertTriangle className="h-5 w-5" />
      <span className="font-medium">
        Diferencia de ${Math.abs(diff).toFixed(2)} ({diff > 0 ? 'sobrante' : 'faltante'})
      </span>
    </div>
  );
}

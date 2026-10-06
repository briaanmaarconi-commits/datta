import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, Star, TrendingUp, TrendingDown, Users, UtensilsCrossed,
  CreditCard, Banknote, ArrowLeftRight, Clock, Receipt, HandCoins, Wallet,
} from 'lucide-react';

interface ShiftDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: any;
  establishmentId: string;
  allShifts: any[];
}

import { isAutomaticSaleTx, isTipTx, summarizeManualMovements, computeExpectedCash } from '@/lib/cashReconciliation';

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;


export default function ShiftDetailDialog({ open, onOpenChange, shift, establishmentId, allShifts }: ShiftDetailDialogProps) {
  const { data } = useQuery({
    queryKey: ['shift-detail', shift?.id],
    queryFn: async () => {
      const from = shift.opened_at ?? `${shift.shift_date}T00:00:00.000Z`;
      const to = shift.closed_at ?? new Date().toISOString();

      const [ordersRes, invoicesRes, txRes, fiscalRes] = await Promise.all([
        db
          .from('orders')
          .select('id, total, table_id, created_by, created_at, payment_method, order_items(quantity, product_id, products(name))')
          .eq('establishment_id', establishmentId)
          .eq('status', 'closed')
          .gte('created_at', from)
          .lte('created_at', to),
        db
          .from('invoices')
          .select('tip_amount, tip_waiter_id, tip_payment_method')
          .eq('establishment_id', establishmentId)
          .gte('created_at', from)
          .lte('created_at', to),
        db
          .from('finance_transactions')
          .select('id, type, amount, description, notes, affects_cash, created_at, finance_categories(name)')
          .eq('establishment_id', establishmentId)
          .gte('created_at', from)
          .lte('created_at', to)
          .order('created_at', { ascending: true }),
        db
          .from('fiscal_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('establishment_id', establishmentId)
          .gte('created_at', from)
          .lte('created_at', to),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      const orders = ordersRes.data ?? [];

      const totalSales = orders.reduce((s: number, o: any) => s + Number(o.total), 0);
      const orderCount = orders.length;
      const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;

      // Payment methods
      const byMethod = (m: string) => {
        const list = orders.filter((o: any) => o.payment_method === m);
        return { amount: list.reduce((s: number, o: any) => s + Number(o.total), 0), count: list.length };
      };
      const payments = {
        cash: byMethod('cash'),
        card: byMethod('card'),
        transfer: byMethod('transfer'),
      };

      // Products
      const productCount: Record<string, { name: string; qty: number }> = {};
      let itemsSold = 0;
      orders.forEach((o: any) => {
        (o.order_items || []).forEach((item: any) => {
          const name = item.products?.name || 'Desconocido';
          const pid = item.product_id;
          if (!productCount[pid]) productCount[pid] = { name, qty: 0 };
          productCount[pid].qty += item.quantity;
          itemsSold += item.quantity;
        });
      });
      const topProducts = Object.values(productCount).sort((a, b) => b.qty - a.qty).slice(0, 5);
      const starProduct = topProducts[0] || null;

      // Waiters: tables + sales
      const waiterAgg: Record<string, { tables: Set<string>; sales: number; orders: number }> = {};
      orders.forEach((o: any) => {
        const wid = o.created_by || 'cliente';
        if (!waiterAgg[wid]) waiterAgg[wid] = { tables: new Set(), sales: 0, orders: 0 };
        waiterAgg[wid].tables.add(o.table_id);
        waiterAgg[wid].sales += Number(o.total);
        waiterAgg[wid].orders += 1;
      });

      // Tips
      const invoices = invoicesRes.data ?? [];
      const tipsTotal = invoices.reduce((s: number, i: any) => s + Number(i.tip_amount ?? 0), 0);
      const tipsByWaiter: Record<string, number> = {};
      invoices.forEach((i: any) => {
        const amt = Number(i.tip_amount ?? 0);
        if (amt <= 0) return;
        const wid = i.tip_waiter_id || 'pozo';
        tipsByWaiter[wid] = (tipsByWaiter[wid] || 0) + amt;
      });

      // Finance movements: only MANUAL ones affect the arqueo.
      // Sales ("Ventas") are auto-created on table close and already counted in cash sales.
      // Tips are neutral (income + mirror expense).
      const allTx = (txRes.data ?? []).map((t: any) => ({
        ...t,
        categoryName: t.finance_categories?.name ?? '-',
        isAuto: isAutomaticSaleTx({ ...t, categoryName: t.finance_categories?.name ?? '-' }),
      }));
      const movements = allTx.filter((t: any) => !isTipTx(t));
      const { manualIncome: cashIncomeExtra, manualExpenses: cashExpenses } = summarizeManualMovements(allTx);

      const initialCash = Number(shift.initial_cash ?? 0);
      const expectedCash = computeExpectedCash({
        initialCash,
        cashSales: payments.cash.amount,
        manualIncome: cashIncomeExtra,
        manualExpenses: cashExpenses,
      });

      const actualCash = shift.actual_cash != null ? Number(shift.actual_cash) : null;
      const difference = actualCash != null ? actualCash - expectedCash : null;

      // Names
      const ids = new Set<string>();
      Object.keys(waiterAgg).forEach(id => { if (id !== 'cliente') ids.add(id); });
      Object.keys(tipsByWaiter).forEach(id => { if (id !== 'pozo') ids.add(id); });
      [shift.closed_by, shift.controlled_by].forEach((id: any) => { if (id) ids.add(id); });
      const names: Record<string, string> = {};
      if (ids.size > 0) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(ids));
        (profiles || []).forEach((p: any) => { names[p.id] = p.full_name || 'Sin nombre'; });
      }

      const waiterStats = Object.entries(waiterAgg).map(([wid, v]) => ({
        name: wid === 'cliente' ? 'Pedido cliente' : (names[wid] || 'Desconocido'),
        tables: v.tables.size,
        orders: v.orders,
        sales: v.sales,
      })).sort((a, b) => b.sales - a.sales);

      const tipsList = Object.entries(tipsByWaiter).map(([wid, amount]) => ({
        name: wid === 'pozo' ? 'Pozo común / sin asignar' : (names[wid] || 'Desconocido'),
        amount,
      })).sort((a, b) => b.amount - a.amount);

      const totalTablesAttended = new Set(orders.map((o: any) => o.table_id)).size;

      // Duration + sales per hour
      let durationHours: number | null = null;
      if (shift.opened_at && shift.closed_at) {
        durationHours = (new Date(shift.closed_at).getTime() - new Date(shift.opened_at).getTime()) / 3600000;
      }
      const salesPerHour = durationHours && durationHours > 0.05 ? totalSales / durationHours : null;

      // Previous shift avg ticket for comparison
      const sortedShifts = [...allShifts].filter(s => s.closed_at).sort((a, b) =>
        new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
      );
      const currentIdx = sortedShifts.findIndex(s => s.id === shift.id);
      const prevShift = currentIdx >= 0 && currentIdx < sortedShifts.length - 1 ? sortedShifts[currentIdx + 1] : null;
      let prevAvgTicket: number | null = null;
      if (prevShift && prevShift.count > 0) {
        prevAvgTicket = prevShift.total / prevShift.count;
      }

      return {
        totalSales, orderCount, avgTicket, starProduct, topProducts, itemsSold,
        waiterStats, totalTablesAttended, prevAvgTicket, payments,
        movements, cashIncomeExtra, cashExpenses, initialCash, expectedCash, actualCash, difference,
        tipsTotal, tipsList,
        fiscalCount: fiscalRes.count ?? 0,
        durationHours, salesPerHour,
        closedByName: shift.closed_by ? (names[shift.closed_by] || 'Desconocido') : null,
        controlledByName: shift.controlled_by ? (names[shift.controlled_by] || 'Desconocido') : null,
      };
    },
    enabled: open && !!shift,
  });

  const ticketTrend = data && data.prevAvgTicket !== null
    ? data.avgTicket >= data.prevAvgTicket ? 'up' : 'down'
    : null;

  const pct = (v: number) => (data && data.totalSales > 0 ? `${((v / data.totalSales) * 100).toFixed(0)}%` : '0%');

  const diff = data?.difference ?? null;
  const diffLabel = diff == null ? null : Math.abs(diff) < 0.01 ? 'CAJA OK' : diff > 0 ? 'SOBRANTE' : 'FALTANTE';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del turno — {shift ? new Date(shift.shift_date + 'T12:00:00').toLocaleDateString('es') : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta */}
          {shift && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {shift.opened_at ? new Date(shift.opened_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '-'}
                {' → '}
                {shift.closed_at ? new Date(shift.closed_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '-'}
                {data?.durationHours != null && ` (${data.durationHours.toFixed(1)} h)`}
              </span>
              {data?.closedByName && <span>Cierra: {data.closedByName}</span>}
              {data?.controlledByName && <span>Controla: {data.controlledByName}</span>}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Ventas totales</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-xl font-bold">{money(data?.totalSales ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{data?.orderCount ?? 0} pedidos · {data?.itemsSold ?? 0} ítems</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> Producto estrella</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-sm font-bold">{data?.starProduct?.name ?? '-'}</p>
                {data?.starProduct && <p className="text-xs text-muted-foreground">{data.starProduct.qty} unidades</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  {ticketTrend === 'up' ? <TrendingUp className="h-3 w-3 text-green-600" /> : ticketTrend === 'down' ? <TrendingDown className="h-3 w-3 text-red-600" /> : <DollarSign className="h-3 w-3" />}
                  Ticket promedio
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-xl font-bold">{money(data?.avgTicket ?? 0)}</p>
                {ticketTrend && (
                  <Badge variant={ticketTrend === 'up' ? 'default' : 'destructive'} className="text-[10px] mt-1">
                    {ticketTrend === 'up' ? '↑ Subió' : '↓ Bajó'} vs turno anterior
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><UtensilsCrossed className="h-3 w-3" /> Mesas atendidas</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-xl font-bold">{data?.totalTablesAttended ?? 0}</p>
                {data?.salesPerHour != null && (
                  <p className="text-xs text-muted-foreground">{money(data.salesPerHour)} / hora</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment methods */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-1"><CreditCard className="h-4 w-4" /> Métodos de pago</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { key: 'cash', label: 'Efectivo', icon: <Banknote className="h-3 w-3" /> },
                    { key: 'card', label: 'Tarjeta', icon: <CreditCard className="h-3 w-3" /> },
                    { key: 'transfer', label: 'Transferencia', icon: <ArrowLeftRight className="h-3 w-3" /> },
                  ].map(m => {
                    const v = (data?.payments as any)?.[m.key] ?? { amount: 0, count: 0 };
                    return (
                      <TableRow key={m.key}>
                        <TableCell className="flex items-center gap-2">{m.icon} {m.label}</TableCell>
                        <TableCell className="text-right">{v.count}</TableCell>
                        <TableCell className="text-right font-medium">{money(v.amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{pct(v.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Arqueo */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-1"><Wallet className="h-4 w-4" /> Arqueo de caja</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Fondo inicial</span><span>{money(data?.initialCash ?? 0)}</span></div>
              <div className="flex justify-between"><span>+ Ventas en efectivo</span><span>{money(data?.payments?.cash.amount ?? 0)}</span></div>
              <div className="flex justify-between"><span>+ Otros ingresos manuales</span><span>{money(data?.cashIncomeExtra ?? 0)}</span></div>
              <div className="flex justify-between"><span>− Egresos manuales</span><span>{money(data?.cashExpenses ?? 0)}</span></div>

              <div className="flex justify-between font-bold border-t pt-1"><span>= Efectivo esperado</span><span>{money(data?.expectedCash ?? 0)}</span></div>
              <div className="flex justify-between font-bold">
                <span>Efectivo contado</span>
                <span>{data?.actualCash != null ? money(data.actualCash) : '-'}</span>
              </div>
              {diffLabel && (
                <div className="pt-2">
                  <Badge className={diffLabel === 'CAJA OK' ? 'bg-green-600' : diffLabel === 'SOBRANTE' ? 'bg-amber-600' : 'bg-red-600'}>
                    {diffLabel}{diffLabel !== 'CAJA OK' ? ` ${money(Math.abs(diff!))}` : ''}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Movimientos de caja */}
          {data?.movements && data.movements.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-1"><Receipt className="h-4 w-4" /> Movimientos de caja del turno</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.movements.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">{new Date(t.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            {t.categoryName}
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {t.isAuto ? 'Auto' : 'Manual'}
                            </Badge>
                            {t.affects_cash === false && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">No afecta caja</Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-xs">
                          {t.description || '-'}
                          {t.notes && <span className="block text-muted-foreground">{t.notes}</span>}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                          {t.type === 'income' ? '+' : '−'}{money(Number(t.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Propinas */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-1"><HandCoins className="h-4 w-4" /> Propinas del turno</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-xl font-bold">{money(data?.tipsTotal ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">Informativo: no afecta el arqueo (ingreso y egreso espejo).</p>
              {data?.tipsList && data.tipsList.length > 0 && (
                <div className="mt-2 space-y-1 text-sm">
                  {data.tipsList.map((t, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{t.name}</span>
                      <span className="font-medium">{money(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top productos */}
          {data?.topProducts && data.topProducts.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-1"><Star className="h-4 w-4" /> Top 5 productos</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1 text-sm">
                {data.topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{i + 1}. {p.name}</span>
                    <span className="font-medium">{p.qty} u.</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Waiter breakdown */}
          {data?.waiterStats && data.waiterStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Desempeño por mozo</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mozo</TableHead>
                      <TableHead className="text-right">Mesas</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.waiterStats.map((w, i) => (
                      <TableRow key={i}>
                        <TableCell>{w.name}</TableCell>
                        <TableCell className="text-right">{w.tables}</TableCell>
                        <TableCell className="text-right">{w.orders}</TableCell>
                        <TableCell className="text-right font-bold">{money(w.sales)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {(data?.fiscalCount ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">Facturas fiscales emitidas en el turno: <strong>{data!.fiscalCount}</strong></p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useTipMode } from '@/hooks/useTipMode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HandCoins, Users, User, CreditCard, Smartphone, Banknote, Check, History, Info, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import TipsSettingsCard from './TipsSettingsCard';
import { tableLabel, tableCell } from '@/lib/ownDelivery';

type TipInvoice = {
  id: string;
  invoice_number: number;
  table_number: number;
  created_at: string;
  tip_amount: number;
  tip_payment_method: string | null;
  tip_waiter_id: string | null;
  tip_mode: string | null;
  tip_settled: boolean;
  tip_settled_at: string | null;
};

const PM_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
const PM_ICON: Record<string, any> = { cash: Banknote, card: CreditCard, transfer: Smartphone };

export default function TipsManagementTab() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const { data: tipMode = 'individual' } = useTipMode(establishmentId);
  const [showHistory, setShowHistory] = useState(false);

  const { data: tipInvoices = [] } = useQuery({
    queryKey: ['tip-invoices', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('invoices')
        .select('id, invoice_number, table_number, created_at, tip_amount, tip_payment_method, tip_waiter_id, tip_mode, tip_settled, tip_settled_at')
        .eq('establishment_id', establishmentId!)
        .gt('tip_amount', 0)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TipInvoice[];
    },
    enabled: !!establishmentId,
  });

  const { data: waiters = [] } = useQuery({
    queryKey: ['waiters-list', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('user_roles')
        .select('user_id, profiles:user_id(full_name, email)')
        .eq('establishment_id', establishmentId!)
        .eq('role', 'waiter');
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60_000,
  });

  const waiterName = (id: string | null) => {
    if (!id) return '—';
    const w = waiters.find((w: any) => w.user_id === id);
    return w?.profiles?.full_name || w?.profiles?.email || 'Mozo';
  };

  // Pending tips (only card/transfer require liquidation; cash in pool stays in caja)
  const pendingTips = useMemo(
    () => tipInvoices.filter(i => !i.tip_settled && (i.tip_payment_method === 'card' || i.tip_payment_method === 'transfer')),
    [tipInvoices]
  );

  const settledTips = useMemo(() => tipInvoices.filter(i => i.tip_settled), [tipInvoices]);

  // Group pending by waiter (individual) or as pool total
  const groupedPending = useMemo(() => {
    if (tipMode === 'pool') {
      const total = pendingTips.reduce((s, i) => s + Number(i.tip_amount), 0);
      return [{ key: 'pool', label: 'Pozo común', total, invoices: pendingTips }];
    }
    const map = new Map<string, { key: string; label: string; total: number; invoices: TipInvoice[] }>();
    for (const inv of pendingTips) {
      const key = inv.tip_waiter_id || 'unassigned';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: key === 'unassigned' ? 'Sin asignar' : waiterName(inv.tip_waiter_id),
          total: 0,
          invoices: [],
        });
      }
      const g = map.get(key)!;
      g.total += Number(inv.tip_amount);
      g.invoices.push(inv);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTips, tipMode, waiters]);

  const cashPoolTotal = useMemo(() => {
    if (tipMode !== 'pool') return 0;
    return tipInvoices
      .filter(i => !i.tip_settled && i.tip_payment_method === 'cash')
      .reduce((s, i) => s + Number(i.tip_amount), 0);
  }, [tipInvoices, tipMode]);

  // Settle a group: just mark invoices as settled.
  // The mirror expense was already created at the moment of charging the table,
  // so the balance is already neutral. This action only records "I handed cash to the waiter".
  const settle = useMutation({
    mutationFn: async (group: { label: string; invoices: TipInvoice[]; total: number }) => {
      const ids = group.invoices.map(i => i.id);
      const { error: upErr } = await db
        .from('invoices')
        .update({
          tip_settled: true,
          tip_settled_at: new Date().toISOString(),
        } as any)
        .in('id', ids);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tip-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      toast.success('Propinas liquidadas correctamente');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al liquidar'),
  });

  const totalPending = pendingTips.reduce((s, i) => s + Number(i.tip_amount), 0);
  const totalSettled = settledTips.reduce((s, i) => s + Number(i.tip_amount), 0);

  // Ranking de propinas por mozo (último mes calendario, modo individual)
  const monthlyRanking = useMemo(() => {
    if (tipMode !== 'individual') return [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const inv of tipInvoices) {
      if (!inv.tip_waiter_id) continue;
      if (new Date(inv.created_at) < monthStart) continue;
      const key = inv.tip_waiter_id;
      const name = waiterName(inv.tip_waiter_id);
      if (!map.has(key)) map.set(key, { name, total: 0, count: 0 });
      const r = map.get(key)!;
      r.total += Number(inv.tip_amount);
      r.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipInvoices, tipMode, waiters]);

  return (
    <div className="space-y-4 mt-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Las propinas son <strong>neutrales en el balance</strong>: cada ingreso registra automáticamente
          un egreso espejo (deuda al mozo). Por eso no aparecen en analíticas ni inflan tus ventas.
        </AlertDescription>
      </Alert>

      <TipsSettingsCard />

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <HandCoins className="h-4 w-4" /> Pendiente de liquidar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">${totalPending.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Solo tarjeta y transferencia</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <Check className="h-4 w-4" /> Total liquidado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">${totalSettled.toFixed(2)}</div>
          </CardContent>
        </Card>
        {tipMode === 'pool' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Banknote className="h-4 w-4" /> Pozo en efectivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${cashPoolTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Está físicamente en caja</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending settlements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {tipMode === 'pool' ? <Users className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
            Propinas pendientes de liquidar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {groupedPending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay propinas pendientes</p>
          ) : (
            <div className="space-y-3">
              {groupedPending.map(group => (
                <div key={group.key} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="font-semibold">{group.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {group.invoices.length} factura{group.invoices.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold text-emerald-600">${group.total.toFixed(2)}</div>
                      <Button
                        size="sm"
                        onClick={() => settle.mutate(group)}
                        disabled={settle.isPending}
                        className="gap-2"
                      >
                        <Check className="h-4 w-4" /> Marcar como pagado
                      </Button>
                    </div>
                  </div>
                  {/* Invoice details */}
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    {group.invoices.slice(0, 5).map(inv => {
                      const Icon = PM_ICON[inv.tip_payment_method || ''] || HandCoins;
                      return (
                        <div key={inv.id} className="flex items-center gap-2">
                          <Icon className="h-3 w-3" />
                          <span>#{inv.invoice_number} · {tableLabel(inv.table_number)}</span>
                          <span className="ml-auto font-medium text-foreground">${Number(inv.tip_amount).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    {group.invoices.length > 5 && (
                      <div className="text-xs italic">+{group.invoices.length - 5} más…</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking mensual por mozo (solo modo individual) */}
      {tipMode === 'individual' && monthlyRanking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-amber-500" />
              Ranking de propinas — mes en curso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlyRanking.map((r, i) => (
                <div key={r.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-200 text-slate-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.count} propina{r.count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-emerald-600">${r.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><History className="h-5 w-5 text-muted-foreground" /> Historial</span>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(s => !s)}>
              {showHistory ? 'Ocultar' : 'Ver'}
            </Button>
          </CardTitle>
        </CardHeader>
        {showHistory && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Mozo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipInvoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">{new Date(inv.created_at).toLocaleString('es')}</TableCell>
                    <TableCell>#{inv.invoice_number}</TableCell>
                    <TableCell>{tableCell(inv.table_number)}</TableCell>
                    <TableCell>{PM_LABEL[inv.tip_payment_method || ''] || '—'}</TableCell>
                    <TableCell>{inv.tip_mode === 'pool' ? 'Pozo' : waiterName(inv.tip_waiter_id)}</TableCell>
                    <TableCell className="text-right font-semibold">${Number(inv.tip_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      {inv.tip_settled ? (
                        <Badge className="bg-emerald-600">Liquidado</Badge>
                      ) : inv.tip_payment_method === 'cash' && inv.tip_mode !== 'pool' ? (
                        <Badge variant="outline">Efectivo (mozo)</Badge>
                      ) : (
                        <Badge variant="outline">Pendiente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {tipInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Sin propinas registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

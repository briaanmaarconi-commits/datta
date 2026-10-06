import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Gift, PauseCircle, RefreshCw, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SubscriptionPanel from '@/components/superadmin/SubscriptionPanel';
import { billing, fmtDate, money, STATUS_BADGE, STATUS_LABELS, type BillingClient, type BillingOverview } from '@/lib/billingApi';
import { daysBetweenDates } from '@/lib/utils';

function Stat({ title, value, icon, tone }: { title: string; value: string | number; icon: React.ReactNode; tone?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-bold ${tone ?? ''}`}>{value}</div></CardContent>
    </Card>
  );
}

function ClientsTable({ rows, empty, extra, onOpen }: { rows: BillingClient[]; empty: string; extra: (c: BillingClient) => React.ReactNode; onOpen: (c: BillingClient) => void }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead><TableHead>Estado</TableHead><TableHead>Vencimiento</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Precio</TableHead><TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.name}{c.city ? <span className="text-xs text-muted-foreground ml-1">({c.city})</span> : null}</TableCell>
            <TableCell><Badge variant={STATUS_BADGE[c.effective_status]}>{STATUS_LABELS[c.effective_status]}</Badge></TableCell>
            <TableCell>{fmtDate(c.next_due_date)}</TableCell>
            <TableCell className="text-sm">{extra(c)}</TableCell>
            <TableCell className="text-right">{money(c.agreed_price)}</TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onOpen(c)}>Gestionar</Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function SuperAdminBilling() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [grace, setGrace] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => billing<BillingOverview>('overview'),
    refetchInterval: 60_000,
  });

  const sweep = useMutation({
    mutationFn: () => billing<any>('sweep'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['billing-overview'] });
      toast.success(`Barrido listo: ${r.toPastDue.length} pasaron a vencido, ${r.suspended.length} suspendidos, ${r.recoveredFromMp} cobros recuperados de Mercado Pago`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveGrace = useMutation({
    mutationFn: () => billing('settings', { grace_days: Number(grace) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-overview'] }); toast.success('Días de gracia actualizados'); setGrace(''); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-muted-foreground">Cargando cobranzas…</p>;

  const clients = data.clients.filter((c) => c.is_active || c.effective_status !== 'cancelled');
  const pastDue = clients.filter((c) => c.effective_status === 'past_due').sort((a, b) => b.overdue_days - a.overdue_days);
  const soon = clients
    .filter((c) => ['active', 'trial'].includes(c.effective_status) && c.next_due_date && daysBetweenDates(data.today, c.next_due_date) <= 7)
    .sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)));
  const trials = clients.filter((c) => c.effective_status === 'trial');
  const suspended = clients.filter((c) => c.effective_status === 'suspended');
  const unconfigured = clients.filter((c) => !c.billing_configured && !['suspended', 'cancelled'].includes(c.effective_status));
  const selectedClient = data.clients.find((c) => c.id === selected) ?? null;
  const counts = data.totals.counts;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Cobranzas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Label className="whitespace-nowrap">Días de gracia: <strong>{data.grace_days}</strong></Label>
            <Input className="w-20" type="number" min={1} placeholder="nuevo" value={grace} onChange={(e) => setGrace(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!(Number(grace) > 0)} onClick={() => saveGrace.mutate()}>Cambiar</Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => sweep.mutate()} disabled={sweep.isPending}><RefreshCw className="h-4 w-4 mr-1" />Actualizar ahora</Button>
        </div>
      </div>

      {!data.mp_enabled && (
        <Card className="border-amber-500">
          <CardContent className="pt-4 text-sm">Mercado Pago todavía no está conectado en el servidor: podés registrar pagos a mano y dar pruebas gratis, pero no generar links de cobro automático.</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Stat title="MRR (clientes al día)" value={money(data.totals.mrr)} icon={<Wallet className="h-4 w-4" />} />
        <Stat title="Cobrado este mes" value={money(data.totals.collected_this_month)} icon={<Wallet className="h-4 w-4" />} tone="text-green-600" />
        <Stat title="Vencidos" value={counts.past_due} icon={<AlertTriangle className="h-4 w-4" />} tone={counts.past_due ? 'text-destructive' : ''} />
        <Stat title="En prueba gratis" value={counts.trial} icon={<Gift className="h-4 w-4" />} />
        <Stat title="Suspendidos" value={counts.suspended} icon={<PauseCircle className="h-4 w-4" />} tone={counts.suspended ? 'text-destructive' : ''} />
      </div>

      <Card className={pastDue.length ? 'border-destructive' : ''}>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Morosos ({pastDue.length})</CardTitle></CardHeader>
        <CardContent>
          <ClientsTable rows={pastDue} empty="Nadie debe nada. 🎉" onOpen={(c) => setSelected(c.id)}
            extra={(c) => <span className="text-destructive">{c.overdue_days} días de atraso — se suspende en {c.days_to_suspension} días</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Vencen en los próximos 7 días ({soon.length})</CardTitle></CardHeader>
        <CardContent>
          <ClientsTable rows={soon} empty="No hay vencimientos próximos." onOpen={(c) => setSelected(c.id)}
            extra={(c) => (c.effective_status === 'trial' ? 'La prueba gratis termina' : c.mp_status === 'authorized' ? 'Se cobra solo con Mercado Pago' : 'Pago manual pendiente')} />
        </CardContent>
      </Card>

      {trials.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5" />Pruebas gratis ({trials.length})</CardTitle></CardHeader>
          <CardContent>
            <ClientsTable rows={trials} empty="" onOpen={(c) => setSelected(c.id)}
              extra={(c) => `Termina el ${fmtDate(c.trial_ends_at)} (${Math.max(0, daysBetweenDates(data.today, c.trial_ends_at ?? data.today))} días)`} />
          </CardContent>
        </Card>
      )}

      {suspended.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5" />Suspendidos ({suspended.length})</CardTitle></CardHeader>
          <CardContent>
            <ClientsTable rows={suspended} empty="" onOpen={(c) => setSelected(c.id)} extra={(c) => c.suspension_reason ?? 'Suspendido'} />
          </CardContent>
        </Card>
      )}

      {unconfigured.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Sin facturación configurada ({unconfigured.length})</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">Estos clientes no se vencen ni se suspenden solos hasta que les actives una prueba gratis, un cobro automático o registres un pago.</p>
            <ClientsTable rows={unconfigured} empty="" onOpen={(c) => setSelected(c.id)} extra={(c) => (c.last_payment_date ? `Último pago ${fmtDate(c.last_payment_date)}` : 'Sin pagos registrados')} />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedClient} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>{selectedClient?.name}</DialogTitle></DialogHeader>
          {selectedClient && <SubscriptionPanel client={selectedClient} mpEnabled={data.mp_enabled} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

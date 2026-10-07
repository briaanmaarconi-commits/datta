import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Check, CreditCard, Download, FileText, Loader2, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATUS_BADGE, STATUS_LABELS, fmtDate, money, type EffectiveStatus } from '@/lib/billingApi';
import { callFn, downloadInvoicePdf, invoiceLabel, type DattaInvoice } from '@/lib/dattaInvoice';

interface SubscriptionInfo {
  establishment: { id: string; name: string; cuit: string | null; razon_social: string | null };
  status: EffectiveStatus;
  overdue_days: number;
  days_to_suspension: number | null;
  next_due_date: string | null;
  trial_ends_at: string | null;
  service_start_date: string | null;
  amount: number | null;
  plan: { name: string; description: string | null; features: string[] | null; price: number } | null;
  auto_debit: boolean;
  pay_url: string | null;
  payments: { id: string; amount: number; payment_method: string; period_month: number; period_year: number; payment_date: string; source: string }[];
  invoices: DattaInvoice[];
}

const METHOD: Record<string, string> = {
  mercadopago: 'Mercado Pago', transfer: 'Transferencia', cash: 'Efectivo', efectivo: 'Efectivo', transferencia: 'Transferencia',
  card: 'Tarjeta', tarjeta: 'Tarjeta', debito: 'Débito', credito: 'Crédito',
};
const period = (m: number, y: number) => `${String(m).padStart(2, '0')}/${y}`;
const daysUntil = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** Suscripción del local a Datta: plan, vencimiento, monto, pagos y facturas. */
export default function Subscription() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<string | null>(null);
  const key = ['subscription', establishmentId];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    enabled: !!establishmentId,
    queryFn: () => callFn<SubscriptionInfo>('subscription/me'),
  });

  // Factura o pago nuevo => se actualiza sola.
  useEffect(() => {
    if (!establishmentId) return;
    const channel = db
      .channel(`subscription-${establishmentId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'datta_invoices', filter: `establishment_id=eq.${establishmentId}` },
        () => queryClient.invalidateQueries({ queryKey: ['subscription', establishmentId] }))
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [establishmentId, queryClient]);

  async function download(inv: DattaInvoice) {
    setDownloading(inv.id);
    try {
      await downloadInvoicePdf(inv);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo generar el PDF');
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>No se pudo cargar tu suscripción. {(error as Error)?.message}</AlertDescription>
      </Alert>
    );
  }

  const dueDays = data.next_due_date ? daysUntil(data.next_due_date) : null;
  const invoiceByPayment = new Map(data.invoices.filter((i) => i.client_payment_id).map((i) => [i.client_payment_id!, i]));
  const features = (data.plan?.features ?? []).filter(Boolean);

  return (
    // pb: los botones flotantes (chat, calculadora) no tapan la última fila.
    <div className="space-y-6 pb-32 lg:pb-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Suscripción</h1>
        <p className="mt-1 text-muted-foreground">Tu plan de Datta, cuándo vence y las facturas que te emitimos.</p>
      </div>

      {data.status === 'past_due' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Tu suscripción está vencida hace {data.overdue_days} {data.overdue_days === 1 ? 'día' : 'días'}.
            {data.days_to_suspension != null && ` Si no se regulariza, el servicio se suspende en ${data.days_to_suspension} ${data.days_to_suspension === 1 ? 'día' : 'días'}.`}
          </AlertDescription>
        </Alert>
      )}
      {data.status === 'suspended' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>El servicio está suspendido por falta de pago. Regularizalo para volver a operar con normalidad.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CreditCard className="h-4 w-4" />Estado del servicio</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={STATUS_BADGE[data.status]} className="text-sm">{STATUS_LABELS[data.status]}</Badge>
            {data.service_start_date && <p className="text-sm text-muted-foreground">Cliente desde el {fmtDate(data.service_start_date)}</p>}
            {data.auto_debit && <p className="text-sm text-muted-foreground">Débito automático con Mercado Pago activo.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CalendarClock className="h-4 w-4" />{data.status === 'trial' ? 'Fin de la prueba gratis' : 'Próximo vencimiento'}</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">{data.next_due_date ? fmtDate(data.next_due_date) : 'Sin definir'}</div>
            {dueDays != null && (
              <p className={dueDays < 0 ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {dueDays > 1 ? `Faltan ${dueDays} días` : dueDays === 1 ? 'Vence mañana' : dueDays === 0 ? 'Vence hoy' : `Venció hace ${-dueDays} ${dueDays === -1 ? 'día' : 'días'}`}
              </p>
            )}
            {!data.next_due_date && <p className="text-sm text-muted-foreground">El equipo de Datta todavía no configuró tu facturación.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Wallet className="h-4 w-4" />Monto a pagar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{data.amount ? <>{money(data.amount)} <span className="text-sm font-normal text-muted-foreground">por mes</span></> : 'A definir'}</div>
            {data.pay_url && !data.auto_debit ? (
              <Button asChild size="sm" className="w-full"><a href={data.pay_url} target="_blank" rel="noreferrer">Pagar con Mercado Pago</a></Button>
            ) : !data.auto_debit && <p className="text-sm text-muted-foreground">Coordiná el pago con el equipo de Datta.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Tu plan{data.plan ? `: ${data.plan.name}` : ''}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.plan?.description && <p className="text-muted-foreground">{data.plan.description}</p>}
          {features.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {features.map((f) => <li key={f} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Incluye todas las funciones de Datta: mesas, pedidos, cocina, caja, facturación, stock y analíticas.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Facturas</CardTitle></CardHeader>
        <CardContent>
          {data.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay facturas emitidas. Cuando registremos tu pago, la factura aparece acá.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comprobante</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {invoiceLabel(inv)}
                        {inv.environment === 'testing' && <Badge variant="outline" className="ml-2">Prueba</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{inv.period_from ? `${inv.period_from.slice(5, 7)}/${inv.period_from.slice(0, 4)}` : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(inv.issue_date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(inv.total)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="gap-2" disabled={downloading === inv.id} onClick={() => download(inv)}>
                          {downloading === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Historial de pagos</CardTitle></CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Factura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => {
                    const inv = invoiceByPayment.get(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
                        <TableCell>{period(p.period_month, p.period_year)}</TableCell>
                        <TableCell>{METHOD[p.payment_method] ?? p.payment_method}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{money(p.amount)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {inv ? (
                            <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => download(inv)}>{invoiceLabel(inv)}</button>
                          ) : <span className="text-sm text-muted-foreground">Pendiente</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

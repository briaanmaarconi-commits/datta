import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Check, CreditCard, Download, FileText, Loader2, Receipt, Repeat, ScrollText, Upload, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { dueSchedule, shortDate } from '@/lib/billingSchedule';
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
  days_to_due: number | null;
  surcharge_pct: number;
  amount_due: number | null;
  can_upload_receipt: boolean;
  is_admin: boolean;
  plan: { name: string; description: string | null; features: string[] | null; price: number } | null;
  auto_debit: boolean;
  auto_debit_pending: boolean;
  mp_payer_email: string | null;
  pay_url: string | null;
  payments: {
    id: string; amount: number; payment_method: string; period_month: number; period_year: number; payment_date: string; source: string;
    receipt_path: string | null; surcharge_pct: number;
  }[];
  rejected: { id: string; amount: number; payment_date: string; reason: string; created_at: string }[];
  invoices: DattaInvoice[];
}

const METHOD: Record<string, string> = {
  mercadopago: 'Mercado Pago', transfer: 'Transferencia', cash: 'Efectivo', efectivo: 'Efectivo', transferencia: 'Transferencia',
  card: 'Tarjeta', tarjeta: 'Tarjeta', debito: 'Débito', credito: 'Crédito', otro: 'Otro', other: 'Otro',
};
const RECEIPT_EXTS = '.jpg,.jpeg,.png,.webp,.pdf,.heic';
const period = (m: number, y: number) => `${String(m).padStart(2, '0')}/${y}`;
const daysUntil = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** Suscripción del local a Datta: plan, vencimiento, monto, pagos y facturas. */
export default function Subscription() {
  const { establishmentId, refreshService } = useAuth();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptMethod, setReceiptMethod] = useState('transferencia');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [debitEmail, setDebitEmail] = useState('');
  const [busy, setBusy] = useState<'receipt' | 'debit' | null>(null);
  const key = ['subscription', establishmentId];

  async function uploadReceipt() {
    if (!receiptFile || !establishmentId) return;
    setBusy('receipt');
    try {
      const ext = (receiptFile.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${establishmentId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage.from('payment-receipts').upload(path, receiptFile, { contentType: receiptFile.type });
      if (upErr) throw new Error(upErr.message || 'No se pudo subir el archivo');
      await callFn('subscription/upload-receipt', { receipt_path: path, payment_method: receiptMethod, notes: receiptNotes.trim() || null });
      toast.success('¡Gracias! Registramos tu pago');
      setReceiptOpen(false);
      setReceiptFile(null);
      setReceiptNotes('');
      await refreshService();
      queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutoDebit(enable: boolean) {
    setBusy('debit');
    try {
      if (enable) {
        const r = await callFn<{ init_point: string | null }>('subscription/auto-debit', { payer_email: debitEmail.trim() });
        if (r.init_point) window.location.href = r.init_point;
      } else {
        await callFn('subscription/cancel-auto-debit');
        toast.success('Débito automático desactivado');
        await refreshService();
      }
      queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

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

  // días al vencimiento según la fecha de Argentina (la calcula el servidor); vencido = negativo
  const dueDays = data.days_to_due ?? (data.overdue_days > 0 ? -data.overdue_days : data.next_due_date ? daysUntil(data.next_due_date) : null);
  const invoiceByPayment = new Map(data.invoices.filter((i) => i.client_payment_id).map((i) => [i.client_payment_id!, i]));
  const features = (data.plan?.features ?? []).filter(Boolean);

  return (
    // pb: los botones flotantes (chat, calculadora) no tapan la última fila.
    <div className="space-y-6 pb-32 lg:pb-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Suscripción</h1>
        <p className="mt-1 text-muted-foreground">Tu plan de Datta, cuándo vence y las facturas que te emitimos.</p>
      </div>

      {data.rejected.map((r) => (
        <Alert key={r.id} variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            El comprobante de {money(r.amount)} que subiste el {fmtDate(r.payment_date)} fue rechazado: {r.reason}. La cuota sigue pendiente.
          </AlertDescription>
        </Alert>
      ))}
      {data.status === 'past_due' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Tu suscripción está vencida hace {data.overdue_days} {data.overdue_days === 1 ? 'día' : 'días'}
            {data.surcharge_pct > 0 ? ` y lleva ${data.surcharge_pct}% de recargo` : ''}.
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
            {data.can_upload_receipt && data.amount_due != null ? (
              <div>
                <div className="text-2xl font-bold">{money(data.amount_due)}</div>
                <p className="text-sm text-muted-foreground">
                  {data.surcharge_pct > 0 ? `Incluye ${data.surcharge_pct}% de recargo por atraso (base ${money(data.amount)})` : 'Monto de esta cuota'}
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold">{data.amount ? <>{money(data.amount)} <span className="text-sm font-normal text-muted-foreground">por mes</span></> : 'A definir'}</div>
            )}
            {data.auto_debit ? (
              <p className="text-sm text-muted-foreground">Se debita automáticamente con Mercado Pago.</p>
            ) : data.can_upload_receipt ? (
              data.is_admin
                ? <Button size="sm" className="w-full gap-2" onClick={() => setReceiptOpen(true)}><Upload className="h-4 w-4" />Subir comprobante de pago</Button>
                : <p className="text-sm text-muted-foreground">El administrador del local sube el comprobante de pago.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Podés pagar desde una semana antes del vencimiento.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" />Condiciones de pago</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              La suscripción se paga por mes. Al terminar la prueba gratis empieza el primer mes. Una semana antes de cada vencimiento te avisamos en Caja y en Administración.
            </p>
            {(() => {
              const s = data.next_due_date ? dueSchedule(data.next_due_date) : null;
              const d = (x?: string) => (x ? ` (${shortDate(x)})` : '');
              const rows: [string, string][] = [
                [`Vencimiento${d(s?.due)}`, 'Pagás el monto del mes'],
                [`Primera semana de atraso${s ? ` (hasta el ${shortDate(s.noSurchargeUntil)})` : ''}`, 'Sin recargo'],
                [`Segunda semana${s ? ` (hasta el ${shortDate(s.plus10Until)})` : ''}`, '+10%'],
                [`Tercera semana${s ? ` (hasta el ${shortDate(s.plus20Until)})` : ''}`, '+20%'],
                [`Después${d(s?.suspendOn)}`, 'Se suspende el servicio hasta regularizar'],
              ];
              return (
                <ul className="divide-y rounded-md border">
                  {rows.map(([when, what]) => (
                    <li key={when} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>{when}</span><span className="text-right font-medium">{what}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <p className="text-muted-foreground">
              El recargo se calcula sobre el precio del mes. Al subir el comprobante, el pago queda registrado al instante; si el comprobante no corresponde, el equipo de Datta lo puede rechazar y la cuota vuelve a quedar pendiente.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Repeat className="h-5 w-5" />Débito automático</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Con el débito automático, Mercado Pago cobra la cuota solo el día del vencimiento, con la tarjeta que elijas. No tenés que subir comprobantes.
            </p>
            {data.auto_debit ? (
              <>
                <Badge>Activo{data.mp_payer_email ? ` · ${data.mp_payer_email}` : ''}</Badge>
                {data.is_admin && (
                  <Button size="sm" variant="outline" disabled={busy === 'debit'} onClick={() => toggleAutoDebit(false)}>Desactivar débito automático</Button>
                )}
              </>
            ) : data.is_admin ? (
              <div className="space-y-2">
                {data.auto_debit_pending && (
                  <p className="text-amber-700">
                    Generaste el débito pero falta autorizar la tarjeta en Mercado Pago.{' '}
                    {data.pay_url && <a href={data.pay_url} className="font-medium underline" target="_blank" rel="noreferrer">Terminar de autorizar</a>}
                  </p>
                )}
                {data.auto_debit_pending ? (
                  <Button size="sm" variant="outline" disabled={busy === 'debit'} onClick={() => toggleAutoDebit(false)}>Cancelar y empezar de nuevo</Button>
                ) : (
                  <>
                    <Label htmlFor="debit-email">Email de tu cuenta de Mercado Pago</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input id="debit-email" type="email" value={debitEmail} onChange={(e) => setDebitEmail(e.target.value)} placeholder="tu@email.com" />
                      <Button size="sm" className="shrink-0" disabled={!/^\S+@\S+\.\S+$/.test(debitEmail) || busy === 'debit'} onClick={() => toggleAutoDebit(true)}>
                        {busy === 'debit' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Activar'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Te llevamos a Mercado Pago para autorizar la tarjeta una sola vez.</p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No está activo. Lo puede activar el administrador del local.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Subir comprobante de pago</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              Monto a pagar hoy: <strong>{money(data.amount_due)}</strong>
              {data.surcharge_pct > 0 && <span className="text-muted-foreground"> (incluye {data.surcharge_pct}% de recargo)</span>}
            </div>
            <div className="space-y-2">
              <Label>Medio de pago</Label>
              <Select value={receiptMethod} onValueChange={setReceiptMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-file">Comprobante (foto o PDF)</Label>
              <Input id="receipt-file" type="file" accept={RECEIPT_EXTS} onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-notes">Nota (opcional)</Label>
              <Textarea id="receipt-notes" value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder="Ej: transferencia desde la cuenta de…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>Cancelar</Button>
            <Button disabled={!receiptFile || busy === 'receipt'} onClick={uploadReceipt} className="gap-2">
              {busy === 'receipt' && <Loader2 className="h-4 w-4 animate-spin" />}Enviar comprobante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        <TableCell>
                          {METHOD[p.payment_method] ?? p.payment_method}
                          {p.source === 'receipt' && <span className="ml-1 text-xs text-muted-foreground">(comprobante)</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {money(p.amount)}
                          {p.surcharge_pct > 0 && <span className="ml-1 text-xs text-muted-foreground">+{p.surcharge_pct}%</span>}
                        </TableCell>
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

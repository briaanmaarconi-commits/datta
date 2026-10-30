import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarClock, CreditCard, FileText, Hourglass, Mail, MapPin, Pencil, Phone, Trash2, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/db';
import { billing, fmtDate, money, STATUS_BADGE, STATUS_LABELS, type BillingOverview } from '@/lib/billingApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SubscriptionPanel from '@/components/superadmin/SubscriptionPanel';
import ClientFormDialog from '@/components/superadmin/ClientFormDialog';
import ClientUsersPanel, { useClientUsers } from '@/components/superadmin/ClientUsersPanel';
import DeleteClientDialog from '@/components/superadmin/DeleteClientDialog';

const PAYMENT_METHODS: Record<string, string> = {
  transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta', check: 'Cheque', mercadopago: 'Mercado Pago', other: 'Otro',
  transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro',
};
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAY = 86_400_000;

const toDate = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d);
const daysUntil = (d: string) => Math.ceil((toDate(d).getTime() - Date.now()) / DAY);

/** "2 años y 3 meses", "5 meses", "12 días". */
function seniority(since: string | null) {
  if (!since) return '—';
  const start = toDate(since);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY));
    return `${days} ${days === 1 ? 'día' : 'días'}`;
  }
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [y && `${y} ${y === 1 ? 'año' : 'años'}`, m && `${m} ${m === 1 ? 'mes' : 'meses'}`].filter(Boolean);
  return parts.join(' y ');
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value || '—'}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'warn' | 'bad' }) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <p className={`text-xl font-bold ${tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const yesNo = (v: boolean) => (v ? <Badge variant="default">Activado</Badge> : <Badge variant="outline">Apagado</Badge>);

export default function SuperAdminClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  const qc = useQueryClient();

  async function rejectReceipt() {
    if (!rejecting) return;
    setRejectBusy(true);
    try {
      await billing('reject-receipt', { payment_id: rejecting.id, reason: rejectReason.trim() });
      toast.success('Comprobante rechazado');
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ['sa-client-payments', id] });
      qc.invalidateQueries({ queryKey: ['billing-overview'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRejectBusy(false);
    }
  }

  const { data: est, isLoading } = useQuery({
    queryKey: ['sa-client', id],
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('*, client_plans(name, price)').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['sa-client-payments', id],
    queryFn: async () => {
      const { data, error } = await db.from('client_payments').select('*').eq('establishment_id', id).order('payment_date', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: overview } = useQuery({ queryKey: ['billing-overview'], queryFn: () => billing<BillingOverview>('overview') });
  const { data: users = [] } = useClientUsers(id);
  const sub = overview?.clients.find((c) => c.id === id) ?? null;

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!est) return (
    <div className="space-y-4">
      <p>No se encontró el cliente.</p>
      <Button variant="outline" asChild><Link to="/superadmin/clients"><ArrowLeft className="h-4 w-4 mr-1" />Volver a Clientes</Link></Button>
    </div>
  );

  const status = sub?.effective_status ?? est.service_status;
  const since = est.service_start_date ?? est.created_at;
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const owner = users.find((u: any) => u.role === 'admin') as any;

  // Tarjeta de "vencimiento": en prueba muestra cuándo termina; si no, el próximo pago.
  let dueCard: { label: string; value: string; hint: string; tone?: 'warn' | 'bad' };
  if (status === 'trial' && sub?.trial_ends_at) {
    const d = daysUntil(sub.trial_ends_at);
    dueCard = { label: 'Fin de la prueba gratis', value: fmtDate(sub.trial_ends_at), hint: d > 0 ? `Faltan ${d} ${d === 1 ? 'día' : 'días'}` : 'Termina hoy', tone: d <= 3 ? 'warn' : undefined };
  } else if (sub?.billing_configured && sub.next_due_date) {
    const d = daysUntil(sub.next_due_date);
    dueCard = {
      label: 'Próximo vencimiento',
      value: fmtDate(sub.next_due_date),
      hint: status === 'past_due' ? `Vencido hace ${sub.overdue_days} días` : d >= 0 ? `En ${d} ${d === 1 ? 'día' : 'días'}` : `Hace ${-d} días`,
      tone: status === 'past_due' || status === 'suspended' ? 'bad' : d <= 5 ? 'warn' : undefined,
    };
  } else {
    dueCard = { label: 'Próximo vencimiento', value: 'Sin configurar', hint: 'Activá una prueba o registrá un pago' };
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate('/superadmin/clients')}><ArrowLeft className="h-4 w-4" />Clientes</Button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {est.logo_url
            ? <img src={est.logo_url} alt="" className="h-14 w-14 rounded-lg object-cover border" />
            : <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center"><Building2 className="h-7 w-7 text-muted-foreground" /></div>}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{est.name}</h1>
              <Badge variant={STATUS_BADGE[status] ?? 'secondary'}>{STATUS_LABELS[status] ?? status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{[est.address, est.city].filter(Boolean).join(', ') || 'Sin dirección cargada'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />Editar datos</Button>
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Eliminar</Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat icon={CreditCard} label="Plan" value={est.client_plans?.name ?? 'Sin plan'} hint={est.client_plans ? `Precio de lista ${money(est.client_plans.price)}` : undefined} />
        <Stat icon={Wallet} label="Paga por mes" value={money(sub?.agreed_price ?? est.agreed_price)} hint={sub?.last_payment_date ? `Último pago ${fmtDate(sub.last_payment_date)}` : 'Sin pagos todavía'} />
        <Stat icon={status === 'trial' ? Hourglass : CalendarClock} label={dueCard.label} value={dueCard.value} hint={dueCard.hint} tone={dueCard.tone} />
        <Stat icon={CalendarClock} label="Antigüedad" value={seniority(since)} hint={`Cliente desde ${fmtDate(since)}`} />
      </div>

      <Tabs defaultValue="datos">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1"><Users className="h-4 w-4" />Usuarios ({users.length})</TabsTrigger>
          <TabsTrigger value="suscripcion">Suscripción</TabsTrigger>
          <TabsTrigger value="pagos">Pagos ({payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Contacto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Dueño / admin" value={owner ? (owner.profiles?.full_name || owner.profiles?.email) : null} />
              <Field label="Teléfono" value={est.contact_phone && <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${est.contact_phone}`}><Phone className="h-3.5 w-3.5" />{est.contact_phone}</a>} />
              <Field label="Email" value={est.contact_email && <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${est.contact_email}`}><Mail className="h-3.5 w-3.5" />{est.contact_email}</a>} />
              <Field label="Ciudad" value={est.city} />
              <div className="col-span-2"><Field label="Dirección" value={est.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{est.address}</span>} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Cuenta</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Alta en Datta" value={fmtDate(est.created_at)} />
              <Field label="Inicio del servicio" value={fmtDate(est.service_start_date)} />
              <Field label="Configuración inicial" value={est.onboarded_at ? `Completa (${fmtDate(est.onboarded_at)})` : 'Pendiente'} />
              <Field label="Total cobrado" value={money(totalPaid)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Datos fiscales</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Razón social" value={est.razon_social} />
              <Field label="CUIT" value={est.cuit} />
              <Field label="Condición IVA" value={est.condicion_iva} />
              <Field label="Ingresos brutos" value={est.iibb} />
              <Field label="Inicio de actividades" value={est.inicio_actividades && fmtDate(est.inicio_actividades)} />
              <Field label="Punto de venta" value={est.punto_venta_afip} />
              <div className="col-span-2"><Field label="Domicilio comercial" value={est.domicilio_comercial} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Módulos</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span>Delivery (Rappi / PedidosYa)</span>{yesNo(!!est.delivery_enabled)}</div>
              {est.delivery_enabled && <p className="text-xs text-muted-foreground -mt-2">Comisión Rappi {Number(est.rappi_commission || 0)}% · PedidosYa {Number(est.peya_commission || 0)}%</p>}
              <div className="flex items-center justify-between gap-2"><span>Bebidas por la comandera de caja</span>{yesNo(!!est.drinks_print_at_cashier)}</div>
              <div className="flex items-center justify-between gap-2"><span>Avisos al celular del mozo</span>{yesNo(!!est.waiter_push_enabled)}</div>
              <div className="flex items-center justify-between gap-2"><span>Lector de facturas con IA</span>{yesNo(!!est.ai_invoice_reader)}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios">
          <Card><CardContent className="pt-6"><ClientUsersPanel establishmentId={id} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="suscripcion">
          <Card>
            <CardContent className="pt-6">
              {sub && overview ? <SubscriptionPanel key={sub.id} client={sub} mpEnabled={overview.mp_enabled} /> : <p className="text-sm text-muted-foreground">Cargando…</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagos">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Comprobante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.period_month ? `${MONTH_NAMES[p.period_month - 1]} ${p.period_year}` : '—'}</TableCell>
                      <TableCell className="font-medium">
                        {money(p.amount)}
                        {p.surcharge_pct > 0 && <span className="ml-1 text-xs text-muted-foreground">(+{p.surcharge_pct}%)</span>}
                      </TableCell>
                      <TableCell>{PAYMENT_METHODS[p.payment_method] || p.payment_method}</TableCell>
                      <TableCell>{fmtDate(p.payment_date)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.notes || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.source === 'receipt' && p.receipt_path ? (
                          <div className="flex items-center gap-2">
                            <a href={`/files/payment-receipts/${p.receipt_path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                              <FileText className="h-3.5 w-3.5" />Ver
                            </a>
                            <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => { setRejecting(p); setRejectReason(''); }}>
                              Rechazar
                            </Button>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin pagos registrados. Se registran desde la pestaña Suscripción.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={est} />
      <DeleteClientDialog client={deleting ? { id: est.id, name: est.name } : null} onClose={() => setDeleting(false)} onDeleted={() => navigate('/superadmin/clients')} />

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar comprobante</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se borra el pago de {rejecting && money(rejecting.amount)} y el local vuelve a tener la cuota pendiente, con su vencimiento anterior. El motivo lo ve el restaurante en Suscripción.
          </p>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: el comprobante no corresponde, el monto no coincide…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={rejectReason.trim().length < 3 || rejectBusy} onClick={rejectReceipt}>Rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
